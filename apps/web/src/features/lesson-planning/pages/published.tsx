import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react'
import type { ApiPrincipal } from '@nova/shared'
import { AppShell } from '../../../components/app-shell'
import { LessonPlanTable } from '../../../components/lesson-plan-table'
import { buttonVariants } from '../../../components/ui/button'
import { PlanDetailLayout } from '../components/plan-detail-layout'
import { getLessonPlan, lessonPlanningKeys, listLessonPlans } from '../api'
import { curriculumLibraryKeys, listCurriculumSources } from '../../curriculum-library/api'
import { toLessonPlanTableItems } from '../table-items'

export function PublishedPlans({ user }: { user: ApiPrincipal }) {
  const plans = useQuery({
    queryKey: [...lessonPlanningKeys.all, user.subject],
    queryFn: listLessonPlans,
  })
  const published = (plans.data ?? [])
    .filter((plan) => plan.status === 'published')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <AppShell permissions={user.permissions}>
      <div className="space-y-7">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-primary/15 pb-5">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Lesson Plans</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Published plans for teachers and curriculum leads.
            </p>
          </div>
          {user.permissions.includes('lesson_plan:create') && (
            <Link className={buttonVariants()} to="/teacher/plans/new">
              <Plus aria-hidden="true" /> Create plan
            </Link>
          )}
        </header>
        {plans.error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            Published plans could not be loaded: {plans.error.message}{' '}
            <button type="button" className="underline" onClick={() => void plans.refetch()}>
              Try again
            </button>
          </p>
        )}
        {plans.isLoading ? (
          <div
            role="status"
            aria-label="Loading published plans"
            className="h-32 animate-pulse rounded-xl border bg-card"
          />
        ) : plans.isError ? null : (
          <LessonPlanTable
            plans={toLessonPlanTableItems(published)}
            actionLabel="View"
            emptyMessage="No published plans yet."
            emptyAction={
              user.permissions.includes('lesson_plan:create') ? (
                <Link className={buttonVariants({ size: 'sm' })} to="/teacher/plans/new">
                  <Plus aria-hidden="true" /> Create plan
                </Link>
              ) : (
                <Link
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  to="/curriculum-lead"
                >
                  Open review queue
                  <ArrowRight aria-hidden="true" />
                </Link>
              )
            }
            renderAction={(plan) => (
              <Link
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                to="/lesson-plans/$planId"
                params={{ planId: plan.id }}
              >
                View plan
                <ArrowRight aria-hidden="true" />
              </Link>
            )}
          />
        )}
      </div>
    </AppShell>
  )
}

export function PublishedPlanPage({ user, planId }: { user: ApiPrincipal; planId: string }) {
  const detail = useQuery({
    queryKey: lessonPlanningKeys.detail(planId),
    queryFn: () => getLessonPlan(planId),
  })
  const sources = useQuery({
    queryKey: curriculumLibraryKeys.sources,
    queryFn: listCurriculumSources,
  })
  if (detail.isLoading)
    return (
      <AppShell permissions={user.permissions}>
        <div
          role="status"
          aria-label="Loading published lesson plan"
          className="h-96 animate-pulse rounded-xl border bg-card"
        />
      </AppShell>
    )
  if (detail.error)
    return (
      <AppShell permissions={user.permissions}>
        <div className="space-y-4">
          <Link
            to="/lesson-plans"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Lesson Plans
          </Link>
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            This plan could not be loaded: {detail.error.message}
          </p>
        </div>
      </AppShell>
    )
  if (!detail.data) return null
  if (detail.data.plan.status !== 'published')
    return (
      <AppShell permissions={user.permissions}>
        <div className="space-y-4">
          <Link
            to="/lesson-plans"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Lesson Plans
          </Link>
          <p role="alert" className="rounded-lg border bg-card p-4 text-sm">
            This plan is no longer published.
          </p>
        </div>
      </AppShell>
    )

  const plan = detail.data.plan
  const content = plan.content

  return (
    <AppShell permissions={user.permissions}>
      <PlanDetailLayout
        detail={detail.data}
        sources={sources.data ?? []}
        sourcesLoading={sources.isLoading}
        sourcesError={sources.error?.message}
        backLink={
          <Link
            to="/lesson-plans"
            className="mb-1 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Lesson Plans
          </Link>
        }
        headerSupplement={
          plan.targetRevisionId ? (
            <Link
              to="/library/targets/$targetRevisionId"
              params={{ targetRevisionId: plan.targetRevisionId }}
              className="mt-1 inline-flex text-sm font-medium text-primary hover:underline"
            >
              View exact curriculum target
            </Link>
          ) : undefined
        }
      >
        <main className="space-y-7">
          <section className="rounded-xl border bg-card p-5 md:p-6">
            <h2 className="text-lg font-semibold">Learning goals</h2>
            <div className="mt-5 space-y-5">
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground">Learning outcome</h3>
                <p className="mt-2 leading-7">{content.learningOutcome}</p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground">Objectives</h3>
                <ul className="mt-2 list-inside list-disc space-y-2 text-sm leading-6 text-muted-foreground">
                  {content.objectives.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </section>
            </div>
          </section>
          <section className="rounded-xl border bg-card p-5 md:p-6">
            <h2 className="text-lg font-semibold">Lesson sequence</h2>
            <div className="mt-5 space-y-6">
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground">Materials</h3>
                {content.materials.length ? (
                  <ul className="mt-2 list-inside list-disc space-y-2 text-sm leading-6 text-muted-foreground">
                    {content.materials.map((item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No additional materials.</p>
                )}
              </section>
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground">Starter</h3>
                <p className="mt-2 whitespace-pre-wrap leading-7">{content.starter}</p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground">Activities</h3>
                <ol className="mt-2 divide-y">
                  {content.activities.map((activity, index) => (
                    <li key={`${index}-${activity.title}`} className="flex gap-4 py-4 first:pt-0">
                      <span
                        aria-hidden="true"
                        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h4 className="font-semibold">{activity.title}</h4>
                          <span className="text-sm text-muted-foreground">
                            {activity.durationMinutes} min
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap leading-7 text-muted-foreground">
                          {activity.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </section>
          <section className="rounded-xl border bg-card p-5 md:p-6">
            <h2 className="text-lg font-semibold">Assessment</h2>
            <p className="mt-2 whitespace-pre-wrap leading-7 text-muted-foreground">
              {content.checkForUnderstanding}
            </p>
          </section>
        </main>
      </PlanDetailLayout>
    </AppShell>
  )
}
