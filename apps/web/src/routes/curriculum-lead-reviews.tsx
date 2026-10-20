import { createRoute } from '@tanstack/react-router'
import { LeadReviewPage } from '../features/lesson-planning/pages/lead-review'
import { requireRole } from '../lib/route-auth'
import { route as curriculumLeadRoute } from './curriculum-lead'

function SelectedPlan() {
  return <LeadReviewPage key={planRoute.useParams().planId} planId={planRoute.useParams().planId} />
}

export const planRoute = createRoute({
  getParentRoute: () => curriculumLeadRoute,
  path: 'reviews/$planId',
  beforeLoad: ({ location }) => requireRole('curriculum_lead', location.href),
  component: SelectedPlan,
})
