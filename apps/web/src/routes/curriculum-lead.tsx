import { createRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { AppShell } from '../components/app-shell'
import { LeadDashboard } from '../features/lesson-planning/pages/lead-dashboard'
import { requireRole } from '../lib/route-auth'
import { route as rootRoute } from './root'

function CurriculumLeadLayout() {
  const user = route.useRouteContext()
  const pathname = useRouterState({ select: state => state.location.pathname })
  return <AppShell role={user.roles[0]}>{pathname === '/curriculum-lead' ? <LeadDashboard /> : <Outlet />}</AppShell>
}

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/curriculum-lead',
  beforeLoad: ({ location }) => requireRole('curriculum_lead', location.href),
  component: CurriculumLeadLayout,
})
