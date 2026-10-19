import { createRoute, redirect } from '@tanstack/react-router'
import { route as rootRoute } from './root'
import { requireUser } from '../lib/route-auth'

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async () => {
    const user = await requireUser()
    throw redirect({ to: user.roles.includes('teacher') ? '/teacher' : '/curriculum-lead' })
  },
})
