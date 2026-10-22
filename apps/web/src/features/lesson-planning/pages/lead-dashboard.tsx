import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { filterLessonPlanTableItems, LessonPlanTable } from '../../../components/lesson-plan-table'
import { buttonVariants } from '../../../components/ui/button'
import { lessonPlanningKeys, listLessonPlans } from '../api'
import { toLessonPlanTableItems } from '../table-items'

export type LeadQueueSearch = {
  subject?: string
  grade?: string
  order?: 'oldest' | 'newest'
  q?: string
}

export function LeadDashboard({
  search,
  onSearchChange,
}: {
  search: LeadQueueSearch
  onSearchChange: (search: LeadQueueSearch, options?: { replace?: boolean }) => void
}) {
  const queue = useQuery({ queryKey: lessonPlanningKeys.all, queryFn: listLessonPlans })
  const submitted = useMemo(
    () => queue.data?.filter((plan) => plan.status === 'submitted') ?? [],
    [queue.data],
  )
  const subjects = useMemo(
    () =>
      [
        ...new Set([
          ...submitted.map((plan) => plan.curriculumContext?.subject ?? plan.content.subject),
          ...(search.subject ? [search.subject] : []),
        ]),
      ].sort((a, b) => a.localeCompare(b)),
    [search.subject, submitted],
  )
  const grades = useMemo(
    () =>
      [
        ...new Set([
          ...submitted.map((plan) => plan.curriculumContext?.grade ?? plan.content.grade),
          ...(search.grade ? [search.grade] : []),
        ]),
      ].sort((a, b) => a.localeCompare(b)),
    [search.grade, submitted],
  )
  const matching = useMemo(
    () =>
      submitted.filter(
        (plan) =>
          (!search.subject ||
            (plan.curriculumContext?.subject ?? plan.content.subject) === search.subject) &&
          (!search.grade || (plan.curriculumContext?.grade ?? plan.content.grade) === search.grade),
      ),
    [search.grade, search.subject, submitted],
  )
  const ordered = useMemo(
    () =>
      [...matching].sort((a, b) =>
        search.order === 'newest'
          ? b.updatedAt.localeCompare(a.updatedAt)
          : a.updatedAt.localeCompare(b.updatedAt),
      ),
    [matching, search.order],
  )
  const tableItems = useMemo(() => toLessonPlanTableItems(ordered), [ordered])
  const visiblePlans = useMemo(
    () => filterLessonPlanTableItems(tableItems, search.q),
    [search.q, tableItems],
  )
  const published = queue.data?.filter((plan) => plan.status === 'published') ?? []
  const hasQueueFilters = Boolean(
    search.subject || search.grade || search.q || search.order === 'newest',
  )

  function clearQueueFilters() {
    onSearchChange(
      { subject: undefined, grade: undefined, order: undefined, q: undefined },
      { replace: true },
    )
  }

  function updateSearch(next: Partial<LeadQueueSearch>) {
    onSearchChange({ ...search, ...next }, { replace: true })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-2 border-b border-primary/15 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="max-w-2xl text-muted-foreground">
          Review submitted plans and publish work ready for teachers.
        </p>
      </header>
      {queue.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Lesson plans could not be loaded: {queue.error.message}{' '}
          <button type="button" className="underline" onClick={() => void queue.refetch()}>
            Try again
          </button>
        </p>
      )}
      <section aria-label="Plan totals" className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card px-5 py-4">
          <p className="text-sm text-muted-foreground">Awaiting review</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {queue.isLoading || queue.isError ? '—' : submitted.length}
          </p>
        </div>
        <div className="rounded-xl border bg-card px-5 py-4">
          <p className="text-sm text-muted-foreground">Published plans</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {queue.isLoading || queue.isError ? '—' : published.length}
          </p>
        </div>
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Review queue</h2>
            {!queue.isLoading && !queue.isError && (
              <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
                {visiblePlans.length} of {submitted.length} plans match the current filters and
                search.
              </p>
            )}
          </div>
          {hasQueueFilters && (
            <button
              type="button"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              onClick={clearQueueFilters}
            >
              Clear filters
            </button>
          )}
        </div>
        {queue.isLoading ? (
          <div
            role="status"
            aria-label="Loading submitted plans"
            className="h-32 animate-pulse rounded-xl border bg-card"
          />
        ) : queue.isError ? null : (
          <>
            {submitted.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-sm font-medium">
                  Subject
                  <select
                    value={search.subject ?? ''}
                    onChange={(event) => updateSearch({ subject: event.target.value || undefined })}
                    className="h-10 w-full rounded-md border bg-background px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">All subjects</option>
                    {subjects.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Grade
                  <select
                    value={search.grade ?? ''}
                    onChange={(event) => updateSearch({ grade: event.target.value || undefined })}
                    className="h-10 w-full rounded-md border bg-background px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">All grades</option>
                    {grades.map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Queue age
                  <select
                    value={search.order ?? 'oldest'}
                    onChange={(event) =>
                      updateSearch({
                        order: event.target.value === 'newest' ? 'newest' : undefined,
                      })
                    }
                    className="h-10 w-full rounded-md border bg-background px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="oldest">Oldest first</option>
                    <option value="newest">Newest first</option>
                  </select>
                </label>
              </div>
            )}
            <LessonPlanTable
              plans={tableItems}
              actionLabel="Review"
              emptyMessage={
                submitted.length === 0
                  ? 'No plans are waiting for review.'
                  : 'No plans match these filters.'
              }
              emptyAction={
                submitted.length === 0 ? (
                  <Link
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    to="/lesson-plans"
                  >
                    Browse published plans
                    <ArrowRight aria-hidden="true" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    onClick={clearQueueFilters}
                  >
                    Clear filters
                  </button>
                )
              }
              searchQuery={search.q}
              onSearchQueryChange={(q) => updateSearch({ q: q || undefined })}
              renderAction={(plan) => (
                <Link
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  to="/curriculum-lead/reviews/$planId"
                  params={{ planId: plan.id }}
                  search={search}
                >
                  Review plan
                  <ArrowRight aria-hidden="true" />
                </Link>
              )}
            />
          </>
        )}
      </section>
    </div>
  )
}
