import { createRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { AppShell } from '../components/app-shell'
import {
  LeadDashboard,
  type LeadQueueSearch,
} from '../features/lesson-planning/pages/lead-dashboard'
import { requireRole } from '../lib/route-auth'
import { route as rootRoute } from './root'

function CurriculumLeadLayout() {
  const user = route.useRouteContext()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <AppShell role={user.roles[0]}>
      {pathname === '/curriculum-lead' ? (
        <LeadDashboard
          search={search}
          onSearchChange={(next, options) =>
            void navigate({ search: () => next, replace: options?.replace })
          }
        />
      ) : (
        <Outlet />
      )}
    </AppShell>
  )
}

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/curriculum-lead',
  validateSearch: (search: Record<string, unknown>): LeadQueueSearch => ({
    subject: typeof search.subject === 'string' ? search.subject : undefined,
    grade: typeof search.grade === 'string' ? search.grade : undefined,
    order: search.order === 'newest' ? 'newest' : search.order === 'oldest' ? 'oldest' : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
  }),
  beforeLoad: ({ location }) => requireRole('curriculum_lead', location.href),
  component: CurriculumLeadLayout,
})
