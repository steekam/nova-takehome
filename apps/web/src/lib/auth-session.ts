import type { ApiPrincipal } from '@nova/shared'

export function safeRedirectTarget(target: unknown): string | undefined {
  if (
    typeof target !== 'string' ||
    !target.startsWith('/') ||
    target.startsWith('//') ||
    target.includes('\\')
  )
    return undefined

  const url = new URL(target, 'http://nova.local')
  if (url.origin !== 'http://nova.local') return undefined
  return `${url.pathname}${url.search}${url.hash}`
}

export function homeForUser(user: Pick<ApiPrincipal, 'permissions'>) {
  return user.permissions.includes('lesson_plan:review') ? '/curriculum-lead' : '/teacher'
}

export async function loadCurrentUser<T>(getMe: () => Promise<T>) {
  try {
    return (await getMe()) ?? null
  } catch (error) {
    if (isUnauthorized(error)) return null
    throw error
  }
}

export async function loginAndCache<T extends ApiPrincipal>(
  login: () => Promise<T | undefined>,
  clear: () => void,
  setUser: (user: T) => void,
) {
  const user = await login()
  if (!user) throw new Error('The server returned an empty login response.')
  clear()
  setUser(user)
  return user
}

export async function logoutAndClear(logout: () => Promise<unknown>, clear: () => void) {
  await logout()
  clear()
}

export function destinationAfterLogin(returnTo: unknown, user: ApiPrincipal) {
  return safeRedirectTarget(returnTo) ?? homeForUser(user)
}

export function expireSession(
  location: { pathname: string; href: string },
  clear: () => void,
  navigate: (href: string) => void,
) {
  if (location.pathname === '/login') return
  clear()
  navigate(location.href)
}

function isUnauthorized(error: unknown): error is { status: number } {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 401
}
