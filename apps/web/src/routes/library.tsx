import { createRoute } from '@tanstack/react-router'
import {
  LibraryPage,
  LibraryTargetPage,
  type LibrarySearch,
} from '../features/curriculum-library/pages'
import { requireUser } from '../lib/route-auth'
import { route as rootRoute } from './root'

function LibraryLayout() {
  const navigate = libraryRoute.useNavigate()
  return (
    <LibraryPage
      user={libraryRoute.useRouteContext()}
      search={libraryRoute.useSearch()}
      onSearchChange={(search, options) => void navigate({ search, replace: options?.replace })}
    />
  )
}

function LibraryTargetLayout() {
  const { targetRevisionId } = libraryTargetRoute.useParams()
  return (
    <LibraryTargetPage
      key={targetRevisionId}
      targetRevisionId={targetRevisionId}
      user={libraryRoute.useRouteContext()}
      search={libraryRoute.useSearch()}
    />
  )
}

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library',
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    open: typeof search.open === 'string' ? search.open : undefined,
    offering: typeof search.offering === 'string' ? search.offering : undefined,
    edition: typeof search.edition === 'string' ? search.edition : undefined,
    content: typeof search.content === 'string' ? search.content : undefined,
  }),
  beforeLoad: ({ location }) => requireUser(location.href),
  component: LibraryLayout,
})
const libraryTargetRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: 'targets/$targetRevisionId',
  component: LibraryTargetLayout,
})
export const route = libraryRoute.addChildren([libraryTargetRoute])
