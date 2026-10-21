import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  CurriculumLibraryResponseSchema,
  LessonPlanListResponseSchema,
  LessonPlanResponseSchema,
} from '@nova/shared'
import { login } from './api-eval.js'

type WorkflowCase = {
  id: string
  label: string
  execution: 'live' | 'controlled' | 'live_review'
  expectedOutcome: string
  deterministic: Record<string, unknown>
  rubric: Record<string, unknown> | null
  signal: string
}

type WorkflowCaseDataset = {
  schemaVersion: string
  target: {
    framework: string
    programme: string
    grade: string
    subject: string
    edition: string
    locator: string
    durationMinutes: number
  }
  cases: WorkflowCase[]
}

type ProviderCall = {
  kind: string
  status: number
  repairRequest?: boolean
  repairIssuesPresent?: boolean
  priorResponseMatched?: boolean
}

const rubricKeys = [
  'outcome_alignment',
  'objective_measurability',
  'activity_alignment',
  'assessment_quality',
  'pacing_feasibility',
  'source_support',
] as const

export async function runWorkflowCases(args: string[]): Promise<void> {
  const baseUrl = option(args, '--api', process.env.NOVA_EVAL_API_URL ?? 'http://localhost:3001')
  const stubUrl = option(args, '--stub', process.env.NOVA_EVAL_STUB_URL ?? 'http://localhost:4055')
  const caseId = option(args, '--case', '')
  if (!caseId) throw new Error('workflow-cases requires --case CASE_ID.')
  const dataset = JSON.parse(
    await readFile(new URL('../fixtures/workflow-cases-v1.json', import.meta.url), 'utf8'),
  ) as WorkflowCaseDataset
  if (dataset.schemaVersion !== 'nova-workflow-evaluation-v1')
    throw new Error('Unsupported workflow dataset version.')
  const selectedCase = dataset.cases.find((item) => item.id === caseId)
  if (!selectedCase) throw new Error(`Unknown workflow case ${caseId}.`)
  if (selectedCase.execution !== 'controlled') {
    throw new Error(
      `${caseId} is marked ${selectedCase.execution}; workflow-cases runs controlled cases only. Use eval-api for live provider runs and human review for semantic-review cases.`,
    )
  }

  const stubHealth = await fetch(`${stubUrl}/__eval/health`, {
    signal: AbortSignal.timeout(2_000),
  }).catch(() => undefined)
  if (!stubHealth?.ok)
    throw new Error(
      `Local eval provider stub is not healthy at ${stubUrl}. Start it with: pnpm evals -- provider-stub.`,
    )
  const stubScenario = await fetch(`${stubUrl}/__eval/scenario`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ caseId }),
  })
  if (!stubScenario.ok) throw new Error(`Local eval provider stub rejected case ${caseId}.`)

  const token = await login(
    baseUrl,
    process.env.NOVA_EVAL_TEACHER_EMAIL ?? 'teacher@example.test',
    process.env.NOVA_EVAL_TEACHER_PASSWORD ?? 'NovaLocal123!',
  )
  const catalogueResponse = await apiRequest<unknown>(baseUrl, token, '/api/curriculum/library')
  const catalogue = CurriculumLibraryResponseSchema.parse(catalogueResponse.value)
  const targets = catalogue.offerings
    .filter(
      (offering) =>
        offering.framework.toLowerCase().includes('competency based curriculum') &&
        offering.programme.toLowerCase() === dataset.target.programme.toLowerCase() &&
        offering.level.toLowerCase() === dataset.target.grade.toLowerCase() &&
        offering.subject.toLowerCase() === dataset.target.subject.toLowerCase(),
    )
    .flatMap((offering) =>
      offering.designs
        .filter(
          (design) =>
            design.editionLabel === dataset.target.edition && design.status === 'published',
        )
        .flatMap((design) => design.targets),
    )
    .filter((target) => target.locator === dataset.target.locator && target.generationReady)
  if (targets.length !== 1)
    throw new Error(
      `Expected one generation-ready CBC target at ${dataset.target.locator}; found ${targets.length}.`,
    )
  const planIdsBefore = await readPlanIds(baseUrl, token)

  const traceId = randomUUID().replaceAll('-', '')
  const spanId = randomUUID().replaceAll('-', '').slice(0, 16)
  const requestId = randomUUID()
  const response = await fetch(new URL('/api/lesson-plans/generate', baseUrl), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-request-id': requestId,
      traceparent: `00-${traceId}-${spanId}-01`,
    },
    body: JSON.stringify({
      targetRevisionId: targets[0]!.id,
      durationMinutes: dataset.target.durationMinutes,
    }),
  })
  const body: unknown = await response.json().catch(() => undefined)
  const parsed = response.ok ? LessonPlanResponseSchema.safeParse(body) : undefined
  const successful = parsed?.success === true
  const stubCalls = (await fetch(`${stubUrl}/__eval/requests`).then((result) => result.json())) as {
    requests?: ProviderCall[]
  }
  const planIdsAfter = await readPlanIds(baseUrl, token)
  const actualErrorCode = isRecord(body) && typeof body.code === 'string' ? body.code : undefined
  const generationAttempts = await readGenerationAttempts(
    traceId,
    (stubCalls.requests ?? []).filter((call) => call.kind === 'generation' && call.status === 200)
      .length,
  )
  const successfulStubCalls = (stubCalls.requests ?? []).filter(
    (call) => call.status === 200,
  ).length
  const actual = {
    httpStatus: response.status,
    outcome: successful ? 'draft_created' : (actualErrorCode ?? 'request_failed'),
    deterministicQa: successful ? parsed.data.qa : null,
    rubric: successful ? summarizeRubric(parsed.data.rubricQa) : null,
    generationAttempts,
    planId: successful ? parsed.data.plan.id : undefined,
    versionId: successful ? parsed.data.plan.versionId : undefined,
    requestId: response.headers.get('x-request-id') ?? requestId,
    traceId,
    providerCalls: stubCalls.requests ?? [],
    noDraftPersisted:
      [...planIdsAfter].every((id) => planIdsBefore.has(id)) &&
      [...planIdsBefore].every((id) => planIdsAfter.has(id)),
    configuredModelAlias: 'lesson-planner',
    observedStubModel: 'local-eval-stub',
    observedStubUsage: {
      successfulResponses: successfulStubCalls,
      inputTokens: successfulStubCalls * 123,
      outputTokens: successfulStubCalls * 321,
      reportedCostUsd: successfulStubCalls * 0.00042,
      source: 'synthetic local stub responses; not provider-billed usage',
    },
  }
  const matched = matchesExpected(selectedCase, actual)
  const report = {
    schemaVersion: 'nova-workflow-case-run-v1',
    caseId,
    label: selectedCase.label,
    target: { ...dataset.target, id: targets[0]!.id, title: targets[0]!.title },
    expected: {
      outcome: selectedCase.expectedOutcome,
      deterministic: selectedCase.deterministic,
      rubric: selectedCase.rubric,
    },
    actual,
    matched,
    signal: selectedCase.signal,
    apiUrl: baseUrl,
    provider: 'local-openai-compatible-stub',
    traceUrl: `http://localhost:3002/project/nova/traces/${traceId}`,
    createdAt: new Date().toISOString(),
  }
  const directory = path.resolve(
    process.env.NOVA_EVAL_REPORTS_DIR ?? '.cache/evals/runs',
    'workflow-cases',
  )
  await mkdir(directory, { recursive: true })
  const reportPath = path.join(directory, `${caseId}-${traceId}.json`)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(
    `${caseId}: ${matched ? 'PASS' : 'FAIL'} · HTTP ${response.status} · trace ${traceId}\n`,
  )
  process.stdout.write(
    `Stub calls: ${(stubCalls.requests ?? []).map((call) => `${call.kind}:${call.status}`).join(', ')}\n`,
  )
  process.stdout.write(`Report: ${reportPath}\n`)
  if (!matched) process.exitCode = 1
}

async function apiRequest<T>(
  baseUrl: string,
  token: string,
  pathname: string,
): Promise<{ value: T }> {
  const response = await fetch(new URL(pathname, baseUrl), {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  })
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(`GET ${pathname} returned HTTP ${response.status}.`)
  return { value: value as T }
}

async function readPlanIds(baseUrl: string, token: string): Promise<Set<string>> {
  const response = await apiRequest<unknown>(baseUrl, token, '/api/lesson-plans')
  const plans = LessonPlanListResponseSchema.parse(response.value)
  return new Set(plans.items.map((plan) => plan.id))
}

type GenerationAttempt = {
  attempt: number
  passed: boolean
  checks: Array<{ code: string; passed: boolean }>
}

async function readGenerationAttempts(
  traceId: string,
  expectedAttempts: number,
): Promise<GenerationAttempt[]> {
  if (expectedAttempts === 0) return []
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!publicKey || !secretKey)
    throw new Error(
      'LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required to verify workflow traces.',
    )
  const baseUrl = (
    process.env.LANGFUSE_HOST ??
    process.env.LANGFUSE_BASE_URL ??
    'http://localhost:3002'
  ).replace(/\/+$/, '')
  const params = new URLSearchParams({
    traceId,
    fromStartTime: new Date(Date.now() - 5 * 60_000).toISOString(),
    toStartTime: new Date(Date.now() + 1_000).toISOString(),
    fields: 'core,basic',
    limit: '100',
  })
  const authorization = `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rows = await fetchLangfuseObservations(baseUrl, authorization, params)
    const candidates = rows.filter(
      (row) =>
        isRecord(row) &&
        row.name === 'curriculum.lesson_plan.validation' &&
        typeof row.id === 'string',
    )
    const attempts: GenerationAttempt[] = []
    for (const candidate of candidates) {
      if (!isRecord(candidate) || typeof candidate.id !== 'string') continue
      const filter = JSON.stringify([
        { type: 'string', column: 'id', operator: '=', value: candidate.id },
      ])
      const identityParams = new URLSearchParams({
        traceId,
        fields: 'core,basic',
        filter,
        limit: '1',
      })
      const identityRows = await fetchLangfuseObservations(baseUrl, authorization, identityParams)
      if (
        identityRows.length !== 1 ||
        !isRecord(identityRows[0]) ||
        identityRows[0].id !== candidate.id ||
        identityRows[0].name !== 'curriculum.lesson_plan.validation' ||
        identityRows[0].traceId !== traceId
      ) {
        throw new Error(`Langfuse observation ID filter did not isolate trace ${traceId}.`)
      }

      const ioParams = new URLSearchParams({
        traceId,
        fields: 'core,basic,io',
        filter,
        limit: '1',
      })
      const ioRows = await fetchLangfuseObservations(baseUrl, authorization, ioParams)
      if (
        ioRows.length !== 1 ||
        !isRecord(ioRows[0]) ||
        ioRows[0].id !== candidate.id ||
        ioRows[0].name !== 'curriculum.lesson_plan.validation' ||
        ioRows[0].traceId !== traceId
      ) {
        throw new Error(`Langfuse I/O lookup did not isolate validation trace ${traceId}.`)
      }

      let input: unknown
      let output: unknown
      try {
        input = typeof ioRows[0].input === 'string' ? JSON.parse(ioRows[0].input) : ioRows[0].input
        output =
          typeof ioRows[0].output === 'string' ? JSON.parse(ioRows[0].output) : ioRows[0].output
      } catch {
        throw new Error(`Langfuse validation output is invalid for trace ${traceId}.`)
      }
      if (
        !isRecord(input) ||
        typeof input.attempt !== 'number' ||
        !isRecord(output) ||
        typeof output.passed !== 'boolean'
      )
        continue
      const checks = Array.isArray(output.checks) ? output.checks : []
      attempts.push({
        attempt: input.attempt,
        passed: output.passed,
        checks: checks.flatMap((check) =>
          isRecord(check) && typeof check.code === 'string' && typeof check.passed === 'boolean'
            ? [{ code: check.code, passed: check.passed }]
            : [],
        ),
      })
    }
    attempts.sort((left, right) => left.attempt - right.attempt)
    if (attempts.length >= expectedAttempts) return attempts
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(
    `Langfuse recorded fewer than ${expectedAttempts} validation attempts for trace ${traceId}.`,
  )
}

async function fetchLangfuseObservations(
  baseUrl: string,
  authorization: string,
  params: URLSearchParams,
): Promise<unknown[]> {
  const response = await fetch(`${baseUrl}/api/public/v2/observations?${params}`, {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`Langfuse trace lookup returned HTTP ${response.status}.`)
  const body: unknown = await response.json()
  return isRecord(body) && Array.isArray(body.data) ? body.data : []
}

function option(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name)
  return index < 0
    ? fallback
    : (args[index + 1] ??
        (() => {
          throw new Error(`${name} requires a value.`)
        })())
}

function summarizeRubric(value: unknown) {
  if (!isRecord(value)) return null
  const dimensions = Array.isArray(value.dimensions) ? value.dimensions : []
  return {
    status: value.status,
    traceId: value.traceId,
    summary: value.summary,
    dimensions: dimensions.map((item) =>
      isRecord(item)
        ? {
            key: item.key,
            score: item.score,
            evidence: item.evidence,
            suggestions: item.suggestions,
          }
        : item,
    ),
  }
}

function matchesExpected(
  testCase: WorkflowCase,
  actual: {
    httpStatus: number
    outcome: string
    deterministicQa: unknown
    rubric: unknown
    generationAttempts: GenerationAttempt[]
    providerCalls: ProviderCall[]
    noDraftPersisted: boolean
  },
): boolean {
  const generationStatuses = actual.providerCalls
    .filter((call) => call.kind === 'generation')
    .map((call) => call.status)
  const hasSuccessfulRubric = actual.providerCalls.some(
    (call) => call.kind === 'rubric' && call.status === 200,
  )

  if (testCase.expectedOutcome === 'LLM_INVALID_RESPONSE') {
    return (
      actual.httpStatus === 503 &&
      actual.outcome === testCase.expectedOutcome &&
      actual.noDraftPersisted &&
      generationStatuses.length === 2 &&
      matchesDeterministicExpectation(testCase.deterministic, actual) &&
      !actual.providerCalls.some((call) => call.kind === 'rubric')
    )
  }
  if (testCase.expectedOutcome === 'LLM_PROVIDER_UNAVAILABLE') {
    return (
      actual.httpStatus === 503 &&
      actual.outcome === testCase.expectedOutcome &&
      actual.noDraftPersisted &&
      generationStatuses.length === 4 &&
      generationStatuses.every((status) => status === 503) &&
      matchesDeterministicExpectation(testCase.deterministic, actual) &&
      !actual.providerCalls.some((call) => call.kind === 'rubric')
    )
  }
  if (testCase.expectedOutcome === 'LLM_PROVIDER_AUTH_FAILED') {
    return (
      actual.httpStatus === 503 &&
      actual.outcome === testCase.expectedOutcome &&
      actual.noDraftPersisted &&
      generationStatuses.length === 1 &&
      generationStatuses[0] === 401 &&
      matchesDeterministicExpectation(testCase.deterministic, actual) &&
      !actual.providerCalls.some((call) => call.kind === 'rubric')
    )
  }

  const checks =
    isRecord(actual.deterministicQa) && Array.isArray(actual.deterministicQa.checks)
      ? actual.deterministicQa.checks
      : []
  if (
    actual.httpStatus !== 201 ||
    !isRecord(actual.deterministicQa) ||
    actual.deterministicQa.passed !== true ||
    !checks.every((check) => isRecord(check) && check.passed === true) ||
    !matchesDeterministicExpectation(testCase.deterministic, actual) ||
    !hasSuccessfulRubric ||
    !matchesRubricExpectation(testCase.rubric, actual.rubric)
  ) {
    return false
  }

  if (testCase.expectedOutcome === 'completed') return true
  if (testCase.expectedOutcome === 'draft_created_after_repair') {
    return generationStatuses.length === 2 && generationStatuses.every((status) => status === 200)
  }
  if (testCase.expectedOutcome === 'draft_created_after_retry') {
    return (
      generationStatuses.length === 2 &&
      generationStatuses[0] === 429 &&
      generationStatuses[1] === 200
    )
  }
  if (testCase.expectedOutcome === 'draft_created') return generationStatuses.length === 1
  return (
    testCase.expectedOutcome === 'draft_created_with_grounding_concern' &&
    generationStatuses.length === 1
  )
}

function matchesDeterministicExpectation(
  expected: Record<string, unknown>,
  actual: {
    deterministicQa: unknown
    generationAttempts: GenerationAttempt[]
    providerCalls: ProviderCall[]
  },
): boolean {
  const attempts = actual.generationAttempts
  const expectedPassed = expected.passed
  if (expectedPassed === true) {
    if (!isRecord(actual.deterministicQa) || actual.deterministicQa.passed !== true) return false
    if (attempts.length === 0 || attempts.at(-1)?.passed !== true) return false
  }
  if (expectedPassed === false && attempts.at(-1)?.passed !== false) return false
  if (Array.isArray(expected.firstAttemptFailed)) {
    const first = attempts[0]
    if (!first) return false
    const failedCodes = first.checks.filter((check) => !check.passed).map((check) => check.code)
    if (!matchesExactCodes(expected.firstAttemptFailed, failedCodes)) return false
  }
  if (Array.isArray(expected.failedChecks)) {
    const last = attempts.at(-1)
    const failedCodes =
      last?.checks.filter((check) => !check.passed).map((check) => check.code) ?? []
    if (!matchesExactCodes(expected.failedChecks, failedCodes)) return false
  }
  if (typeof expected.repairAttempts === 'number') {
    const repairs = Math.max(0, attempts.length - 1)
    if (repairs !== expected.repairAttempts) return false
    const repairCalls = actual.providerCalls.filter(
      (call) => call.kind === 'generation' && call.repairRequest === true,
    )
    if (
      repairCalls.length !== expected.repairAttempts ||
      repairCalls.some(
        (call) => call.repairIssuesPresent !== true || call.priorResponseMatched !== true,
      )
    ) {
      return false
    }
  }
  if (typeof expected.providerAttempts === 'number') {
    const providerAttempts = actual.providerCalls.filter(
      (call) => call.kind === 'generation',
    ).length
    if (providerAttempts !== expected.providerAttempts) return false
  }
  return true
}

function matchesExactCodes(expected: unknown[], actual: string[]): boolean {
  if (!expected.every((code): code is string => typeof code === 'string')) return false
  const expectedSorted = [...expected].sort()
  const actualSorted = [...actual].sort()
  return (
    expectedSorted.length === actualSorted.length &&
    expectedSorted.every((code, index) => code === actualSorted[index])
  )
}

export function matchesRubricExpectation(
  expected: Record<string, unknown> | null,
  actual: unknown,
): boolean {
  if (expected === null) return actual === null
  if (!isRecord(actual) || actual.status !== 'completed' || !Array.isArray(actual.dimensions))
    return false
  if (actual.dimensions.length !== rubricKeys.length || !actual.dimensions.every(isRecord))
    return false
  const dimensions = actual.dimensions
  const byKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]))
  if (
    byKey.size !== rubricKeys.length ||
    rubricKeys.some((key) => !byKey.has(key)) ||
    dimensions.some(
      (dimension) =>
        typeof dimension.score !== 'number' ||
        !Number.isInteger(dimension.score) ||
        dimension.score < 1 ||
        dimension.score > 4,
    )
  ) {
    return false
  }
  const expectedScores = isRecord(expected.expectedScores) ? expected.expectedScores : {}
  const expectedDimensions = isRecord(expected.dimensions) ? expected.dimensions : {}
  for (const [key, range] of [
    ...Object.entries(expectedScores),
    ...Object.entries(expectedDimensions),
  ]) {
    const dimension = byKey.get(key)
    if (!dimension || !matchesScoreRange(dimension.score, range)) return false
  }
  if (
    expected.evidenceRequired === true &&
    dimensions.some((dimension) => !hasItems(dimension.evidence))
  )
    return false
  if (
    (expected.suggestionsWhenBelowFour === true ||
      expected.actionableSuggestionRequired === true) &&
    dimensions.some(
      (dimension) =>
        typeof dimension.score === 'number' &&
        dimension.score < 4 &&
        !hasItems(dimension.suggestions),
    )
  ) {
    return false
  }
  if (Array.isArray(expected.suggestionConcepts)) {
    const suggestions = dimensions.flatMap((dimension) =>
      Array.isArray(dimension.suggestions)
        ? dimension.suggestions.filter(
            (suggestion): suggestion is string => typeof suggestion === 'string',
          )
        : [],
    )
    const concepts = expected.suggestionConcepts.filter(
      (concept): concept is string => typeof concept === 'string',
    )
    if (
      concepts.length > 0 &&
      !suggestions.some((suggestion) =>
        concepts.some((concept) => suggestion.toLowerCase().includes(concept.toLowerCase())),
      )
    ) {
      return false
    }
  }
  return matchesRubricBand(expected.band, dimensions)
}

function matchesRubricBand(band: unknown, dimensions: Array<Record<string, unknown>>): boolean {
  const scores = dimensions.map((dimension) => dimension.score as number)
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length
  if (band === 'strong') return scores.every((score) => score >= 3) && average >= 3.5
  if (band === 'strong_or_borderline') return scores.every((score) => score >= 2) && average >= 2.5
  if (band === 'borderline')
    return average >= 2 && average < 3 && scores.some((score) => score <= 2)
  if (band === 'weak') return average < 2.5
  if (band === 'weak_source_support') {
    const sourceSupport = dimensions.find((dimension) => dimension.key === 'source_support')
    return typeof sourceSupport?.score === 'number' && sourceSupport.score <= 2
  }
  return false
}

function matchesScoreRange(score: unknown, range: unknown): boolean {
  return (
    typeof score === 'number' &&
    Array.isArray(range) &&
    range.length === 2 &&
    typeof range[0] === 'number' &&
    typeof range[1] === 'number' &&
    score >= range[0] &&
    score <= range[1]
  )
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
