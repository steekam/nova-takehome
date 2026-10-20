import { createRoute, redirect } from '@tanstack/react-router'
import { route as rootRoute } from './root'
import { homeForUser, requireUser } from '../lib/route-auth'

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ location }) => {
    const user = await requireUser(location.href)
    throw redirect({ to: homeForUser(user) })
  },
})
