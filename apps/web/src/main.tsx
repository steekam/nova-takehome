import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { setUnauthorizedHandler } from './lib/api-client'
import { queryClient } from './lib/query-client'
import { expireSession } from './lib/auth-session'
import { routeTree } from './routeTree'
import './styles.css'

const router = createRouter({ routeTree })

setUnauthorizedHandler(() => {
  const location = router.state.location
  expireSession(
    location,
    () => queryClient.clear(),
    (href) => {
      void router.navigate({ to: '/login', search: { redirect: href } })
    },
  )
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
