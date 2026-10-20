import { apiResponseError } from './api-client'

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '')

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has('X-Request-Id')) headers.set('X-Request-Id', crypto.randomUUID())
  if (init?.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })
  if (!response.ok) throw await apiResponseError(response)
  return response.json() as Promise<T>
}
