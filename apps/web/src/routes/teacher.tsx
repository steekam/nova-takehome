import { createRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { TeacherDashboard } from '../features/lesson-planning/pages/teacher-dashboard'
import { EditPlanPage, GeneratePage, PlanDetailPage } from '../features/lesson-planning/pages/teacher-plans'
import { requireRole } from '../lib/route-auth'
import { route as rootRoute } from './root'

function TeacherHome() {
  const user = teacherRoute.useRouteContext()
  const pathname = useRouterState({ select: state => state.location.pathname })
  return pathname.replace(/\/+$/, '') === '/teacher' ? <TeacherDashboard user={user} /> : <Outlet />
}

const teacherRoute = createRoute({ getParentRoute: () => rootRoute, path: '/teacher', beforeLoad: ({ location }) => requireRole('teacher', location.href), component: TeacherHome })
const teacherPlanNewRoute = createRoute({
  getParentRoute: () => teacherRoute,
  path: 'plans/new',
  component: () => <GeneratePage user={teacherRoute.useRouteContext()} />,
})
function TeacherPlanDetailRoute() {
  return <PlanDetailPage user={teacherRoute.useRouteContext()} planId={teacherPlanDetailRoute.useParams().planId} />
}
const teacherPlanDetailRoute = createRoute({
  getParentRoute: () => teacherRoute,
  path: 'plans/$planId',
  component: TeacherPlanDetailRoute,
})
function TeacherPlanEditRoute() {
  return <EditPlanPage user={teacherRoute.useRouteContext()} planId={teacherPlanEditRoute.useParams().planId} />
}
const teacherPlanEditRoute = createRoute({
  getParentRoute: () => teacherRoute,
  path: 'plans/$planId/edit',
  component: TeacherPlanEditRoute,
})
export const route = teacherRoute.addChildren([teacherPlanNewRoute, teacherPlanDetailRoute, teacherPlanEditRoute])
