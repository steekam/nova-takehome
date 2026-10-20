import { createRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import type { LessonPlanContent, LessonPlanStatus } from '@nova/shared'
import { AppShell } from '../components/app-shell'
import { buttonVariants } from '../components/ui/button'
import { LessonPlanTable, type LessonPlanTableItem } from '../components/lesson-plan-table'
import { apiRequest } from '../lib/api-request'
import { requireRole } from '../lib/route-auth'
import { route as rootRoute } from './root'

type Plan = {
  id: string
  status: LessonPlanStatus
  content: LessonPlanContent
  updatedAt: string
}

function CurriculumLeadLayout() {
  const user = route.useRouteContext()
  const pathname = useRouterState({ select: state => state.location.pathname })

  return <AppShell role={user.roles[0]}>
    {pathname === '/curriculum-lead' ? <CurriculumLeadHome /> : <Outlet />}
  </AppShell>
}

function CurriculumLeadHome() {
  const queue = useQuery({
    queryKey: ['lesson-plans'],
    queryFn: async () => (await apiRequest<{ items: Plan[] }>('/api/lesson-plans')).items,
  })
  const submitted = queue.data?.filter(plan => plan.status === 'submitted').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) ?? []
  const published = queue.data?.filter(plan => plan.status === 'published') ?? []

  return <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-2 border-b border-primary/15 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="max-w-2xl text-muted-foreground">Review submitted plans and publish work ready for teachers.</p>
      </header>

      {queue.error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Lesson plans could not be loaded: {queue.error.message}</p>}

      <section aria-label="Plan totals" className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card px-5 py-4"><p className="text-sm text-muted-foreground">Awaiting review</p><p className="mt-2 text-3xl font-semibold tabular-nums">{queue.isLoading ? '—' : submitted.length}</p></div>
        <div className="rounded-xl border bg-card px-5 py-4"><p className="text-sm text-muted-foreground">Published plans</p><p className="mt-2 text-3xl font-semibold tabular-nums">{queue.isLoading ? '—' : published.length}</p></div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Review queue</h2>
        {queue.isLoading ? <div role="status" aria-label="Loading submitted plans" className="h-32 animate-pulse rounded-xl border bg-card" /> : <LessonPlanTable plans={toTableItems(submitted)} actionLabel="Review" emptyMessage="No plans are waiting for review." renderAction={plan => <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} to="/curriculum-lead/reviews/$planId" params={{ planId: plan.id }}>Review plan<ArrowRight aria-hidden="true" /></Link>} />}
      </section>
  </div>
}

function toTableItems(plans: Plan[]): LessonPlanTableItem[] { return plans.map(plan => ({ id: plan.id, title: plan.content.title, subject: plan.content.subject, grade: plan.content.grade, status: plan.status, updatedAt: plan.updatedAt })) }

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/curriculum-lead',
  beforeLoad: ({ location }) => requireRole('curriculum_lead', location.href),
  component: CurriculumLeadLayout,
})
