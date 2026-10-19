import { redirect } from '@tanstack/react-router'
import type { UserRole } from '@nova/shared'
import { currentUserQuery } from './current-user'
import { queryClient } from './query-client'

export async function requireUser() {
  const user = await queryClient.ensureQueryData(currentUserQuery)
  if (!user) throw redirect({ to: '/login' })
  return user
}

export async function requireRole(role: UserRole) {
  const user = await requireUser()
  if (!user.roles.includes(role)) {
    throw redirect({ to: user.roles.includes('teacher') ? '/teacher' : '/curriculum-lead' })
  }
  return user
}
