import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './api-schema'

export interface ApiValidationIssue {
  field: string
  constraints: string[]
}

interface ApiErrorOptions {
  status: number
  message: string
  code?: string
  errors?: ApiValidationIssue[]
  requestId?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly errors?: ApiValidationIssue[]
  readonly requestId?: string

  constructor(options: ApiErrorOptions) {
    super(options.message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
    this.errors = options.errors
    this.requestId = options.requestId
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '')

const requestIdMiddleware: Middleware = {
  onRequest({ request }) {
    if (!request.headers.has('X-Request-Id')) request.headers.set('X-Request-Id', crypto.randomUUID())
    return request
  },
  async onResponse({ response }) {
    if (!response.ok) throw await toApiError(response.clone())
    return response
  },
}

export const apiClient = createClient<paths>({ baseUrl: apiBaseUrl, credentials: 'include' })
apiClient.use(requestIdMiddleware)

async function toApiError(response: Response): Promise<ApiError> {
  const payload: unknown = await response.json().catch(() => undefined)
  const body = isRecord(payload) ? payload : undefined
  const message = typeof body?.message === 'string'
    ? body.message
    : Array.isArray(body?.message) && body.message.every((item: unknown) => typeof item === 'string')
      ? body.message.join('. ')
      : response.statusText || 'Request failed'

  return new ApiError({
    status: response.status,
    message,
    code: typeof body?.code === 'string' ? body.code : undefined,
    errors: isValidationIssues(body?.errors) ? body.errors : undefined,
    requestId: response.headers.get('x-request-id') ?? (typeof body?.requestId === 'string' ? body.requestId : undefined),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidationIssues(value: unknown): value is ApiValidationIssue[] {
  return Array.isArray(value) && value.every((issue: unknown) =>
    isRecord(issue) &&
    typeof issue.field === 'string' &&
    Array.isArray(issue.constraints) &&
    issue.constraints.every((constraint: unknown) => typeof constraint === 'string'),
  )
}
