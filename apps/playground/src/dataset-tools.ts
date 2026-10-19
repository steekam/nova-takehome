import { createHash } from 'node:crypto'
import { modelLabel } from './domain.js'
import type { Candidate, CostEstimate, RunReport, TokenUsage } from './domain.js'
import type { ReviewRunReport } from './review.js'
import type { ReviewEvaluationReport } from './review-eval.js'

export type DatasetItem = {
  id: string
  datasetName: string
  input: unknown
  expectedOutput?: unknown
  metadata: Record<string, unknown>
  sourceTraceId?: string
  sourceObservationId?: string
}

function reviewEvaluationCaseToDatasetItem(report: ReviewEvaluationReport, item: ReviewEvaluationReport['cases'][number], datasetName: string): DatasetItem {
  const expectedOutput = {
    kind: 'cbc-review-judge-labels',
    expectedDefectPresent: item.expectedDefect !== null,
    expectedSectionPath: item.expectedDefect?.sectionPath ?? null,
    expectedDimensions: item.expectedDefect?.dimensions ?? [],
    expectedEvidenceChunkIds: item.expectedDefect?.evidenceChunkIds ?? [],
    summaryConcepts: item.expectedDefect?.summaryConcepts ?? [],
    suggestionConcepts: item.expectedDefect?.suggestionConcepts ?? [],
  }
  const id = digest({ datasetName, caseId: item.id, contentSha256: item.snapshot.contentSha256, sourceChunksSha256: item.snapshot.sourceChunksSha256, rubricVersion: item.review.rubricVersion, expectedOutput })
  const judgeAttempt = [...item.review.attempts].reverse().find(({ observationId }) => observationId)
  return {
    id,
    datasetName,
    input: {
      fixture: item.fixtureId,
      content: item.snapshot.content,
      sourceChunks: item.snapshot.sourceChunks,
      rubricVersion: item.review.rubricVersion,
    },
    expectedOutput,
    metadata: {
      exportVersion: 'playground-review-eval-dataset-v2',
      evalRunId: report.evalRunId,
      createdAt: report.createdAt,
      caseId: item.id,
      fixtureId: item.fixtureId,
      label: item.label,
      inputSha256: digest({ content: item.snapshot.content, sourceChunks: item.snapshot.sourceChunks }),
      contentSha256: item.snapshot.contentSha256,
      sourceChunksSha256: item.snapshot.sourceChunksSha256,
      judge: item.review.candidate,
      judgeStatus: item.review.status,
      observedFindings: item.review.review?.findings ?? null,
      accepted: item.reviewAccepted,
      observedEvaluation: {
        expectedDefectDetected: item.expectedDefectDetected,
        expectedEvidenceCited: item.expectedEvidenceCited,
        expectedDefectQualityPassed: item.expectedDefectQualityPassed,
        explanationQuality: item.explanationQuality,
        unexpectedFindingCount: item.unexpectedFindingCount,
        schemaValid: item.reviewAccepted,
      },
      evalScoreDelivery: item.evalScoreDelivery,
      usage: item.usage ?? null,
      reportedCostUsd: item.reportedCostUsd ?? null,
      estimatedCost: item.estimatedCost ?? null,
      traceId: judgeAttempt?.traceId ?? item.review.traceId ?? null,
      observationId: judgeAttempt?.observationId ?? null,
    },
    sourceTraceId: judgeAttempt?.traceId ?? item.review.traceId,
    sourceObservationId: judgeAttempt?.observationId,
  }
}

export function reviewEvaluationReportsToDatasetItems(reports: readonly ReviewEvaluationReport[], datasetName: string): DatasetItem[] {
  if (!datasetName.trim()) throw new Error('A dataset name is required.')
  const items = new Map<string, DatasetItem>()
  const orderedReports = [...reports].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.evalRunId.localeCompare(right.evalRunId))
  for (const report of orderedReports) {
    for (const item of report.cases) {
      const datasetItem = reviewEvaluationCaseToDatasetItem(report, item, datasetName)
      const previous = items.get(datasetItem.id)
      if (previous && canonicalJson({ input: previous.input, expectedOutput: previous.expectedOutput }) !== canonicalJson({ input: datasetItem.input, expectedOutput: datasetItem.expectedOutput })) {
        throw new Error(`Conflicting frozen snapshots for review-evaluation dataset item ${datasetItem.id}.`)
      }
      items.set(datasetItem.id, datasetItem)
    }
  }
  return [...items.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)))
    }
    return entry
  })
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function generationRunsToDatasetItems(reports: readonly RunReport[], datasetName: string): DatasetItem[] {
  if (!datasetName.trim()) throw new Error('A dataset name is required.')
  const items = new Map<string, DatasetItem>()
  for (const report of reports) {
    if (report.schemaVersion !== 'playground-run-v10' || !Array.isArray(report.retrieval.selectedChunks)) {
      throw new Error('Dataset export requires current generation reports with a frozen retrieval snapshot.')
    }
    for (const result of report.candidates) {
      const id = digest({ datasetName, runId: report.runId, candidateId: result.candidate.id })
      const lastAttempt = result.attempts.at(-1)
      const sourceTraceId = lastAttempt?.traceId ?? report.traceId
      const item: DatasetItem = {
        id,
        datasetName,
        input: {
          fixture: report.scenario.targetId,
          scenario: report.scenario,
          retrieval: report.retrieval,
          prompt: {
            name: report.promptName,
            version: report.promptVersion,
            source: report.promptSource,
            initial: result.attempts[0] ? { text: result.attempts[0].prompt, sha256: digest(result.attempts[0].prompt) } : null,
          },
          outputSchema: report.outputSchema,
          outputSchemaSha256: digest(report.outputSchema),
        },
        ...(result.status === 'success' && result.verification?.passed ? {
          expectedOutput: {
            kind: 'deterministic-verification' as const,
            checks: [...new Set(result.verification.checks.map(({ code }) => code))].sort().map((code) => ({ code, expectedPassed: true as const })),
          },
        } : {}),
        metadata: {
          exportVersion: 'playground-dataset-v1',
          runId: report.runId,
          createdAt: report.createdAt,
          schemaVersion: report.schemaVersion,
          candidate: result.candidate,
          status: result.status,
          verification: result.verification ?? null,
          observedOutput: {
            content: result.content ?? null,
            rawOutputs: result.attempts.flatMap(({ number, rawOutput }) => rawOutput === undefined ? [] : [{ number, text: rawOutput }]),
          },
          usage: result.usage ?? null,
          reportedCostUsd: result.reportedCostUsd ?? null,
          estimatedCost: result.estimatedCost ?? null,
          traceId: report.traceId ?? null,
          attempts: result.attempts,
        },
        sourceTraceId,
        sourceObservationId: lastAttempt?.observationId,
      }
      const previous = items.get(id)
      if (previous && canonicalJson(previous) !== canonicalJson(item)) throw new Error(`Conflicting saved snapshots for dataset item ${id}.`)
      items.set(id, item)
    }
  }
  return [...items.values()].sort((left, right) => left.id.localeCompare(right.id))
}

export function datasetItemsToJsonl(items: readonly DatasetItem[]): string {
  return items.length ? `${[...items].sort((left, right) => left.id.localeCompare(right.id)).map(canonicalJson).join('\n')}\n` : ''
}

export type CostSummary = {
  stage: 'generation' | 'review' | 'review-eval'
  provider: Candidate['provider']
  model: string
  runCount: number
  successfulRunCount: number
  callCount: number
  successfulCallCount: number
  reportedCostUsd: number
  estimatedCostUsd: number
  reportedCostCount: number
  estimatedCostCount: number
  missingCostCount: number
  notApplicableCostCount: number
}

function canEstimate(usage: TokenUsage | undefined, estimate: CostEstimate | undefined): boolean {
  return estimate !== undefined && usage?.promptTokens !== undefined && usage.completionTokens !== undefined
}

export function summarizeCosts(reports: readonly (RunReport | ReviewRunReport | ReviewEvaluationReport)[]): CostSummary[] {
  const groups = new Map<string, CostSummary>()
  const seen = new Set<string>()
  for (const report of reports) {
    const stage = report.schemaVersion === 'playground-review-run-v2' || report.schemaVersion === 'playground-review-run-v3' ? 'review'
      : report.schemaVersion === 'playground-review-eval-v3' ? 'review-eval' : 'generation'
    const results = stage === 'review' ? [report as ReviewRunReport]
      : stage === 'review-eval' ? (report as ReviewEvaluationReport).cases.map((item) => ({
        candidate: item.review.candidate,
        status: item.review.status,
        attempts: item.review.attempts,
        reportedCostUsd: item.reportedCostUsd,
        estimatedCost: item.estimatedCost,
      })) : (report as RunReport).candidates
    for (const [index, result] of results.entries()) {
      const reportId = report.schemaVersion === 'playground-review-eval-v3' ? report.evalRunId : report.runId
      const identity = JSON.stringify([report.schemaVersion, reportId, stage === 'review-eval' ? index : result.candidate.id])
      if (seen.has(identity)) continue
      seen.add(identity)
      const model = modelLabel(result.candidate, result.attempts.find((attempt) => attempt.responseModel)?.responseModel)
      const key = JSON.stringify([stage, result.candidate.provider, model])
      const group = groups.get(key) ?? {
        stage,
        provider: result.candidate.provider, model,
        runCount: 0, successfulRunCount: 0, callCount: 0, successfulCallCount: 0,
        reportedCostUsd: 0, estimatedCostUsd: 0, reportedCostCount: 0, estimatedCostCount: 0, missingCostCount: 0, notApplicableCostCount: 0,
      }
      group.runCount += 1
      group.successfulRunCount += Number(result.status === 'success' || result.status === 'evaluated')
      group.callCount += result.attempts.length
      // A provider response counts as successful even when deterministic output validation fails.
      group.successfulCallCount += result.attempts.filter((attempt) => attempt.rawOutput !== undefined).length
      group.reportedCostUsd += result.reportedCostUsd ?? 0
      group.estimatedCostUsd += result.estimatedCost?.usd ?? 0
      group.reportedCostCount += result.attempts.filter((attempt) => attempt.reportedCostUsd !== undefined).length
      group.estimatedCostCount += result.attempts.filter((attempt) => canEstimate(attempt.usage, result.estimatedCost)).length
      if (result.candidate.provider === 'mock') group.notApplicableCostCount += result.attempts.length
      else group.missingCostCount += result.attempts.filter((attempt) => attempt.reportedCostUsd === undefined && !canEstimate(attempt.usage, result.estimatedCost)).length
      groups.set(key, group)
    }
  }
  return [...groups.values()].map((group) => ({
    ...group,
    reportedCostUsd: Number(group.reportedCostUsd.toFixed(8)),
    estimatedCostUsd: Number(group.estimatedCostUsd.toFixed(8)),
  })).sort((left, right) => left.stage.localeCompare(right.stage) || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model))
}

export type DatasetSyncOptions = { datasetName: string; description?: string }

export async function syncLangfuseDataset(items: readonly DatasetItem[], options: DatasetSyncOptions): Promise<{ datasetName: string; syncedItemIds: string[] }> {
  if (!options.datasetName.trim() || items.some((item) => item.datasetName !== options.datasetName)) {
    throw new Error('Every item must belong to the requested dataset.')
  }
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!publicKey || !secretKey) throw new Error('LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required to sync a dataset.')
  const host = (process.env.LANGFUSE_HOST ?? 'http://localhost:3002').replace(/\/+$/, '')
  const headers = { Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`, 'Content-Type': 'application/json' }
  const request = (endpoint: string, body?: unknown) => fetch(`${host}${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  })
  const endpoint = `/api/public/v2/datasets/${encodeURIComponent(options.datasetName)}`
  const existing = await request(endpoint)
  if (existing.status === 404) {
    const created = await request('/api/public/v2/datasets', { name: options.datasetName, description: options.description })
    if (!created.ok) {
      // A concurrent sync may have created the same dataset after our lookup.
      if (created.status !== 409 || !(await request(endpoint)).ok) throw new Error(`Langfuse dataset creation returned HTTP ${created.status}.`)
    }
  } else if (!existing.ok) {
    throw new Error(`Langfuse dataset lookup returned HTTP ${existing.status}.`)
  }
  const syncedItemIds: string[] = []
  for (const item of [...items].sort((left, right) => left.id.localeCompare(right.id))) {
    const response = await request('/api/public/dataset-items', item)
    if (!response.ok) throw new Error(`Langfuse dataset item ${item.id} returned HTTP ${response.status}; rerun to resume using the same item IDs.`)
    syncedItemIds.push(item.id)
  }
  return { datasetName: options.datasetName, syncedItemIds }
}
