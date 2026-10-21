import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import type { ApiPrincipal } from '@nova/shared'
import { AppShell } from '../../../components/app-shell'
import { LessonPlanTable } from '../../../components/lesson-plan-table'
import { buttonVariants } from '../../../components/ui/button'
import { lessonPlanningKeys, listLessonPlans } from '../api'
import { toLessonPlanTableItems } from '../table-items'

export function TeacherDashboard({ user }: { user: ApiPrincipal }) {
  const plans = useQuery({ queryKey: lessonPlanningKeys.all, queryFn: listLessonPlans })
  const ownPlans =
    plans.data?.filter((plan) => plan.teacherId === user.subject && plan.status !== 'published') ??
    []
  const drafts = ownPlans.filter((plan) => plan.status === 'draft' || plan.status === 'returned')
  const inReview = ownPlans.filter((plan) => plan.status === 'submitted')
  const orderedDrafts = [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const orderedInReview = [...inReview].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <AppShell role={user.roles[0]}>
      <div className="space-y-8">
        <header className="flex flex-col justify-between gap-5 border-b border-primary/15 pb-7 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
            <p className="max-w-2xl text-muted-foreground">
              Continue a draft or revise a returned plan.
            </p>
          </div>
          <Link className={buttonVariants()} to="/teacher/plans/new">
            Create lesson plan
            <ArrowRight aria-hidden="true" />
          </Link>
        </header>
        {plans.error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            Your plans could not be loaded: {plans.error.message}{' '}
            <button type="button" className="underline" onClick={() => void plans.refetch()}>
              Try again
            </button>
          </p>
        )}
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold">Draft and returned lesson plans</h2>
            {!plans.isLoading && !plans.isError && (
              <p className="text-sm text-muted-foreground">{drafts.length} plans</p>
            )}
          </div>
          {plans.isLoading ? (
            <div
              role="status"
              aria-label="Loading drafts and returned plans"
              className="h-32 animate-pulse rounded-xl border bg-card"
            />
          ) : plans.isError ? null : (
            <LessonPlanTable
              plans={toLessonPlanTableItems(orderedDrafts)}
              actionLabel="Open"
              emptyMessage="No drafts or returned plans."
              renderAction={(plan) => (
                <Link
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  to="/teacher/plans/$planId"
                  params={{ planId: plan.id }}
                >
                  {plan.status === 'returned' ? 'Revise plan' : 'Continue draft'}
                  <ArrowRight aria-hidden="true" />
                </Link>
              )}
            />
          )}
        </section>
        {!plans.isError && orderedInReview.length > 0 && (
          <section className="space-y-4 border-t pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold">In review</h2>
              <p className="text-sm text-muted-foreground">{orderedInReview.length} submitted</p>
            </div>
            <LessonPlanTable
              plans={toLessonPlanTableItems(orderedInReview)}
              actionLabel="Open"
              emptyMessage="No plans in review."
              renderAction={(plan) => (
                <Link
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  to="/teacher/plans/$planId"
                  params={{ planId: plan.id }}
                >
                  View plan
                  <ArrowRight aria-hidden="true" />
                </Link>
              )}
            />
          </section>
        )}
      </div>
    </AppShell>
  )
}
