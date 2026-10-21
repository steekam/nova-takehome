import { route as rootRoute } from './routes/root'
import { route as homeRoute } from './routes/index'
import { route as loginRoute } from './routes/login'
import { route as teacherRoute } from './routes/teacher'
import { route as curriculumLeadRoute } from './routes/curriculum-lead'
import { route as libraryRoute } from './routes/library'
import { planRoute } from './routes/curriculum-lead-reviews'
import { route as publishedRoute, detailRouteForPublishedPlan } from './routes/published'

const curriculumLeadTree = curriculumLeadRoute.addChildren([planRoute])

export const routeTree = rootRoute.addChildren([
  homeRoute,
  teacherRoute,
  curriculumLeadTree,
  libraryRoute,
  publishedRoute,
  detailRouteForPublishedPlan,
  loginRoute,
])
