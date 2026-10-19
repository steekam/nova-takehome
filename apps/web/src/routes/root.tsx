import { createRootRoute, Outlet } from '@tanstack/react-router'

function RootLayout() {
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">Nova Curriculum Hub</a>
      </header>
      <main className="page-shell">
        <Outlet />
      </main>
    </>
  )
}

export const route = createRootRoute({ component: RootLayout })
