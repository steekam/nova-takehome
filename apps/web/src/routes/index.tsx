import { createRoute } from '@tanstack/react-router'
import { route as rootRoute } from './root'

function HomePage() {
  return (
    <section className="intro">
      <p className="eyebrow">Curriculum Design Hub</p>
      <h1>Plan a lesson grounded in your curriculum.</h1>
      <p>The teacher and curriculum lead workflows will live here.</p>
    </section>
  )
}

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})
