import { createRoute } from '@tanstack/react-router'
import { LeadReviewPage } from '../features/lesson-planning/pages/lead-review'
import { requirePermission } from '../lib/route-auth'
import { route as curriculumLeadRoute } from './curriculum-lead'

function SelectedPlan() {
  const planId = planRoute.useParams().planId
  return (
    <LeadReviewPage key={planId} planId={planId} overviewSearch={curriculumLeadRoute.useSearch()} />
  )
}

export const planRoute = createRoute({
  getParentRoute: () => curriculumLeadRoute,
  path: 'reviews/$planId',
  beforeLoad: ({ location }) => requirePermission('lesson_plan:review', location.href),
  component: SelectedPlan,
})
