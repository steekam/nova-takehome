import { createRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react'
import type { LessonPlanContent, LessonPlanStatus } from '@nova/shared'
import { AppShell } from '../components/app-shell'
import { LessonPlanTable, type LessonPlanTableItem } from '../components/lesson-plan-table'
import { PlanReviewHistory, PlanVersionHistory, type LessonPlanVersion, type PlanReview } from '../components/plan-history'
import { buttonVariants } from '../components/ui/button'
import { apiRequest } from '../lib/api-request'
import { requireUser } from '../lib/route-auth'
import { route as rootRoute } from './root'

type Plan = { id: string; teacherId: string; status: LessonPlanStatus; content: LessonPlanContent; version: number; updatedAt: string }
type Source = { documentId: string; chunkId: string; documentType: string; title: string; subject: string; grade: string; content: string }
type Detail = { plan: Plan; reviews: PlanReview[]; versions: LessonPlanVersion[] }
const unwrap = <T,>(value: T[] | { items: T[] }) => Array.isArray(value) ? value : value.items

function PublishedPlans() {
  const user = route.useRouteContext()
  const plans = useQuery({ queryKey: ['lesson-plans', user.roles[0]], queryFn: async () => unwrap(await apiRequest<Plan[] | { items: Plan[] }>('/api/lesson-plans')) })
  const published = (plans.data ?? []).filter(plan => plan.status === 'published').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return <AppShell role={user.roles[0]}>
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-primary/15 pb-5">
        <div><h1 className="text-3xl font-semibold tracking-tight">Lesson Plans</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Published plans for teachers and curriculum leads.</p></div>
        {user.roles.includes('teacher') && <Link className={buttonVariants()} to="/teacher/plans/new"><Plus aria-hidden="true" /> Create plan</Link>}
      </header>
      {plans.error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Published plans could not be loaded: {plans.error.message}</p>}
      {plans.isLoading ? <div role="status" aria-label="Loading published plans" className="h-32 animate-pulse rounded-xl border bg-card" /> : <LessonPlanTable plans={toTableItems(published)} actionLabel="View" emptyMessage="No published plans yet." renderAction={plan => <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} to="/lesson-plans/$planId" params={{ planId: plan.id }}>View plan<ArrowRight aria-hidden="true" /></Link>} />}
    </div>
  </AppShell>
}

function PublishedPlanPage() {
  const user = detailRoute.useRouteContext()
  const { planId } = detailRoute.useParams()
  const detail = useQuery({ queryKey: ['lesson-plan', planId], queryFn: () => apiRequest<Detail>(`/api/lesson-plans/${planId}`) })
  const sources = useQuery({ queryKey: ['curriculum-sources'], queryFn: async () => (await apiRequest<{ items: Source[] }>('/api/sources')).items })
  if (detail.isLoading) return <AppShell role={user.roles[0]}><div role="status" aria-label="Loading published lesson plan" className="h-96 animate-pulse rounded-xl border bg-card" /></AppShell>
  if (detail.error) return <AppShell role={user.roles[0]}><div className="space-y-4"><Link to="/lesson-plans" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"><ArrowLeft aria-hidden="true" className="size-4" />Lesson Plans</Link><p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">This plan could not be loaded: {detail.error.message}</p></div></AppShell>
  if (!detail.data) return null
  if (detail.data.plan.status !== 'published') return <AppShell role={user.roles[0]}><div className="space-y-4"><Link to="/lesson-plans" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"><ArrowLeft aria-hidden="true" className="size-4" />Lesson Plans</Link><p role="alert" className="rounded-lg border bg-card p-4 text-sm">This plan is no longer published.</p></div></AppShell>

  const { plan, reviews, versions } = detail.data
  const content = plan.content
  const references = content.sources.map(source => ({ source, detail: sources.data?.find(item => item.documentId === source.documentId && item.chunkId === source.chunkId) }))

  return <AppShell role={user.roles[0]}>
    <div className="space-y-7">
      <header className="space-y-3 border-b border-primary/15 pb-6">
        <Link to="/lesson-plans" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><ArrowLeft aria-hidden="true" className="size-4" />Lesson Plans</Link>
        <div><p className="text-sm font-medium text-primary">{content.subject} · Grade {content.grade} · {content.durationMinutes} minutes</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{content.title}</h1><p className="mt-3 max-w-4xl text-sm leading-6">{content.learningOutcome}</p></div>
      </header>
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.7fr)]">
        <main className="min-w-0 space-y-7">
          <section className="grid gap-6 rounded-xl border bg-card p-5 md:grid-cols-2 md:p-6"><div><h2 className="text-lg font-semibold">Objectives</h2><ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-6 text-muted-foreground">{content.objectives.map((item, index) => <li key={index}>{item}</li>)}</ul></div><div><h2 className="text-lg font-semibold">Materials</h2>{content.materials.length ? <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-6 text-muted-foreground">{content.materials.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No additional materials.</p>}</div></section>
          <section className="rounded-xl border bg-card p-5 md:p-6"><h2 className="text-lg font-semibold">Lesson sequence</h2><div className="mt-4 space-y-4"><article className="rounded-lg bg-muted/55 p-4"><h3 className="font-semibold">Starter</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{content.starter}</p></article>{content.activities.map((activity, index) => <article key={index} className="rounded-lg bg-muted/55 p-4"><div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><h3 className="font-semibold">{activity.title}</h3><span className="text-sm tabular-nums text-muted-foreground">{activity.durationMinutes} min</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{activity.description}</p></article>)}</div></section>
          <section className="rounded-xl border bg-card p-5 md:p-6"><h2 className="text-lg font-semibold">Assessment</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{content.checkForUnderstanding}</p></section>
        </main>
        <aside className="space-y-7 xl:sticky xl:top-6">
          <section className="space-y-3"><h2 className="text-lg font-semibold">Curriculum sources</h2>{sources.isLoading ? <p role="status" className="text-sm text-muted-foreground">Loading source details…</p> : sources.error ? <p role="alert" className="text-sm text-destructive">Source details could not be loaded: {sources.error.message}</p> : references.length ? references.map(({ source, detail }, index) => <article key={`${source.documentId}-${source.chunkId}`} className="rounded-xl border bg-card p-4"><h3 className="font-semibold">{detail?.title ?? `Source ${index + 1}`}</h3>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail.documentType} · {detail.subject} · Grade {detail.grade}</p>}<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{detail?.content ?? `Source reference ${source.documentId} · ${source.chunkId}`}</p></article>) : <p className="text-sm text-muted-foreground">No curriculum sources attached.</p>}</section>
          <PlanVersionHistory versions={versions} currentVersion={plan.version} />
          <PlanReviewHistory reviews={reviews} />
        </aside>
      </div>
    </div>
  </AppShell>
}

function toTableItems(plans: Plan[]): LessonPlanTableItem[] { return plans.map(plan => ({ id: plan.id, title: plan.content.title, subject: plan.content.subject, grade: plan.content.grade, status: plan.status, updatedAt: plan.updatedAt })) }

export const route = createRoute({ getParentRoute: () => rootRoute, path: '/lesson-plans', beforeLoad: ({ location }) => requireUser(location.href), component: PublishedPlans })
const detailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/lesson-plans/$planId', beforeLoad: ({ location }) => requireUser(location.href), component: PublishedPlanPage })
export const detailRouteForPublishedPlan = detailRoute
