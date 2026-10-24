import { redirect } from '@tanstack/react-router'
import type { Permission } from '@nova/shared'
import { currentUserQuery } from './current-user'
import { queryClient } from './query-client'
import { homeForUser } from './auth-session'
export { homeForUser, safeRedirectTarget } from './auth-session'

export async function requireUser(returnTo?: string) {
  const user = await queryClient.fetchQuery(currentUserQuery)
  if (!user) throw redirect({ to: '/login', search: { redirect: returnTo } })
  return user
}

export async function requirePermission(permission: Permission, returnTo?: string) {
  const user = await requireUser(returnTo)
  if (!user.permissions.includes(permission)) {
    throw redirect({ to: homeForUser(user) })
  }
  return user
}
