import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { ApiError } from '../lib/api-client'

function RootLayout() {
  return <Outlet />
}

function RoutePending() {
  return <p className="route-state" role="status">Loading page…</p>
}

function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  const requestId = error instanceof ApiError ? error.requestId : undefined

  return (
    <section className="route-state" role="alert">
      <h1>We couldn’t load this page.</h1>
      <p>Check your connection, then try again. You can also return to sign in.</p>
      {requestId && <p className="request-id">Request ID: {requestId}</p>}
      <button type="button" className="mt-5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={reset}>Try again</button>
      <Link className="ml-3 text-sm font-medium text-primary underline underline-offset-4" to="/login">Sign in</Link>
    </section>
  )
}

function RouteNotFound() {
  return (
    <section className="route-state" role="status">
      <h1>Page not found.</h1>
      <p>The address may have changed or the page may no longer exist.</p>
      <Link className="mt-5 inline-block text-sm font-medium underline underline-offset-4" to="/">Back to Curriculum Design Hub</Link>
    </section>
  )
}

export const route = createRootRoute({
  component: RootLayout,
  pendingMs: 200,
  pendingMinMs: 300,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
})
