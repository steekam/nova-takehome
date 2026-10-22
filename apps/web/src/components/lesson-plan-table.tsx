import { useMemo, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LessonPlanCurriculumContext, LessonPlanStatus } from '@nova/shared'

export type LessonPlanTableItem = {
  id: string
  title: string
  subject: string
  grade: string
  targetRevisionId: string | null
  curriculumContext: LessonPlanCurriculumContext | null
  status: LessonPlanStatus
  canDelete: boolean
  updatedAt: string
}

const statusLabel: Record<LessonPlanStatus, string> = {
  draft: 'Draft',
  submitted: 'In review',
  returned: 'Returned',
  published: 'Published',
}
const statusTone: Record<LessonPlanStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-amber-100 text-amber-900',
  returned: 'bg-rose-100 text-rose-900',
  published: 'bg-emerald-100 text-emerald-900',
}

export function filterLessonPlanTableItems(plans: LessonPlanTableItem[], query = '') {
  const term = query.trim().toLocaleLowerCase()
  return plans.filter(
    (plan) =>
      !term ||
      [
        plan.title,
        plan.subject,
        plan.grade,
        statusLabel[plan.status],
        plan.curriculumContext?.framework,
        plan.curriculumContext?.programme,
        plan.curriculumContext?.releaseLabel,
        plan.curriculumContext?.locator,
        plan.curriculumContext?.targetTitle,
      ].some((value) => value?.toLocaleLowerCase().includes(term)),
  )
}

export function LessonPlanTable({
  plans,
  actionLabel,
  renderAction,
  emptyMessage,
  emptyAction,
  searchQuery,
  onSearchQueryChange,
}: {
  plans: LessonPlanTableItem[]
  actionLabel: string
  renderAction: (plan: LessonPlanTableItem) => ReactNode
  emptyMessage: string
  emptyAction?: ReactNode
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
}) {
  const [localSearch, setLocalSearch] = useState('')
  const search = onSearchQueryChange ? (searchQuery ?? '') : localSearch
  const pageSignature = `${search}\n${plans.map((plan) => plan.id).join('\n')}`
  const [pagination, setPagination] = useState({ signature: '', page: 0 })
  if (pagination.signature !== pageSignature) {
    setPagination({ signature: pageSignature, page: 0 })
  }
  const page = pagination.page
  const setPage = (nextPage: number) => setPagination({ signature: pageSignature, page: nextPage })
  const pageSize = 10
  const filtered = useMemo(() => filterLessonPlanTableItems(plans, search), [plans, search])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <label className="block w-full space-y-1 text-sm font-medium sm:max-w-sm">
          Search lesson plans
          <input
            type="search"
            value={search}
            onChange={(event) => {
              if (onSearchQueryChange) onSearchQueryChange(event.target.value)
              else setLocalSearch(event.target.value)
            }}
            placeholder="Title, curriculum, target, or status"
            className="h-10 w-full rounded-md border bg-background px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'plan' : 'plans'}
        </p>
      </div>
      {visible.length ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{actionLabel} lesson plans</caption>
            <thead className="sr-only lg:not-sr-only lg:table-header-group">
              <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">
                  Plan & source
                </th>
                <th
                  scope="col"
                  className="w-[18rem] whitespace-nowrap px-4 py-3 text-right font-medium"
                >
                  Status & action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((plan) => (
                <tr key={plan.id} className="grid hover:bg-muted/20 lg:table-row lg:align-top">
                  <th
                    scope="row"
                    className="block min-w-0 px-4 pt-3.5 pb-1 font-semibold lg:table-cell lg:py-3.5"
                  >
                    <p className="mb-1 text-sm font-semibold leading-5 text-foreground">
                      {plan.title}
                    </p>
                    <CurriculumContext plan={plan} />
                  </th>
                  <td className="block px-4 pt-1 pb-3.5 lg:table-cell lg:w-[18rem] lg:py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 lg:flex-col lg:items-end lg:gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone[plan.status]}`}
                        >
                          {statusLabel[plan.status]}
                        </span>
                        <time dateTime={plan.updatedAt} className="text-xs text-muted-foreground">
                          Updated {new Date(plan.updatedAt).toLocaleDateString()}
                        </time>
                      </div>
                      {renderAction(plan)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border bg-card px-5 py-10 text-center">
          <p className="font-medium">{search ? 'No matching plans' : emptyMessage}</p>
          {search && (
            <div className="mt-2 space-y-2 text-sm text-muted-foreground">
              <p>Try a title, curriculum, release, or status.</p>
              <button
                type="button"
                className="font-medium text-primary underline underline-offset-2"
                onClick={() => {
                  if (onSearchQueryChange) onSearchQueryChange('')
                  else setLocalSearch('')
                }}
              >
                Clear search
              </button>
            </div>
          )}
          {!search && emptyAction && <div className="mt-4">{emptyAction}</div>}
        </div>
      )}
      {filtered.length > pageSize && (
        <div className="flex items-center justify-between gap-3">
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-sm text-muted-foreground"
          >
            Page {currentPage + 1} of {pageCount}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Previous
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function CurriculumContext({ plan }: { plan: LessonPlanTableItem }) {
  const context = plan.curriculumContext
  if (!context && plan.targetRevisionId)
    return (
      <div className="space-y-0.5 text-xs font-normal leading-5 text-muted-foreground">
        <p>
          {plan.grade} · {plan.subject}
        </p>
        <Link
          to="/library/targets/$targetRevisionId"
          params={{ targetRevisionId: plan.targetRevisionId }}
          className="block text-primary underline underline-offset-2"
        >
          View outcome in curriculum library
        </Link>
      </div>
    )
  if (!context)
    return (
      <p className="text-xs font-normal leading-5 text-muted-foreground">
        {plan.grade} · {plan.subject} · Legacy plan with no saved target
      </p>
    )

  return (
    <div className="space-y-0.5 text-xs font-normal leading-5">
      <p className="text-muted-foreground">
        <span title={context.framework}>{curriculumFrameworkLabel(context.framework)}</span> /{' '}
        {context.programme} / {context.grade} {context.subject} / {context.releaseLabel} edition
      </p>
      {plan.targetRevisionId ? (
        <Link
          to="/library/targets/$targetRevisionId"
          params={{ targetRevisionId: plan.targetRevisionId }}
          aria-label={`View ${context.targetTitle} in ${context.framework}, ${context.programme}, ${context.grade} ${context.subject}, ${context.releaseLabel} edition, ${context.locator}`}
          className="block text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        >
          {context.locator} · {context.targetTitle}
        </Link>
      ) : (
        <p className="text-muted-foreground">
          {context.locator} · {context.targetTitle} · target link unavailable
        </p>
      )}
    </div>
  )
}

function curriculumFrameworkLabel(framework: string) {
  return framework === 'Kenya Competency Based Curriculum' ? 'Kenya CBC' : framework
}
