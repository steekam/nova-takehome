import { redirect } from '@tanstack/react-router'
import type { UserRole } from '@nova/shared'
import { currentUserQuery } from './current-user'
import { queryClient } from './query-client'

export function homeForUser(user: { roles: UserRole[] }) {
  return user.roles.includes('teacher') ? '/teacher' : '/curriculum-lead'
}

export function safeRedirectTarget(target: unknown): string | undefined {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return undefined

  const url = new URL(target, 'http://nova.local')
  if (url.origin !== 'http://nova.local') return undefined
  return `${url.pathname}${url.search}${url.hash}`
}

export async function requireUser(returnTo?: string) {
  const user = await queryClient.ensureQueryData(currentUserQuery)
  if (!user) throw redirect({ to: '/login', search: { redirect: returnTo } })
  return user
}

export async function requireRole(role: UserRole, returnTo?: string) {
  const user = await requireUser(returnTo)
  if (!user.roles.includes(role)) {
    throw redirect({ to: homeForUser(user) })
  }
  return user
}
