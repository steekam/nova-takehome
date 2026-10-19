import { route as rootRoute } from './routes/root'
import { route as homeRoute } from './routes/index'
import { route as loginRoute } from './routes/login'
import { route as teacherRoute } from './routes/teacher'
import { route as curriculumLeadRoute } from './routes/curriculum-lead'

export const routeTree = rootRoute.addChildren([homeRoute, teacherRoute, curriculumLeadRoute, loginRoute])
