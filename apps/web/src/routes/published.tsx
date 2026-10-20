import { createRoute } from '@tanstack/react-router'
import { PublishedPlanPage, PublishedPlans } from '../features/lesson-planning/pages/published'
import { requireUser } from '../lib/route-auth'
import { route as rootRoute } from './root'

function PublishedPlansRoute() {
  return <PublishedPlans user={publishedRoute.useRouteContext()} />
}

function PublishedPlanRoute() {
  return <PublishedPlanPage user={publishedPlanRoute.useRouteContext()} planId={publishedPlanRoute.useParams().planId} />
}

export const publishedRoute = createRoute({ getParentRoute: () => rootRoute, path: '/lesson-plans', beforeLoad: ({ location }) => requireUser(location.href), component: PublishedPlansRoute })
const publishedPlanRoute = createRoute({ getParentRoute: () => rootRoute, path: '/lesson-plans/$planId', beforeLoad: ({ location }) => requireUser(location.href), component: PublishedPlanRoute })
export const route = publishedRoute
export const detailRouteForPublishedPlan = publishedPlanRoute
