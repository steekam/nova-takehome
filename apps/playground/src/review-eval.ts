import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FixtureId } from './corpus.js'
import type { LessonContent, RunReport } from './domain.js'
import { LessonContentSchema } from './domain.js'
import { runGeneration } from './runner.js'
import { runReview } from './review.js'
import type { ReviewRunReport } from './review.js'
import { verify } from './verify.js'
import { estimateCost } from './pricing.js'
import { reportReviewEvaluationScores } from './telemetry.js'
import type { ScoreDelivery } from './telemetry.js'

export type ReviewEvaluationCase = {
  id: string
  fixtureId: FixtureId
  label: 'clean' | 'corrupted'
  expectedDefect: {
    sectionPath: string
    description: string
    dimensions: string[]
    evidenceChunkIds: string[]
    summaryConcepts: string[][]
    suggestionConcepts: string[][]
  } | null
  snapshot: {
    sourceRunId: string
    baselineRunId: string
    sourceReportSha256: string
    contentSha256: string
    sourceChunksSha256: string
    content: LessonContent
    sourceChunks: RunReport['retrieval']['selectedChunks']
  }
  inputReportPath: string
  schemaValid: boolean
  deterministicVerification: ReturnType<typeof verify>['verification']
  review: ReviewRunReport
  reviewAccepted: boolean
  unverifiedExpectedDefectNoted: boolean
  expectedEvidenceCited: boolean | null
  explanationQuality: {
    passed: boolean
    summaryChecks: Array<{ alternatives: string[]; passed: boolean }>
    suggestionChecks: Array<{ alternatives: string[]; passed: boolean }>
  } | null
  expectedDefectQualityPassed: boolean
  expectedDefectDetected: boolean
  unexpectedFindingCount: number | null
  evalScoreDelivery: ScoreDelivery
  usage?: ReviewRunReport['usage']
  estimatedCost?: ReviewRunReport['estimatedCost']
  reportedCostUsd?: number
}

export type ReviewEvaluationReport = {
  schemaVersion: 'playground-review-eval-v3'
  evalRunId: string
  traceId?: string
  createdAt: string
  live: boolean
  cases: ReviewEvaluationCase[]
  totals: {
    caseCount: number
    expectedDefects: number
    expectedDefectsEvaluated: number
    expectedDefectsDetected: number
    expectedEvidenceCitedCount: number
    expectedExplanationsPassed: number
    expectedDefectQualityPassed: number
    cleanCasesEvaluated: number
    cleanFalsePositiveCases: number
    invalidReviewCount: number
    unexpectedFindings: number
    schemaValidCount: number
    deterministicVerificationPassedCount: number
    estimatedCostUsd?: number
    reportedCostUsd?: number
    totalCostUsd?: number
    costSource?: 'reported' | 'estimated' | 'mixed' | 'partial'
    missingCostCount: number
    totalTokens?: number
  }
}

type SourceReport = RunReport & {
  candidates: RunReport['candidates'] & Array<{ content?: LessonContent }>
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function mutateOneFact(fixtureId: FixtureId, content: LessonContent): string {
  const objective = content.lessonObjectives[0]
  if (fixtureId === 'particles') {
    objective.text += ' Gas particles grow larger as they spread through a container.'
    return 'The claim that gas particles grow larger contradicts the selected teaching source.'
  }
  objective.text += ' Tearing paper forms a new substance.'
  return 'The claim that tearing paper forms a new substance contradicts the selected case source.'
}

function notesExpectedDefect(review: ReviewRunReport, sectionPath: string, dimensions: string[]): boolean {
  return review.review?.findings.some((finding) => finding.sectionPath === sectionPath && dimensions.includes(finding.dimension)) ?? false
}

function containsPhrase(text: string, phrase: string): boolean {
  const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
  const content = words(text)
  const needle = words(phrase)
  return needle.length > 0 && content.some((_, index) => needle.every((word, offset) => content[index + offset] === word))
}

function checkExplanation(finding: NonNullable<ReviewRunReport['review']>['findings'][number], expected: NonNullable<ReviewEvaluationCase['expectedDefect']>) {
  const summaryChecks = expected.summaryConcepts.map((alternatives) => ({
    alternatives,
    passed: alternatives.some((phrase) => containsPhrase(finding.summary, phrase)),
  }))
  const suggestionChecks = expected.suggestionConcepts.map((alternatives) => ({
    alternatives,
    passed: alternatives.some((phrase) => containsPhrase(finding.suggestion ?? '', phrase)),
  }))
  return {
    passed: [...summaryChecks, ...suggestionChecks].every(({ passed }) => passed),
    summaryChecks,
    suggestionChecks,
  }
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined)
  return defined.length ? Number(defined.reduce((sum, value) => sum + value, 0).toFixed(8)) : undefined
}

type ReviewCostCase = {
  review: Pick<ReviewRunReport, 'candidate' | 'attempts'>
}

export function reviewEvaluationCostTotals(cases: readonly ReviewCostCase[]) {
  const calls = cases.flatMap(({ review }) => review.attempts.map((attempt) => ({ candidate: review.candidate, attempt })))
  let reportedCostUsd = 0
  let estimatedCostUsd = 0
  let totalCostUsd = 0
  let reportedCount = 0
  let estimatedFallbackCount = 0
  let missingCostCount = 0
  for (const { candidate, attempt } of calls) {
    const estimate = estimateCost(candidate, attempt.usage)
    if (attempt.reportedCostUsd !== undefined) {
      reportedCostUsd += attempt.reportedCostUsd
      reportedCount += 1
      totalCostUsd += attempt.reportedCostUsd
    }
    if (estimate) estimatedCostUsd += estimate.usd
    if (attempt.reportedCostUsd === undefined && estimate) {
      estimatedFallbackCount += 1
      totalCostUsd += estimate.usd
    } else if (attempt.reportedCostUsd === undefined && candidate.provider !== 'mock') {
      missingCostCount += 1
    }
  }
  const hasCost = reportedCount > 0 || estimatedFallbackCount > 0
  const costSource: ReviewEvaluationReport['totals']['costSource'] = missingCostCount > 0 && hasCost ? 'partial'
    : reportedCount > 0 && estimatedFallbackCount > 0 ? 'mixed'
      : reportedCount > 0 ? 'reported'
        : estimatedFallbackCount > 0 ? 'estimated' : undefined
  return {
    reportedCostUsd: reportedCount ? Number(reportedCostUsd.toFixed(8)) : undefined,
    estimatedCostUsd: calls.some(({ attempt }) => attempt.usage !== undefined) ? Number(estimatedCostUsd.toFixed(8)) : undefined,
    totalCostUsd: hasCost ? Number(totalCostUsd.toFixed(8)) : undefined,
    costSource,
    missingCostCount,
  }
}

export async function runReviewEvaluation(options: { live: boolean; traceId?: string; viaLitellm?: boolean; reportDirectory?: string }): Promise<ReviewEvaluationReport> {
  const evalRunId = randomUUID()
  const rootDir = path.resolve(options.reportDirectory ?? '.cache/playground/review-evals')
  const inputsDir = path.join(rootDir, 'inputs')
  await mkdir(inputsDir, { recursive: true })

  const cases: ReviewEvaluationCase[] = []
  for (const fixtureId of ['particles', 'changes'] as const) {
    const generated = await runGeneration({ live: false, fixtureId })
    const baseline = generated.candidates.find((candidate) => candidate.status === 'success' && candidate.content)
    if (!baseline?.content) throw new Error(`Could not create a verified mock baseline for the ${fixtureId} fixture.`)

    for (const label of ['clean', 'corrupted'] as const) {
      const inputReport = clone(generated) as SourceReport
      const baselineRunId = inputReport.runId
      inputReport.runId = `review-eval-${evalRunId}-${fixtureId}-${label}`
      const inputCandidate = inputReport.candidates.find((candidate) => candidate.candidate.id === baseline.candidate.id)
      if (!inputCandidate?.content) throw new Error(`Generated ${fixtureId} report has no baseline lesson content.`)

      const expectedDefect = label === 'corrupted'
        ? {
          sectionPath: 'lessonObjectives[0].text',
          description: mutateOneFact(fixtureId, inputCandidate.content),
          dimensions: ['alignment', 'grounding', 'accuracy'],
          evidenceChunkIds: [fixtureId === 'particles' ? 'chunk-particle-properties' : 'chunk-change-cases'],
          summaryConcepts: fixtureId === 'particles'
            ? [['gas particles grow', 'particles grow larger'], ['contradicts', 'false claim', 'incorrect claim']]
            : [['tearing paper'], ['no new substance', 'remains paper', 'does not form a new substance'], ['physical change', 'physical']],
          suggestionConcepts: fixtureId === 'particles'
            ? [['remove', 'revise', 'correct', 'replace', 'edit'], ['size stays the same', 'particle size stays the same', 'same size', 'size unchanged', 'particle size remains constant']]
            : [['revise', 'correct', 'remove', 'replace', 'edit', 'rewrite'], ['tearing paper'], ['no new substance', 'does not form a new substance', 'remains paper'], ['physical']],
        }
        : null
      const content = inputCandidate.content
      const sourceChunks = inputReport.retrieval.selectedChunks
      if (expectedDefect?.evidenceChunkIds.some((id) => !sourceChunks.some((chunk) => chunk.id === id))) {
        throw new Error(`The ${fixtureId} review-eval case did not retrieve its expected evidence chunk.`)
      }
      const inputReportPath = path.join(inputsDir, `${evalRunId}-${fixtureId}-${label}.json`)
      await writeFile(inputReportPath, `${JSON.stringify(inputReport, null, 2)}\n`)

      const parsedContent = LessonContentSchema.safeParse(content)
      const verification = verify(content, sourceChunks)
      const review = await runReview(inputReportPath, options.live, options.traceId, options.viaLitellm ?? false)
      const reviewAccepted = review.status === 'evaluated' && review.verification?.passed === true
      const unverifiedExpectedDefectNoted = expectedDefect
        ? notesExpectedDefect(review, expectedDefect.sectionPath, expectedDefect.dimensions)
        : false
      const expectedFindings = expectedDefect ? review.review?.findings.filter((finding) =>
        finding.sectionPath === expectedDefect.sectionPath && expectedDefect.dimensions.includes(finding.dimension)) ?? [] : []
      const expectedFinding = expectedFindings[0]
      const expectedEvidenceCited = expectedDefect
        ? reviewAccepted && expectedFinding != null && expectedDefect.evidenceChunkIds.every((id) => expectedFinding.evidenceChunkIds.includes(id))
        : null
      const expectedDefectDetected = reviewAccepted && expectedFinding != null
      const explanationQuality = expectedDefect && expectedFinding
        ? checkExplanation({
          ...expectedFinding,
          summary: expectedFindings.map(({ summary }) => summary).join(' '),
          suggestion: expectedFindings.map(({ suggestion }) => suggestion ?? '').join(' '),
        }, expectedDefect)
        : expectedDefect ? { passed: false, summaryChecks: expectedDefect.summaryConcepts.map((alternatives) => ({ alternatives, passed: false })), suggestionChecks: expectedDefect.suggestionConcepts.map((alternatives) => ({ alternatives, passed: false })) }
          : null
      const expectedDefectQualityPassed = reviewAccepted && expectedDefectDetected && explanationQuality?.passed === true
      const unexpectedFindingCount = reviewAccepted
        ? review.review?.findings.filter((finding) => finding.sectionPath !== expectedDefect?.sectionPath).length ?? 0
        : null
      const reviewObservation = [...review.attempts].reverse().find((attempt) => attempt.traceId && attempt.observationId)
      const evalScoreDelivery = options.live && review.status === 'evaluated'
        ? await reportReviewEvaluationScores({
          traceId: reviewObservation?.traceId,
          observationId: reviewObservation?.observationId,
          evalRunId,
          caseId: `${fixtureId}-${label}`,
          inputHash: sha256({ content, sourceChunks }),
          labelSet: 'cbc-review-v3',
          judgeProvider: review.candidate.provider,
          judgeModel: review.candidate.model,
          route: options.viaLitellm ? 'litellm' : 'direct',
          expectedDefect: expectedDefect !== null,
          expectedDefectDetected,
          expectedBehaviorPassed: expectedDefect ? expectedDefectQualityPassed : reviewAccepted && !review.review?.findings.length,
          ...(expectedDefect ? { expectedEvidenceCited: reviewAccepted && expectedEvidenceCited === true } : {}),
          ...(expectedDefect ? { expectedExplanationPassed: reviewAccepted && explanationQuality?.passed === true } : {}),
          ...(unexpectedFindingCount === null ? {} : { noUnexpectedFindings: unexpectedFindingCount === 0 }),
          schemaValid: reviewAccepted,
        })
        : { status: 'skipped' as const, message: options.live ? 'A valid review observation is required for evaluation scores.' : 'Mock judge evaluations are not reported as LLM evaluation scores.' }

      cases.push({
        id: `${fixtureId}-${label}`,
        fixtureId,
        label,
        expectedDefect,
        snapshot: {
          sourceRunId: inputReport.runId,
          baselineRunId,
          sourceReportSha256: sha256(inputReport),
          contentSha256: sha256(content),
          sourceChunksSha256: sha256(sourceChunks),
          content,
          sourceChunks,
        },
        inputReportPath,
        schemaValid: parsedContent.success,
        deterministicVerification: verification.verification,
        review,
        reviewAccepted,
        unverifiedExpectedDefectNoted,
        expectedEvidenceCited,
        explanationQuality,
        expectedDefectQualityPassed,
        expectedDefectDetected,
        unexpectedFindingCount,
        evalScoreDelivery,
        usage: review.usage,
        estimatedCost: review.estimatedCost,
        reportedCostUsd: review.reportedCostUsd,
      })
    }
  }

  const costTotals = reviewEvaluationCostTotals(cases)
  const totalTokens = sumDefined(cases.map(({ usage }) => usage?.totalTokens))
  const report: ReviewEvaluationReport = {
    schemaVersion: 'playground-review-eval-v3',
    evalRunId,
    traceId: options.traceId,
    createdAt: new Date().toISOString(),
    live: options.live,
    cases,
    totals: {
      caseCount: cases.length,
      expectedDefects: cases.filter(({ expectedDefect }) => expectedDefect !== null).length,
      expectedDefectsEvaluated: cases.filter(({ expectedDefect, reviewAccepted }) => expectedDefect !== null && reviewAccepted).length,
      expectedDefectsDetected: cases.filter(({ expectedDefectDetected }) => expectedDefectDetected).length,
      expectedEvidenceCitedCount: cases.filter(({ expectedDefect, reviewAccepted, expectedEvidenceCited }) => expectedDefect !== null && reviewAccepted && expectedEvidenceCited === true).length,
      expectedExplanationsPassed: cases.filter(({ expectedDefect, reviewAccepted, explanationQuality }) => expectedDefect !== null && reviewAccepted && explanationQuality?.passed === true).length,
      expectedDefectQualityPassed: cases.filter(({ expectedDefectQualityPassed }) => expectedDefectQualityPassed).length,
      cleanCasesEvaluated: cases.filter(({ expectedDefect, reviewAccepted }) => expectedDefect === null && reviewAccepted).length,
      cleanFalsePositiveCases: cases.filter(({ expectedDefect, reviewAccepted, review }) => expectedDefect === null && reviewAccepted && (review.review?.findings.length ?? 0) > 0).length,
      invalidReviewCount: cases.filter(({ reviewAccepted }) => !reviewAccepted).length,
      unexpectedFindings: cases.reduce((sum, item) => sum + (item.unexpectedFindingCount ?? 0), 0),
      schemaValidCount: cases.filter(({ schemaValid }) => schemaValid).length,
      deterministicVerificationPassedCount: cases.filter(({ deterministicVerification }) => deterministicVerification.passed).length,
      ...costTotals,
      totalTokens,
    },
  }
  await writeFile(path.join(rootDir, `${evalRunId}.json`), `${JSON.stringify(report, null, 2)}\n`)
  return report
}
