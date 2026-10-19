export class ApiRequestError extends Error {
  readonly status: number
  readonly code?: string
  readonly requestId?: string

  constructor(options: { status: number; message: string; code?: string; requestId?: string }) {
    super(options.message)
    this.name = 'ApiRequestError'
    this.status = options.status
    this.code = options.code
    this.requestId = options.requestId
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '')

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })
  if (!response.ok) throw await parseApiError(response)
  return response.json() as Promise<T>
}

async function parseApiError(response: Response): Promise<ApiRequestError> {
  const payload: unknown = await response.json().catch(() => undefined)
  const body = isRecord(payload) ? payload : undefined
  const rawMessage = body?.message
  const message = typeof rawMessage === 'string'
    ? rawMessage
    : Array.isArray(rawMessage) && rawMessage.every(item => typeof item === 'string')
      ? rawMessage.join('. ')
      : response.statusText || 'Request failed. Please try again.'

  return new ApiRequestError({
    status: response.status,
    message,
    code: typeof body?.code === 'string' ? body.code : undefined,
    requestId: typeof body?.requestId === 'string' ? body.requestId : response.headers.get('x-request-id') ?? undefined,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
