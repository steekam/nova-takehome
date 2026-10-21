import { createRoute, redirect } from '@tanstack/react-router'
import { LibraryPage, LibraryTargetPage } from '../features/curriculum-library/pages'
import { requireUser } from '../lib/route-auth'
import { route as rootRoute } from './root'

function LibraryLayout() {
  return <LibraryPage user={libraryRoute.useRouteContext()} />
}

function LibraryTargetLayout() {
  const { targetRevisionId } = libraryTargetRoute.useParams()
  return <LibraryTargetPage key={targetRevisionId} targetRevisionId={targetRevisionId} />
}

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library',
  beforeLoad: async ({ location }) => {
    const user = await requireUser(location.href)
    if (!user.roles.some((role) => role === 'teacher' || role === 'curriculum_lead'))
      throw redirect({ to: '/login', search: { redirect: location.href } })
    return user
  },
  component: LibraryLayout,
})
const libraryTargetRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: 'targets/$targetRevisionId',
  component: LibraryTargetLayout,
})
export const route = libraryRoute.addChildren([libraryTargetRoute])
