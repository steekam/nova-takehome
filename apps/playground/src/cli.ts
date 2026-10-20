import './telemetry.js'
import { SeverityNumber } from '@opentelemetry/api-logs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { lessonTiming, outputSchema } from './prompt.js'
import { reviewOutputSchema, runReview, runReviewPlanVersion } from './review.js'
import type { ReviewRunReport } from './review.js'
import { runGeneration } from './runner.js'
import { publishGenerationPrompts } from './langfuse-prompts.js'
import { currentTraceId, emitTelemetryLog, recordDatasetItemCount, recordEvaluationScores, recordPlaygroundCommand, recordPlaygroundCost, recordPlaygroundFailure, reportNumericScores, shutdownTelemetry, withSpan } from './telemetry.js'
import { runRetrievalEvaluation } from './retrieval-eval.js'
import { runReviewEvaluation } from './review-eval.js'
import type { ReviewEvaluationReport } from './review-eval.js'
import { datasetItemsToJsonl, generationRunsToDatasetItems, reviewEvaluationReportsToDatasetItems, summarizeCosts, syncLangfuseDataset } from './dataset-tools.js'
import type { DatasetItem } from './dataset-tools.js'
import { modelLabel } from './domain.js'
import type { RunReport } from './domain.js'
import { CorpusDataSchema, FIXTURE_IDS } from './corpus.js'
import type { FixtureId } from './corpus.js'
import { createTeacherPlan, editTeacherPlan, getPlan, importGeneratedPlan, listPlans, publishSubmittedPlan, returnSubmittedPlan, submitTeacherPlan } from './workflow.js'
import type { Plan } from './workflow.js'
import { failureDetails, writeCommandFailureReport } from './failure-report.js'

async function readLocalReports(): Promise<{ generations: RunReport[]; reviews: ReviewRunReport[]; reviewEvaluations: ReviewEvaluationReport[] }> {
  const reportDirectories = [
    path.resolve(process.env.PLAYGROUND_REPORTS_DIR ?? '.cache/playground/runs'),
    path.resolve('.cache/playground/review-evals'),
  ]
  const generations: RunReport[] = []
  const reviews: ReviewRunReport[] = []
  const reviewEvaluations: ReviewEvaluationReport[] = []
  for (const reportsDir of reportDirectories) {
    let filenames: string[]
    try {
      filenames = (await readdir(reportsDir)).filter((filename) => filename.endsWith('.json'))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
      throw error
    }
    for (const filename of filenames) {
      const value: unknown = JSON.parse(await readFile(path.join(reportsDir, filename), 'utf8'))
      if (typeof value !== 'object' || value === null || !('schemaVersion' in value)) continue
      if (value.schemaVersion === 'playground-run-v10') generations.push(value as RunReport)
      if (value.schemaVersion === 'playground-review-run-v2' || value.schemaVersion === 'playground-review-run-v3') reviews.push(value as ReviewRunReport)
      if (value.schemaVersion === 'playground-review-eval-v3') reviewEvaluations.push(value as ReviewEvaluationReport)
    }
  }
  return { generations, reviews, reviewEvaluations }
}

function printCostSummary(reports: Array<RunReport | ReviewRunReport | ReviewEvaluationReport>, asJson: boolean): void {
  const summary = summarizeCosts(reports)
  if (asJson) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    return
  }
  if (!summary.length) {
    process.stdout.write('No supported generation or review reports found.\n')
    return
  }
  for (const row of summary) {
    process.stdout.write(`${row.stage} · ${row.provider} · ${row.model} · ${row.successfulCallCount}/${row.callCount} calls returned output · reported $${row.reportedCostUsd.toFixed(6)} (${row.reportedCostCount} calls) · estimated $${row.estimatedCostUsd.toFixed(6)} (${row.estimatedCostCount} calls) · missing ${row.missingCostCount} · non-billable ${row.notApplicableCostCount}\n`)
  }
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

async function readPlanContent(filePath: string | undefined): Promise<unknown> {
  if (!filePath) throw new Error('--content requires a JSON file path.')
  return JSON.parse(await readFile(path.resolve(filePath), 'utf8'))
}

async function emitPlanWorkflowTelemetry(action: string, plan: Plan): Promise<void> {
  const version = plan.versions.find(({ versionId }) => versionId === plan.currentVersionId)
  const failedCodes = version?.verification.checks.filter(({ passed }) => !passed).map(({ code }) => code) ?? []
  await withSpan(`playground.plan.${action}`, {
    'playground.plan.id': plan.planId,
    'playground.plan.action': action,
    'playground.plan.fixture_id': plan.fixtureId,
    'playground.plan.target_id': plan.targetId,
    'playground.plan.status': plan.status,
    'playground.plan.version_number': version?.versionNumber ?? 0,
    'playground.plan.qa_passed': version?.verification.passed ?? false,
    'playground.plan.qa_failed_count': failedCodes.length,
  }, async (span) => {
    recordEvaluationScores([{
      name: 'plan_deterministic_qa_passed',
      value: version?.verification.passed ? 1 : 0,
      attributes: { suite: 'authoring', target: plan.targetId, status: plan.status, live: false },
    }])
    const context = span.spanContext()
    const score = await reportNumericScores({
      traceId: context.traceId,
      observationId: context.spanId,
      scores: [{
        name: 'plan_deterministic_qa_passed',
        value: version?.verification.passed ? 1 : 0,
        comment: `fixture=${plan.fixtureId}; target=${plan.targetId}; version=${version?.versionNumber ?? 0}; failed_checks=${failedCodes.join(',')}`,
      }],
    })
    span.setAttribute('playground.plan.langfuse_score_delivery', score.status)
    emitTelemetryLog('playground plan workflow completed', version?.verification.passed ? SeverityNumber.INFO : SeverityNumber.WARN, {
      'playground.event': 'plan_workflow.completed',
      'playground.plan.id': plan.planId,
      'playground.plan.action': action,
      'playground.plan.fixture_id': plan.fixtureId,
      'playground.plan.target_id': plan.targetId,
      'playground.plan.status': plan.status,
      'playground.plan.version_number': version?.versionNumber ?? 0,
      'playground.plan.qa_passed': version?.verification.passed ?? false,
      'playground.plan.qa_failed_codes': failedCodes.join(','),
      'playground.plan.langfuse_score_delivery': score.status,
    })
  })
}

async function printPlanResult(action: string, plan: Plan, traceId?: string): Promise<void> {
  await emitPlanWorkflowTelemetry(action, plan)
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
  if (traceId && !/^0+$/.test(traceId)) process.stdout.write(`Trace ID: ${traceId}\n`)
}

function printReviewResult(report: ReviewRunReport): void {
  const findingCount = report.review?.findings.length ?? 0
  const cost = report.reportedCostUsd ?? report.estimatedCost?.usd
  const model = modelLabel(report.candidate, report.attempts.find((attempt) => attempt.responseModel)?.responseModel)
  if (cost !== undefined) recordPlaygroundCost(cost, { stage: 'review', provider: report.candidate.provider, model, kind: report.reportedCostUsd === undefined ? 'estimated' : 'reported' })
  emitTelemetryLog('playground review completed', report.status === 'evaluated' ? SeverityNumber.INFO : SeverityNumber.WARN, {
    'playground.event': 'review.completed',
    'playground.review.run_id': report.runId,
    'playground.review.source_type': report.sourceType ?? 'generation_run',
    ...(report.sourceRunId ? { 'playground.source_run_id': report.sourceRunId } : {}),
    ...(report.sourcePlanId ? { 'playground.source_plan_id': report.sourcePlanId } : {}),
    'playground.plan_version_id': report.planVersionId,
    'playground.review.status': report.status,
    'playground.review.finding_count': findingCount,
    'playground.judge.score_delivery': report.judgeScoreDelivery.status,
    'playground.elapsed_ms': report.elapsedMs,
    ...(cost === undefined ? {} : { 'playground.cost.usd': cost }),
    ...(report.errorCode === undefined ? {} : { 'error.code': report.errorCode }),
  })
  process.stdout.write(`${report.candidate.displayName}: ${report.status} · ${findingCount} findings${cost === undefined ? '' : ` · $${cost.toFixed(6)}`} · ${report.elapsedMs}ms\n`)
  if (report.errorCode) process.stdout.write(`  ${report.errorCode}: ${report.errorMessage}\n`)
  process.stdout.write(`Review report: ${path.resolve(process.env.PLAYGROUND_REPORTS_DIR ?? '.cache/playground/runs', `${report.runId}.json`)}\n`)
  if (report.traceId) process.stdout.write(`Trace ID: ${report.traceId}\n`)
  process.stdout.write(`Langfuse judge scores: ${report.judgeScoreDelivery.status}${report.judgeScoreDelivery.message ? ` · ${report.judgeScoreDelivery.message}` : ''}\n`)
  if (report.status !== 'evaluated') process.exitCode = 1
}

async function runCommand(traceId?: string): Promise<void> {
  const cliArgs = process.argv.slice(2)
  if (cliArgs[0] === '--') cliArgs.shift()
  const [command = 'generate', ...args] = cliArgs
  if (command === 'help' || command === '--help' || command === '-h' || args.includes('--help') || args.includes('-h')) {
    process.stdout.write('Usage: pnpm playground -- [generate [--target particles|changes] [--duration 30|35|40|45|50|55|60] [--live] [--model deepseek|glm] [--via-litellm] | review <run-id-or-json-path> [--live] [--via-litellm] | plans import|author|edit|submit|return|publish|show|list ... | retrieval-eval [--mock] | review-eval [--live] [--via-litellm] | dataset export [--review-evals] [--sync] | costs [--json] | prompts publish | schema]\n')
    return
  }
  if (command === 'plans') {
    const [action, planId] = args
    if (action === 'import') {
      if (!planId) throw new Error('Usage: pnpm playground -- plans import <run-id-or-json-path> --owner <teacher-id> [--candidate <candidate-id>]')
      const ownerId = optionValue(args, '--owner')
      if (!ownerId) throw new Error('--owner requires the teacher owner ID.')
      const reportsDir = path.resolve(process.env.PLAYGROUND_REPORTS_DIR ?? '.cache/playground/runs')
      const reportPath = planId.endsWith('.json') || planId.includes(path.sep) ? path.resolve(planId) : path.join(reportsDir, `${planId}.json`)
      let report: unknown
      try {
        report = JSON.parse(await readFile(reportPath, 'utf8')) as unknown
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw new Error(`GENERATION_REPORT_NOT_FOUND: No generation report found at ${reportPath}.`)
        if (error instanceof SyntaxError) throw new Error(`GENERATION_REPORT_INVALID: ${reportPath} is not valid JSON.`)
        throw error
      }
      const plan = await importGeneratedPlan({ report, ownerId, candidateId: optionValue(args, '--candidate') })
      await printPlanResult(action, plan, traceId)
      return
    }
    if (action === 'author') {
      const target = optionValue(args, '--target')
      if (!target || !FIXTURE_IDS.includes(target as FixtureId)) throw new Error(`Choose --target ${FIXTURE_IDS.join('|')}.`)
      const ownerId = optionValue(args, '--owner')
      if (!ownerId) throw new Error('--owner requires the teacher owner ID.')
      const plan = await createTeacherPlan({ fixtureId: target as FixtureId, ownerId, content: await readPlanContent(optionValue(args, '--content')) })
      await printPlanResult(action, plan, traceId)
      return
    }
    if (action === 'edit') {
      if (!planId) throw new Error('Usage: pnpm playground -- plans edit <plan-id> --owner <teacher-id> --content <json-file>')
      const ownerId = optionValue(args, '--owner')
      if (!ownerId) throw new Error('--owner requires the teacher owner ID.')
      const plan = await editTeacherPlan({ planId, ownerId, content: await readPlanContent(optionValue(args, '--content')) })
      await printPlanResult(action, plan, traceId)
      return
    }
    if (action === 'submit') {
      if (!planId) throw new Error('Usage: pnpm playground -- plans submit <plan-id> --owner <teacher-id>')
      const ownerId = optionValue(args, '--owner')
      if (!ownerId) throw new Error('--owner requires the teacher owner ID.')
      await printPlanResult(action, await submitTeacherPlan({ planId, ownerId }), traceId)
      return
    }
    if (action === 'return') {
      if (!planId) throw new Error('Usage: pnpm playground -- plans return <plan-id> --lead <lead-id> --comment <reason>')
      const leadId = optionValue(args, '--lead')
      const comment = optionValue(args, '--comment')
      if (!leadId) throw new Error('--lead requires the Curriculum Lead ID.')
      if (!comment) throw new Error('--comment requires the return reason.')
      await printPlanResult(action, await returnSubmittedPlan({ planId, leadId, comment }), traceId)
      return
    }
    if (action === 'publish') {
      if (!planId) throw new Error('Usage: pnpm playground -- plans publish <plan-id> --lead <lead-id>')
      const leadId = optionValue(args, '--lead')
      if (!leadId) throw new Error('--lead requires the Curriculum Lead ID.')
      await printPlanResult(action, await publishSubmittedPlan({ planId, leadId }), traceId)
      return
    }
    if (action === 'review') {
      if (!planId) throw new Error('Usage: pnpm playground -- plans review <plan-id> [--version <version-id>] [--live] [--via-litellm]')
      const viaLitellm = args.includes('--via-litellm')
      if (viaLitellm && !args.includes('--live')) throw new Error('--via-litellm requires --live.')
      printReviewResult(await runReviewPlanVersion(planId, optionValue(args, '--version'), args.includes('--live'), traceId, viaLitellm))
      return
    }
    if (action === 'show') {
      if (!planId) throw new Error('Usage: pnpm playground -- plans show <plan-id>')
      process.stdout.write(`${JSON.stringify(await getPlan(planId), null, 2)}\n`)
      return
    }
    if (action === 'list') {
      const plans = await listPlans()
      process.stdout.write(`${JSON.stringify(plans.map(({ planId, ownerId, targetId, fixtureId, status, currentVersionId, versions, publishedVersionId }) => ({
        planId, ownerId, targetId, fixtureId, status, currentVersionId, versionCount: versions.length, publishedVersionId,
      })), null, 2)}\n`)
      return
    }
    throw new Error('Usage: pnpm playground -- plans import|author|edit|review|submit|return|publish|show|list ...')
  }
  if (command === 'schema') {
    const schemas = [
      ['lesson-content.schema.json', outputSchema],
      ['review-report.schema.json', reviewOutputSchema],
      ['cbc-corpus.schema.json', z.toJSONSchema(CorpusDataSchema)],
    ] as const
    await mkdir(path.resolve('.cache/playground/schemas'), { recursive: true })
    for (const [filename, schema] of schemas) {
      const schemaPath = path.resolve('.cache/playground/schemas', filename)
      await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`)
      process.stdout.write(`${schemaPath}\n`)
    }
    return
  }
  if (command === 'retrieval-eval') {
    const report = await withSpan('playground.eval.retrieval', {
      'playground.eval.live': !args.includes('--mock'),
      'playground.eval.label_set': 'cbc-retrieval-v1',
    }, async (span) => {
      const report = await runRetrievalEvaluation(args.includes('--mock') ? 'mock' : 'local')
      const primary = report.profiles.find(({ representation }) => representation === 'title-kind-clean-content') ?? report.profiles[0]
      span.setAttributes({
        'playground.embedding.model': report.model,
        'playground.embedding.model_revision': report.modelRevision,
        'playground.embedding.cache_hits': report.cacheHits,
        'playground.embedding.cache_misses': report.cacheMisses,
        'playground.embedding.model_load_ms': report.modelLoadMs,
        'playground.embedding.model_pipeline_cache_hits': report.modelPipelineCacheHits,
        'playground.eval.query_count': primary?.cases.length ?? 0,
        'playground.eval.profile_count': report.profiles.length,
        'playground.eval.elapsed_ms': report.elapsedMs,
      })
      for (const profile of report.profiles) {
        span.setAttribute(`playground.eval.${profile.representation}.ndcg_at_3`, profile.rankingMetrics.meanNdcgAt3)
        span.setAttribute(`playground.eval.${profile.representation}.grade2_hit_at_1`, profile.rankingMetrics.meanGrade2HitAt1)
        span.setAttribute(`playground.eval.${profile.representation}.grade2_recall_at_3`, profile.rankingMetrics.meanGrade2RecallAt3)
      }
      const context = span.spanContext()
      const traceId = /^0+$/.test(context.traceId) ? undefined : context.traceId
      const observationId = /^0+$/.test(context.spanId) ? undefined : context.spanId
      const scores = (args.includes('--mock') ? [] : report.profiles.flatMap((profile) => [
        { name: `retrieval_${profile.representation}_ndcg_at_3`, value: profile.rankingMetrics.meanNdcgAt3, comment: `label_set=cbc-retrieval-v1; model=${report.model}; revision=${report.modelRevision}` },
        { name: `retrieval_${profile.representation}_grade2_hit_at_1`, value: profile.rankingMetrics.meanGrade2HitAt1, comment: `label_set=cbc-retrieval-v1; model=${report.model}; revision=${report.modelRevision}` },
        { name: `retrieval_${profile.representation}_grade2_recall_at_3`, value: profile.rankingMetrics.meanGrade2RecallAt3, comment: `label_set=cbc-retrieval-v1; model=${report.model}; revision=${report.modelRevision}` },
      ]))
      recordEvaluationScores(report.profiles.flatMap((profile) => [
        { name: 'ndcg_at_3', value: profile.rankingMetrics.meanNdcgAt3, attributes: { representation: profile.representation, model: report.model, model_revision: report.modelRevision } },
        { name: 'grade2_hit_at_1', value: profile.rankingMetrics.meanGrade2HitAt1, attributes: { representation: profile.representation, model: report.model, model_revision: report.modelRevision } },
        { name: 'grade2_recall_at_3', value: profile.rankingMetrics.meanGrade2RecallAt3, attributes: { representation: profile.representation, model: report.model, model_revision: report.modelRevision } },
      ]))
      const scoreDelivery = await reportNumericScores({ traceId, observationId, scores })
      span.setAttribute('playground.eval.langfuse_score_delivery', scoreDelivery.status)
      return { ...report, traceId, scoreDelivery }
    })
    const reportDirectory = path.resolve('.cache/playground/retrieval-evals')
    await mkdir(reportDirectory, { recursive: true })
    const reportPath = path.join(reportDirectory, `${Date.now()}.json`)
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    for (const profile of report.profiles) {
      process.stdout.write(`${report.model}@${report.modelRevision} · ${profile.representation}: nDCG@3 ${profile.rankingMetrics.meanNdcgAt3} · grade-2 Hit@1 ${profile.rankingMetrics.meanGrade2HitAt1} · grade-2 Recall@3 ${profile.rankingMetrics.meanGrade2RecallAt3} · top6 grade-2 coverage ${profile.policyComparison.top6.meanGrade2PolicyCoverage} · top8 grade-2 coverage ${profile.policyComparison.top8.meanGrade2PolicyCoverage}\n`)
      for (const result of profile.cases) process.stdout.write(`  ${result.id}: nDCG@3 ${result.rankingMetrics.ndcgAt3} · grade-2 Hit@1 ${result.rankingMetrics.grade2HitAt1} · grade-2 Recall@3 ${result.rankingMetrics.grade2RecallAt3}\n`)
    }
    for (const profile of report.rankerComparison) {
      process.stdout.write(`${profile.ranker}: nDCG@3 ${profile.rankingMetrics.meanNdcgAt3} · grade-2 Hit@1 ${profile.rankingMetrics.meanGrade2HitAt1} · grade-2 Recall@3 ${profile.rankingMetrics.meanGrade2RecallAt3}\n`)
      for (const result of profile.cases) process.stdout.write(`  ${result.id}: nDCG@3 ${result.rankingMetrics.ndcgAt3} · grade-2 Hit@1 ${result.rankingMetrics.grade2HitAt1} · grade-2 Recall@3 ${result.rankingMetrics.grade2RecallAt3}\n`)
    }
    emitTelemetryLog('playground retrieval evaluation completed', SeverityNumber.INFO, {
      'playground.event': 'retrieval_eval.completed',
      'playground.embedding.model': report.model,
      'playground.embedding.model_revision': report.modelRevision,
      'playground.eval.query_count': report.profiles[0]?.cases.length ?? 0,
      'playground.eval.profile_count': report.profiles.length,
      'playground.eval.cache_hits': report.cacheHits,
      'playground.eval.cache_misses': report.cacheMisses,
      'playground.eval.model_load_ms': report.modelLoadMs,
      'playground.eval.model_pipeline_cache_hits': report.modelPipelineCacheHits,
      'playground.eval.elapsed_ms': report.elapsedMs,
      'playground.eval.langfuse_score_delivery': report.scoreDelivery.status,
    })
    process.stdout.write(`Langfuse evaluation scores: ${report.scoreDelivery.status}${report.scoreDelivery.message ? ` · ${report.scoreDelivery.message}` : ''}\n`)
    process.stdout.write(`Embedding: model load ${report.modelLoadMs}ms · warm pipeline reuses ${report.modelPipelineCacheHits} · vector cache ${report.cacheHits} hits/${report.cacheMisses} misses · total ${report.elapsedMs}ms\n`)
    if (report.traceId) process.stdout.write(`Trace ID: ${report.traceId}\n`)
    process.stdout.write(`Evaluation report: ${reportPath}\n`)
    return
  }
  if (command === 'prompts') {
    if (args[0] !== 'publish') {
      process.stderr.write('Usage: pnpm playground -- prompts publish\n')
      process.exitCode = 2
      return
    }
    const published = await publishGenerationPrompts()
    for (const prompt of published) process.stdout.write(`Published ${prompt.version} as the production version of ${prompt.name}.\n`)
    return
  }
  if (command === 'review-eval') {
    const report = await withSpan('playground.eval.review_judge', {
      'playground.eval.live': args.includes('--live'),
      'playground.provider.route': !args.includes('--live') ? 'mock' : args.includes('--via-litellm') ? 'litellm' : 'baseten-direct',
      'playground.eval.label_set': 'cbc-review-v3',
      'playground.eval.fixture_count': FIXTURE_IDS.length,
    }, async (span) => {
      if (args.includes('--via-litellm') && !args.includes('--live')) throw new Error('--via-litellm requires --live.')
      const result = await runReviewEvaluation({ live: args.includes('--live'), traceId, viaLitellm: args.includes('--via-litellm') })
      const judgeModel = result.cases[0] ? modelLabel(result.cases[0].review.candidate, result.cases[0].review.attempts.find((attempt) => attempt.responseModel)?.responseModel) : undefined
      const detectionRate = result.totals.expectedDefectsEvaluated === 0 ? 0 : result.totals.expectedDefectsDetected / result.totals.expectedDefectsEvaluated
      span.setAttributes({
        'playground.eval.run_id': result.evalRunId,
        'playground.eval.case_count': result.totals.caseCount,
        'playground.eval.expected_defect_detection_rate': detectionRate,
        'playground.eval.expected_evidence_citation_count': result.totals.expectedEvidenceCitedCount,
        'playground.eval.expected_rationale_pass_count': result.totals.expectedExplanationsPassed,
        'playground.eval.clean_false_positive_cases': result.totals.cleanFalsePositiveCases,
        'playground.eval.invalid_reviews': result.totals.invalidReviewCount,
        'playground.eval.estimated_cost_usd': result.totals.estimatedCostUsd ?? 0,
        'playground.eval.reported_cost_usd': result.totals.reportedCostUsd ?? 0,
        'playground.eval.total_cost_usd': result.totals.totalCostUsd ?? 0,
        'playground.eval.cost_source': result.totals.costSource ?? 'missing',
        'playground.eval.missing_cost_calls': result.totals.missingCostCount,
        'playground.eval.total_tokens': result.totals.totalTokens ?? 0,
        'playground.eval.label_set': 'cbc-review-v3',
        'playground.eval.judge_provider': result.cases[0]?.review.candidate.provider ?? 'unknown',
        'playground.eval.judge_model': judgeModel ?? 'unknown',
      })
      return result
    })
    const detectionRate = report.totals.expectedDefectsEvaluated === 0 ? 0 : report.totals.expectedDefectsDetected / report.totals.expectedDefectsEvaluated
    const evidenceRate = report.totals.expectedDefectsEvaluated === 0 ? 0 : report.totals.expectedEvidenceCitedCount / report.totals.expectedDefectsEvaluated
    const rationaleRate = report.totals.expectedDefectsEvaluated === 0 ? 0 : report.totals.expectedExplanationsPassed / report.totals.expectedDefectsEvaluated
    const cleanFalsePositiveRate = report.totals.cleanCasesEvaluated === 0 ? 0 : report.totals.cleanFalsePositiveCases / report.totals.cleanCasesEvaluated
    const invalidReviewRate = report.totals.caseCount === 0 ? 0 : report.totals.invalidReviewCount / report.totals.caseCount
    const evalCostUsd = report.totals.totalCostUsd
    const evalCostLabel = report.totals.costSource
    const judge = report.cases[0]?.review.candidate
    const judgeModel = report.cases[0] ? modelLabel(report.cases[0].review.candidate, report.cases[0].review.attempts.find((attempt) => attempt.responseModel)?.responseModel) : judge?.model
    const judgeAttributes = {
      suite: 'review_judge', label_set: 'cbc-review-v3', live: report.live,
      provider: judge?.provider ?? 'unknown', model: judgeModel ?? 'unknown',
      route: !report.live ? 'mock' : args.includes('--via-litellm') ? 'litellm' : 'baseten-direct',
    }
    recordEvaluationScores([
      { name: 'expected_defect_detection_rate', value: detectionRate, attributes: judgeAttributes },
      { name: 'expected_source_citation_rate', value: evidenceRate, attributes: judgeAttributes },
      { name: 'expected_rationale_rate', value: rationaleRate, attributes: judgeAttributes },
      { name: 'clean_false_positive_rate', value: cleanFalsePositiveRate, attributes: judgeAttributes },
      { name: 'invalid_review_rate', value: invalidReviewRate, attributes: judgeAttributes },
    ])
    for (const item of report.cases) {
      const model = modelLabel(item.review.candidate, item.review.attempts.find((attempt) => attempt.responseModel)?.responseModel)
      if (item.reportedCostUsd !== undefined) recordPlaygroundCost(item.reportedCostUsd, { stage: 'review-eval', provider: item.review.candidate.provider, model, kind: 'reported' })
      else if (item.estimatedCost) recordPlaygroundCost(item.estimatedCost.usd, { stage: 'review-eval', provider: item.review.candidate.provider, model, kind: 'estimated' })
    }
    process.stdout.write(`${report.live ? 'Live judge' : 'Mock judge'} · ${report.totals.caseCount} cases · ${report.totals.expectedDefectsDetected}/${report.totals.expectedDefectsEvaluated} defects detected (${report.totals.expectedDefects} labelled) · ${report.totals.expectedEvidenceCitedCount}/${report.totals.expectedDefectsEvaluated} sources cited · ${report.totals.expectedExplanationsPassed}/${report.totals.expectedDefectsEvaluated} rationale concept checks passed · ${report.totals.cleanFalsePositiveCases}/${report.totals.cleanCasesEvaluated} clean cases with false alarms · ${report.totals.invalidReviewCount} invalid review(s)${evalCostUsd === undefined ? '' : ` · $${evalCostUsd.toFixed(6)} ${evalCostLabel}`}\n`)
    for (const item of report.cases) {
      const detection = !item.reviewAccepted ? item.unverifiedExpectedDefectNoted ? 'invalid review; defect noted' : 'invalid review'
        : item.expectedDefect ? item.expectedDefectDetected ? 'detected' : 'missed' : 'clean'
      const unexpected = item.unexpectedFindingCount === null ? 'unscored' : `${item.unexpectedFindingCount} unexpected`
      const explanation = item.explanationQuality === null ? 'no rationale label' : item.explanationQuality.passed ? 'rationale concepts passed' : 'rationale concepts failed'
      process.stdout.write(`  ${item.id}: ${detection} · ${explanation} · ${unexpected} · scores ${item.evalScoreDelivery.status}${item.evalScoreDelivery.message ? ` (${item.evalScoreDelivery.message})` : ''}\n`)
    }
    emitTelemetryLog('playground review evaluation completed', report.live ? SeverityNumber.INFO : SeverityNumber.WARN, {
      'playground.event': 'review_eval.completed',
      'playground.eval.run_id': report.evalRunId,
      'playground.eval.case_count': report.totals.caseCount,
      'playground.eval.expected_defects': report.totals.expectedDefects,
      'playground.eval.expected_defects_evaluated': report.totals.expectedDefectsEvaluated,
      'playground.eval.expected_defects_detected': report.totals.expectedDefectsDetected,
      'playground.eval.expected_evidence_cited': report.totals.expectedEvidenceCitedCount,
      'playground.eval.expected_explanations_passed': report.totals.expectedExplanationsPassed,
      'playground.eval.unexpected_findings': report.totals.unexpectedFindings,
      'playground.eval.invalid_reviews': report.totals.invalidReviewCount,
      'playground.eval.expected_defect_detection_rate': detectionRate,
      'playground.eval.expected_source_citation_rate': evidenceRate,
      'playground.eval.expected_rationale_rate': rationaleRate,
      'playground.eval.clean_false_positive_rate': cleanFalsePositiveRate,
      'playground.eval.invalid_review_rate': invalidReviewRate,
      'playground.eval.total_cost_usd': report.totals.totalCostUsd ?? 0,
      'playground.eval.cost_source': report.totals.costSource ?? 'missing',
      'playground.eval.missing_cost_calls': report.totals.missingCostCount,
      'playground.eval.label_set': 'cbc-review-v3',
      'playground.eval.judge_provider': judge?.provider ?? 'unknown',
      'playground.eval.judge_model': judgeModel ?? 'unknown',
      'playground.eval.route': args.includes('--via-litellm') ? 'litellm' : 'direct',
      'playground.eval.live': report.live,
    })
    process.stdout.write(`Review evaluation report: ${path.resolve('.cache/playground/review-evals', `${report.evalRunId}.json`)}\n`)
    if (report.traceId) process.stdout.write(`Trace ID: ${report.traceId}\n`)
    return
  }
  if (command === 'costs') {
    const traceId = await withSpan('playground.cost.summary', {}, async (span) => {
      const reports = await readLocalReports()
      const allReports = [...reports.generations, ...reports.reviews, ...reports.reviewEvaluations]
      const summary = summarizeCosts(allReports)
      span.setAttribute('playground.cost.group_count', summary.length)
      span.setAttribute('playground.cost.report_count', allReports.length)
      summary.forEach((row, index) => {
        span.setAttribute(`playground.cost.groups.${index}`, JSON.stringify(row))
      })
      emitTelemetryLog('playground saved cost comparison completed', SeverityNumber.INFO, {
        'playground.event': 'cost_summary.completed',
        'playground.cost.report_count': allReports.length,
        'playground.cost.group_count': summary.length,
        'playground.cost.comparison': JSON.stringify(summary),
      })
      printCostSummary(allReports, args.includes('--json'))
      return span.spanContext().traceId
    })
    if (!args.includes('--json') && traceId && !/^0+$/.test(traceId)) process.stdout.write(`Trace ID: ${traceId}\n`)
    return
  }
  if (command === 'dataset') {
    if (args[0] !== 'export') {
      process.stderr.write('Usage: pnpm playground -- dataset export [--review-evals] [--name <dataset>] [--out <jsonl-path>] [--sync]\n')
      process.exitCode = 2
      return
    }
    const reviewEvaluationsOnly = args.includes('--review-evals')
    const nameIndex = args.indexOf('--name')
    const datasetName = nameIndex >= 0 ? args[nameIndex + 1] : reviewEvaluationsOnly ? 'nova-lesson-review-evaluation-v4' : 'nova-lesson-generation'
    if (!datasetName) throw new Error('--name requires a dataset name.')
    const outputIndex = args.indexOf('--out')
    const outputPath = outputIndex >= 0 ? path.resolve(args[outputIndex + 1] ?? '') : path.resolve('.cache/playground/datasets', `${datasetName.replace(/[^a-zA-Z0-9_-]/g, '-')}.jsonl`)
    if (outputIndex >= 0 && !args[outputIndex + 1]) throw new Error('--out requires a path.')
    const traceId = await withSpan('playground.dataset.export', {
      'playground.dataset.name': datasetName,
      'playground.dataset.sync_requested': args.includes('--sync'),
    }, async (span) => {
      const reports = await readLocalReports()
      const sourceReports = reviewEvaluationsOnly ? reports.reviewEvaluations : reports.generations
      const items: DatasetItem[] = reviewEvaluationsOnly
        ? reviewEvaluationReportsToDatasetItems(reports.reviewEvaluations, datasetName)
        : generationRunsToDatasetItems(reports.generations, datasetName)
      await mkdir(path.dirname(outputPath), { recursive: true })
      await writeFile(outputPath, datasetItemsToJsonl(items))
      span.setAttributes({
        'playground.dataset.source_run_count': sourceReports.length,
        'playground.dataset.item_count': items.length,
        'playground.dataset.output_path': outputPath,
        'playground.dataset.kind': reviewEvaluationsOnly ? 'review-evaluation' : 'generation',
      })
      recordDatasetItemCount(items.length, { dataset: datasetName, kind: reviewEvaluationsOnly ? 'review-evaluation' : 'generation' })
      process.stdout.write(`Exported ${items.length} ${reviewEvaluationsOnly ? 'review-evaluation case(s) from' : 'dataset item(s) from'} ${sourceReports.length} report(s): ${outputPath}\n`)
      let syncedItemCount = 0
      if (args.includes('--sync')) {
        const description = reviewEvaluationsOnly
          ? 'CBC lesson-plan review judge cases with frozen source snapshots, expected defect labels, evidence and rationale checks, and observed judge output.'
          : 'Synthetic CBC lesson-plan generation runs with frozen retrieval, schema, prompt, and deterministic verification evidence.'
        const result = await syncLangfuseDataset(items, { datasetName, description })
        syncedItemCount = result.syncedItemIds.length
        process.stdout.write(`Synced ${result.syncedItemIds.length} stable item(s) to Langfuse dataset ${result.datasetName}.\n`)
      }
      span.setAttribute('playground.dataset.synced_item_count', syncedItemCount)
      emitTelemetryLog('playground dataset export completed', SeverityNumber.INFO, {
        'playground.event': 'dataset_export.completed',
        'playground.dataset.name': datasetName,
        'playground.dataset.source_run_count': sourceReports.length,
        'playground.dataset.kind': reviewEvaluationsOnly ? 'review-evaluation' : 'generation',
        'playground.dataset.item_count': items.length,
        'playground.dataset.synced_item_count': syncedItemCount,
      })
      return span.spanContext().traceId
    })
    if (traceId && !/^0+$/.test(traceId)) process.stdout.write(`Trace ID: ${traceId}\n`)
    return
  }
  if (command === 'review') {
    const sourceRunPath = args.find((argument) => !argument.startsWith('--'))
    if (!sourceRunPath) {
      process.stderr.write('Usage: pnpm playground -- review <run-id-or-json-path> [--live]\n')
      process.exitCode = 2
      return
    }
    const viaLitellm = args.includes('--via-litellm')
    if (viaLitellm && !args.includes('--live')) {
      process.stderr.write('--via-litellm requires --live.\n')
      process.exitCode = 2
      return
    }
    printReviewResult(await runReview(sourceRunPath, args.includes('--live'), traceId, viaLitellm))
    return
  }
  if (command !== 'generate') {
    process.stderr.write('Usage: pnpm playground -- [generate [--target particles|changes] [--duration 30|35|40|45|50|55|60] [--live] [--model deepseek|glm] [--via-litellm] | review <run-id-or-json-path> [--live] [--via-litellm] | plans import|author|edit|submit|return|publish|show|list ... | retrieval-eval [--mock] | review-eval [--live] [--via-litellm] | dataset export [--review-evals] [--sync] | costs [--json] | prompts publish | schema]\n')
    process.exitCode = 2
    return
  }

  const modelFlagIndex = args.indexOf('--model')
  const selectedModel = modelFlagIndex >= 0 ? args[modelFlagIndex + 1] : 'deepseek'
  const targetIndex = args.indexOf('--target')
  const selectedTarget = targetIndex >= 0 ? args[targetIndex + 1] : 'particles'
  const durationIndex = args.indexOf('--duration')
  const selectedDuration = durationIndex >= 0 ? Number(args[durationIndex + 1]) : undefined
  const viaLitellm = args.includes('--via-litellm')
  if (viaLitellm && (!args.includes('--live') || command !== 'generate')) {
    process.stderr.write('--via-litellm is available for live generate and review commands.\n')
    process.exitCode = 2
    return
  }
  if (command === 'generate' && selectedModel !== 'deepseek' && selectedModel !== 'glm') {
    process.stderr.write('Choose --model deepseek or --model glm.\n')
    process.exitCode = 2
    return
  }
  if (targetIndex >= 0 && !FIXTURE_IDS.includes(selectedTarget as FixtureId)) {
    process.stderr.write(`Choose --target ${FIXTURE_IDS.join('|')}.\n`)
    process.exitCode = 2
    return
  }
  if (durationIndex >= 0) {
    try {
      lessonTiming(selectedDuration ?? Number.NaN)
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : 'Invalid lesson duration.'}\n`)
      process.exitCode = 2
      return
    }
  }
  const report = await runGeneration({
    live: args.includes('--live'),
    model: selectedModel === 'glm' ? 'glm' : 'deepseek',
    viaLitellm,
    traceId,
    fixtureId: selectedTarget as FixtureId,
    durationMinutes: selectedDuration,
  })
  for (const result of report.candidates) {
    const model = modelLabel(result.candidate, result.attempts.find((attempt) => attempt.responseModel)?.responseModel)
    if (result.reportedCostUsd !== undefined) recordPlaygroundCost(result.reportedCostUsd, { stage: 'generation', provider: result.candidate.provider, model, kind: 'reported' })
    else if (result.estimatedCost) recordPlaygroundCost(result.estimatedCost.usd, { stage: 'generation', provider: result.candidate.provider, model, kind: 'estimated' })
    emitTelemetryLog('playground generation completed', result.status === 'success' ? SeverityNumber.INFO : SeverityNumber.WARN, {
      'playground.event': 'generation.completed',
      'playground.run_id': report.runId,
      'playground.fixture_id': report.scenario.fixtureId ?? selectedTarget,
      'playground.target_id': report.scenario.targetId,
      'llm.provider': result.candidate.provider,
      'llm.model': model,
      'playground.generation.status': result.status,
      'playground.elapsed_ms': result.elapsedMs,
      ...(result.errorCode === undefined ? {} : { 'error.code': result.errorCode }),
      ...(result.reportedCostUsd === undefined ? {} : { 'playground.cost.reported_usd': result.reportedCostUsd }),
      ...(result.estimatedCost === undefined ? {} : { 'playground.cost.estimated_usd': result.estimatedCost.usd }),
    })
  }
  for (const result of report.candidates) {
    const checks = result.verification?.checks.filter((check) => !check.passed).map((check) => check.code).join(', ')
    const usage = result.usage?.totalTokens === undefined ? '' : ` · ${result.usage.totalTokens} tokens`
    const cost = result.reportedCostUsd ?? result.estimatedCost?.usd
    process.stdout.write(`${result.candidate.displayName}: ${result.status}${checks ? ` (${checks})` : ''}${usage}${cost === undefined ? '' : ` · $${cost.toFixed(6)}`} · ${result.elapsedMs}ms\n`)
    if (result.errorCode) process.stdout.write(`  ${result.errorCode}: ${result.errorMessage}\n`)
  }
  if (!report.candidates.some((result) => result.status === 'success')) process.exitCode = 1
  if (report.selection) process.stdout.write(`Verified draft candidate: ${report.selection.candidateId}\n`)
  process.stdout.write(`Run report: ${path.resolve(process.env.PLAYGROUND_REPORTS_DIR ?? '.cache/playground/runs', `${report.runId}.json`)}\n`)
  if (report.traceId) process.stdout.write(`Trace ID: ${report.traceId}\n`)
}

let commandFailureReported = false

async function main(): Promise<void> {
  const command = process.argv.slice(2).filter((argument) => argument !== '--')[0] ?? 'generate'
  await withSpan('playground.command', {
    'playground.command': command,
    'langfuse.trace.name': `playground.${command}`,
    'langfuse.trace.metadata.command': command,
  }, async (span) => {
    const startedAt = performance.now()
    let outcome: 'success' | 'failure' = 'success'
    try {
      await runCommand(currentTraceId())
      if (process.exitCode !== undefined && process.exitCode !== 0) outcome = 'failure'
    } catch (error) {
      outcome = 'failure'
      commandFailureReported = true
      const details = failureDetails(error)
      span.setAttributes({
        'playground.error.code': details.errorCode,
        'playground.error.stage': details.stage,
        'playground.error.retryable': details.retryable,
      })
      let failurePath: string | undefined
      try {
        failurePath = await writeCommandFailureReport(error, command, currentTraceId())
      } catch (reportError) {
        process.stderr.write(`Could not write failure report: ${reportError instanceof Error ? reportError.message : 'Unknown file error.'}\n`)
      }
      recordPlaygroundFailure({ command, stage: details.stage, errorCode: details.errorCode, retryable: details.retryable })
      emitTelemetryLog('playground command failed', SeverityNumber.ERROR, {
        'playground.event': 'command.failed',
        'playground.command': command,
        'playground.error.code': details.errorCode,
        'playground.error.stage': details.stage,
        'playground.error.retryable': details.retryable,
        ...(failurePath ? { 'playground.failure_report': failurePath } : {}),
        'error.type': error instanceof Error ? error.name : 'UnknownError',
        'error.message': details.message,
      })
      process.stderr.write(`${details.errorCode} (${details.stage}): ${details.message}\n`)
      if (failurePath) process.stderr.write(`Failure report: ${failurePath}\n`)
      throw error
    } finally {
      recordPlaygroundCommand(command, outcome, Math.round(performance.now() - startedAt))
    }
  })
}

main().catch((error: unknown) => {
  if (!commandFailureReported) process.stderr.write(`${error instanceof Error ? error.message : 'Unknown playground error.'}\n`)
  process.exitCode = 1
}).finally(() => shutdownTelemetry())
