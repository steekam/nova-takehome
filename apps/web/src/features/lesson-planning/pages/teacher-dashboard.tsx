import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Trash2 } from 'lucide-react'
import type { ApiPrincipal } from '@nova/shared'
import { AppShell } from '../../../components/app-shell'
import { LessonPlanTable } from '../../../components/lesson-plan-table'
import { Button, buttonVariants } from '../../../components/ui/button'
import { deleteLessonPlan, lessonPlanningKeys, listLessonPlans } from '../api'
import { toLessonPlanTableItems } from '../table-items'

export function TeacherDashboard({ user }: { user: ApiPrincipal }) {
  const queryClient = useQueryClient()
  const plans = useQuery({ queryKey: lessonPlanningKeys.all, queryFn: listLessonPlans })
  const removePlan = useMutation({
    mutationFn: deleteLessonPlan,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.all }),
  })
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
              Continue a draft or revise a returned plan. Only unreviewed drafts can be deleted;
              plans with review history stay available for audit.
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
        {removePlan.error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
          >
            The lesson plan could not be removed: {removePlan.error.message}
          </p>
        )}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Draft and returned lesson plans</h2>
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
              emptyAction={
                <Link className={buttonVariants({ size: 'sm' })} to="/teacher/plans/new">
                  Create a lesson plan
                  <ArrowRight aria-hidden="true" />
                </Link>
              }
              renderAction={(plan) => (
                <div className="flex flex-wrap justify-end gap-2">
                  <Link
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    to="/teacher/plans/$planId"
                    params={{ planId: plan.id }}
                  >
                    {plan.status === 'returned' ? 'Revise plan' : 'Continue draft'}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                  {plan.canDelete && (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={removePlan.isPending}
                      aria-label={`Delete ${plan.title}`}
                      onClick={() => {
                        const confirmed = window.confirm(
                          `Remove “${plan.title}” from your workspace? Its saved versions will be retained.`,
                        )
                        if (confirmed) removePlan.mutate(plan.id)
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                      Delete
                    </Button>
                  )}
                </div>
              )}
            />
          )}
        </section>
        {!plans.isError && orderedInReview.length > 0 && (
          <section className="space-y-4 border-t pt-6">
            <h2 className="text-xl font-semibold">In review</h2>
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
