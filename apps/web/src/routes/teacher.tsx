import { createRoute } from '@tanstack/react-router'
import { BookOpenCheck, Sparkles } from 'lucide-react'
import type { ApiPrincipal } from '@nova/shared'
import { AppShell } from '../components/app-shell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { requireRole } from '../lib/route-auth'
import { route as rootRoute } from './root'

function TeacherHome() {
  const user = route.useRouteContext()

  return <TeacherWorkspace user={user} />
}

function TeacherWorkspace({ user }: { user: ApiPrincipal }) {
  return (
    <AppShell role={user.roles[0]}>
      <div className="space-y-8">
        <section className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Teacher workspace</p>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="max-w-xl text-muted-foreground">Plan a lesson grounded in your curriculum.</p>
        </section>
        <Card className="max-w-2xl">
          <CardHeader className="flex-row items-start gap-4 space-y-0">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <div className="space-y-1.5">
              <CardTitle>Your workspace is ready</CardTitle>
              <CardDescription>Lesson planning tools will appear here.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpenCheck className="size-4" aria-hidden="true" />
              Create and manage your lesson plans.
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teacher',
  beforeLoad: () => requireRole('teacher'),
  component: TeacherHome,
})
