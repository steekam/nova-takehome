import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { LessonPlanTable } from '../../../components/lesson-plan-table'
import { buttonVariants } from '../../../components/ui/button'
import { lessonPlanningKeys, listLessonPlans } from '../api'
import { toLessonPlanTableItems } from '../table-items'

export function LeadDashboard() {
  const queue = useQuery({ queryKey: lessonPlanningKeys.all, queryFn: listLessonPlans })
  const submitted = queue.data?.filter(plan => plan.status === 'submitted').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) ?? []
  const published = queue.data?.filter(plan => plan.status === 'published') ?? []

  return <div className="mx-auto max-w-5xl space-y-8">
    <header className="space-y-2 border-b border-primary/15 pb-6">
      <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
      <p className="max-w-2xl text-muted-foreground">Review submitted plans and publish work ready for teachers.</p>
    </header>
    {queue.error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Lesson plans could not be loaded: {queue.error.message} <button type="button" className="underline" onClick={() => void queue.refetch()}>Try again</button></p>}
    <section aria-label="Plan totals" className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border bg-card px-5 py-4"><p className="text-sm text-muted-foreground">Awaiting review</p><p className="mt-2 text-3xl font-semibold tabular-nums">{queue.isLoading || queue.isError ? '—' : submitted.length}</p></div>
      <div className="rounded-xl border bg-card px-5 py-4"><p className="text-sm text-muted-foreground">Published plans</p><p className="mt-2 text-3xl font-semibold tabular-nums">{queue.isLoading || queue.isError ? '—' : published.length}</p></div>
    </section>
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Review queue</h2>
      {queue.isLoading ? <div role="status" aria-label="Loading submitted plans" className="h-32 animate-pulse rounded-xl border bg-card" /> : queue.isError ? null : <LessonPlanTable plans={toLessonPlanTableItems(submitted)} actionLabel="Review" emptyMessage="No plans are waiting for review." renderAction={plan => <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} to="/curriculum-lead/reviews/$planId" params={{ planId: plan.id }}>Review plan<ArrowRight aria-hidden="true" /></Link>} />}
    </section>
  </div>
}
