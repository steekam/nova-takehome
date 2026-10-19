import { route as rootRoute } from './routes/root'
import { route as homeRoute } from './routes/index'

export const routeTree = rootRoute.addChildren([homeRoute])
