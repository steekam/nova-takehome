import { createRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import type { ApiPrincipal, LessonPlanContent, LessonPlanStatus } from '@nova/shared'
import { AppShell } from '../components/app-shell'
import { buttonVariants } from '../components/ui/button'
import { LessonPlanTable, type LessonPlanTableItem } from '../components/lesson-plan-table'
import { apiRequest } from '../lib/api-request'
import { requireRole } from '../lib/route-auth'
import { route as rootRoute } from './root'
import { EditPlanPage, GeneratePage, PlanDetailPage } from './teacher-plans'

type Plan = { id: string; teacherId: string; status: LessonPlanStatus; content: LessonPlanContent; version: number; createdAt: string; updatedAt: string }
type PlanResponse = Plan[] | { items: Plan[] }
const unwrap = <T,>(value: T[] | { items: T[] }) => Array.isArray(value) ? value : value.items
function TeacherHome() {
  const user = teacherRoute.useRouteContext()
  const pathname = useRouterState({ select: state => state.location.pathname })
  return pathname.replace(/\/+$/, '') === '/teacher' ? <TeacherDashboard user={user} /> : <Outlet />
}

function TeacherDashboard({ user }: { user: ApiPrincipal }) {
  const plans = useQuery({ queryKey: ['lesson-plans'], queryFn: async () => unwrap(await apiRequest<PlanResponse>('/api/lesson-plans')) })
  const ownPlans = plans.data?.filter(plan => plan.teacherId === user.subject && plan.status !== 'published') ?? []
  const drafts = ownPlans.filter(plan => plan.status === 'draft' || plan.status === 'returned')
  const inReview = ownPlans.filter(plan => plan.status === 'submitted')
  const orderedDrafts = [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const orderedInReview = [...inReview].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return <AppShell role={user.roles[0]}>
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-5 border-b border-primary/15 pb-7 sm:flex-row sm:items-end">
        <div className="space-y-2"><h1 className="text-3xl font-semibold tracking-tight">Overview</h1><p className="max-w-2xl text-muted-foreground">Continue a draft or revise a returned plan.</p></div>
      </header>
      {plans.error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Your plans could not be loaded: {plans.error.message}</p>}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-xl font-semibold">Draft and returned lesson plans</h2>{!plans.isLoading && <p className="text-sm text-muted-foreground">{drafts.length} plans</p>}</div>
        {plans.isLoading ? <div role="status" aria-label="Loading drafts and returned plans" className="h-32 animate-pulse rounded-xl border bg-card" /> : <LessonPlanTable plans={toTableItems(orderedDrafts)} actionLabel="Open" emptyMessage="No drafts or returned plans." renderAction={plan => <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} to="/teacher/plans/$planId" params={{ planId: plan.id }}>{plan.status === 'returned' ? 'Revise plan' : 'Continue draft'}<ArrowRight aria-hidden="true" /></Link>} />}
      </section>
      {orderedInReview.length > 0 && <section className="space-y-4 border-t pt-6"><div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-xl font-semibold">In review</h2><p className="text-sm text-muted-foreground">{orderedInReview.length} submitted</p></div><LessonPlanTable plans={toTableItems(orderedInReview)} actionLabel="Open" emptyMessage="No plans in review." renderAction={plan => <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} to="/teacher/plans/$planId" params={{ planId: plan.id }}>View plan<ArrowRight aria-hidden="true" /></Link>} /></section>}
    </div>
  </AppShell>
}

function toTableItems(plans: Plan[]): LessonPlanTableItem[] { return plans.map(plan => ({ id: plan.id, title: plan.content.title, subject: plan.content.subject, grade: plan.content.grade, status: plan.status, updatedAt: plan.updatedAt })) }

const teacherRoute = createRoute({ getParentRoute: () => rootRoute, path: '/teacher', beforeLoad: ({ location }) => requireRole('teacher', location.href), component: TeacherHome })
const teacherPlanNewRoute = createRoute({
  getParentRoute: () => teacherRoute,
  path: 'plans/new',
  component: () => <GeneratePage user={teacherRoute.useRouteContext()} />,
})
function TeacherPlanDetailRoute() {
  return <PlanDetailPage user={teacherRoute.useRouteContext()} planId={teacherPlanDetailRoute.useParams().planId} />
}
const teacherPlanDetailRoute = createRoute({
  getParentRoute: () => teacherRoute,
  path: 'plans/$planId',
  component: TeacherPlanDetailRoute,
})
function TeacherPlanEditRoute() {
  return <EditPlanPage user={teacherRoute.useRouteContext()} planId={teacherPlanEditRoute.useParams().planId} />
}
const teacherPlanEditRoute = createRoute({
  getParentRoute: () => teacherRoute,
  path: 'plans/$planId/edit',
  component: TeacherPlanEditRoute,
})
export const route = teacherRoute.addChildren([teacherPlanNewRoute, teacherPlanDetailRoute, teacherPlanEditRoute])
