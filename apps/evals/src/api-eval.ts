import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  CurriculumLibraryResponseSchema,
  LessonPlanResponseSchema,
  LessonPlanRubricQaResponseSchema,
} from '@nova/shared'

type ApiResponse<T> = { value: T; requestId?: string }

function option(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name)
  return index < 0
    ? fallback
    : (args[index + 1] ??
        (() => {
          throw new Error(`${name} requires a value.`)
        })())
}

function matchesFramework(actual: string, requested: string): boolean {
  const normalized = actual.toLowerCase()
  const query = requested.toLowerCase()
  return (
    normalized === query || (query === 'cbc' && normalized.includes('competency based curriculum'))
  )
}

async function apiRequest<T>(
  baseUrl: string,
  token: string,
  pathname: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const requestId = randomUUID()
  const response = await fetch(new URL(pathname, baseUrl), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const responseRequestId = response.headers.get('x-request-id') ?? requestId
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message =
      typeof value === 'object' && value !== null && 'message' in value
        ? String(value.message)
        : response.statusText
    throw new Error(`${response.status} ${pathname} [request ${responseRequestId}]: ${message}`)
  }
  return { value: value as T, requestId: responseRequestId }
}

async function login(baseUrl: string, email: string, password: string): Promise<string> {
  const requestId = randomUUID()
  const response = await fetch(new URL('/api/auth/login', baseUrl), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok)
    throw new Error(
      `Login failed (${response.status}). Check the demo teacher credentials and API URL.`,
    )
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith('nova_access='))
  const token = cookie?.match(/(?:^|;\s*)nova_access=([^;]+)/)?.[1]
  if (!token)
    throw new Error('Login succeeded but the API did not return the nova_access session cookie.')
  return decodeURIComponent(token)
}

export async function runApiEvaluation(args: string[]): Promise<void> {
  const baseUrl = option(args, '--api', process.env.NOVA_EVAL_API_URL ?? 'http://localhost:3001')
  const email = process.env.NOVA_EVAL_TEACHER_EMAIL ?? 'teacher@example.test'
  const password = process.env.NOVA_EVAL_TEACHER_PASSWORD ?? 'NovaLocal123!'

  const targetFilters = {
    framework: option(args, '--framework', process.env.NOVA_EVAL_FRAMEWORK ?? 'CBC'),
    programme: option(args, '--programme', process.env.NOVA_EVAL_PROGRAMME ?? 'Junior School'),
    grade: option(args, '--grade', process.env.NOVA_EVAL_GRADE ?? 'Grade 8'),
    subject: option(args, '--subject', process.env.NOVA_EVAL_SUBJECT ?? 'Integrated Science'),
    edition: option(args, '--edition', process.env.NOVA_EVAL_EDITION ?? 'July 2024'),
    locator: option(args, '--locator', process.env.NOVA_EVAL_LOCATOR ?? ''),
  }
  const durationMinutes = Number(option(args, '--duration', '40'))
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240) {
    throw new Error('--duration must be an integer from 1 to 240.')
  }

  const token = await login(baseUrl, email, password)
  const catalogueResponse = await apiRequest<unknown>(baseUrl, token, '/api/curriculum/library')
  const catalogue = CurriculumLibraryResponseSchema.parse(catalogueResponse.value)
  const matches = catalogue.offerings
    .filter(
      (offering) =>
        matchesFramework(offering.framework, targetFilters.framework) &&
        offering.programme.toLowerCase() === targetFilters.programme.toLowerCase() &&
        offering.level.toLowerCase() === targetFilters.grade.toLowerCase() &&
        offering.subject.toLowerCase() === targetFilters.subject.toLowerCase(),
    )
    .flatMap((offering) =>
      offering.designs
        .filter(
          (design) =>
            design.editionLabel.toLowerCase() === targetFilters.edition.toLowerCase() &&
            design.status === 'published',
        )
        .flatMap((design) => design.targets),
    )
    .filter(
      (target) =>
        target.generationReady &&
        (!targetFilters.locator || target.locator === targetFilters.locator),
    )

  if (matches.length !== 1) {
    const choices = matches.map((target) => `${target.locator}: ${target.title}`).join('\n')
    throw new Error(
      matches.length
        ? `Target selection matched ${matches.length} outcomes. Pass --locator to select one:\n${choices}`
        : `No generation-ready target matched ${Object.entries(targetFilters)
            .filter(([, value]) => value)
            .map(([key, value]) => `${key}=${value}`)
            .join(', ')}. Check the seeded CBC catalogue or override the filters.`,
    )
  }

  const target = matches[0]!
  const generated = await apiRequest<unknown>(baseUrl, token, '/api/lesson-plans/generate', {
    targetRevisionId: target.id,
    durationMinutes,
  })
  const generation = LessonPlanResponseSchema.parse(generated.value)
  const validated = await apiRequest<unknown>(
    baseUrl,
    token,
    `/api/lesson-plans/${generation.plan.id}/validate`,
    {
      versionId: generation.plan.versionId,
    },
  )
  const validation = LessonPlanRubricQaResponseSchema.parse(validated.value)
  const report = {
    schemaVersion: 'api-evaluation-v1',
    evalRunId: randomUUID(),
    createdAt: new Date().toISOString(),
    apiUrl: baseUrl,
    durationMinutes,
    target: {
      id: target.id,
      framework: target.framework,
      programme: target.programme,
      grade: target.level,
      subject: target.subject,
      edition: target.editionLabel,
      locator: target.locator,
      title: target.title,
    },
    requests: {
      catalogue: catalogueResponse.requestId,
      generate: generated.requestId,
      validate: validated.requestId,
    },
    generation: {
      planId: generation.plan.id,
      versionId: generation.plan.versionId,
      qa: generation.qa,
      rubricQa: generation.rubricQa,
    },
    validation: validation.validation,
  }
  const reportDirectory = path.resolve(process.env.NOVA_EVAL_REPORTS_DIR ?? '.cache/evals/runs')
  await mkdir(reportDirectory, { recursive: true })
  const reportPath = path.join(reportDirectory, `${generation.plan.id}.json`)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  process.stdout.write(
    `API eval · ${target.framework} ${target.level} ${target.subject} · ${target.editionLabel} · ${target.locator}\n`,
  )
  process.stdout.write(
    `Plan ${generation.plan.id} · ${generation.plan.status} · deterministic QA ${generation.qa.passed ? 'pass' : 'fail'}\n`,
  )
  process.stdout.write(
    `Generation rubric QA ${generation.rubricQa?.status ?? 'not reported'} · trace ${generation.rubricQa?.traceId ?? 'not reported'}\n`,
  )
  process.stdout.write(
    `Explicit validation ${validation.validation.status} · ${validation.validation.reviewerModel} · trace ${validation.validation.traceId ?? 'not reported'}\n`,
  )
  process.stdout.write(
    `Requests: catalogue ${catalogueResponse.requestId} · generate ${generated.requestId} · validate ${validated.requestId}\n`,
  )
  process.stdout.write(`Report: ${reportPath}\n`)
  if (!generation.qa.passed || validation.validation.status !== 'completed') process.exitCode = 1
}
