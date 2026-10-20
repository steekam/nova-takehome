import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LessonPlanStatus } from '@nova/shared'

export type LessonPlanTableItem = {
  id: string
  title: string
  subject: string
  grade: string
  status: LessonPlanStatus
  updatedAt: string
}

const statusLabel: Record<LessonPlanStatus, string> = { draft: 'Draft', submitted: 'In review', returned: 'Returned', published: 'Published' }

export function LessonPlanTable({ plans, actionLabel, renderAction, emptyMessage }: {
  plans: LessonPlanTableItem[]
  actionLabel: string
  renderAction: (plan: LessonPlanTableItem) => ReactNode
  emptyMessage: string
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 10
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return plans.filter(plan => !term || [plan.title, plan.subject, plan.grade, statusLabel[plan.status]].some(value => value.toLocaleLowerCase().includes(term)))
  }, [plans, search])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  return <section className="space-y-4">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <label className="block w-full space-y-1 text-sm font-medium sm:max-w-sm">Search lesson plans<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} placeholder="Title, subject, grade, or status" className="h-10 w-full rounded-md border bg-background px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
      <p className="text-sm text-muted-foreground" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'plan' : 'plans'}</p>
    </div>
    {visible.length ? <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[470px] border-collapse text-left text-sm xl:min-w-[700px]">
        <caption className="sr-only">{actionLabel} lesson plans</caption>
        <thead><tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><th scope="col" className="px-3 py-3 font-medium xl:px-4">Plan</th><th scope="col" className="hidden px-4 py-3 font-medium xl:table-cell">Subject</th><th scope="col" className="hidden px-4 py-3 font-medium xl:table-cell">Grade</th><th scope="col" className="whitespace-nowrap px-3 py-3 font-medium xl:px-4">Status</th><th scope="col" className="hidden whitespace-nowrap px-4 py-3 font-medium sm:table-cell">Updated</th><th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-medium xl:px-4">Action</th></tr></thead>
        <tbody className="divide-y">{visible.map(plan => <tr key={plan.id} className="align-middle hover:bg-muted/20"><th scope="row" className="max-w-[12rem] px-3 py-3 font-semibold xl:max-w-[22rem] xl:px-4"><span className="block truncate">{plan.title}</span><span className="mt-1 block text-xs font-normal text-muted-foreground xl:hidden">{plan.subject} · {plan.grade}</span></th><td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">{plan.subject}</td><td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">{plan.grade}</td><td className="whitespace-nowrap px-3 py-3 xl:px-4"><span className="rounded-full bg-muted px-2 py-1 text-xs font-medium xl:px-2.5">{statusLabel[plan.status]}</span></td><td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground sm:table-cell">{new Date(plan.updatedAt).toLocaleDateString()}</td><td className="whitespace-nowrap px-3 py-3 text-right xl:px-4">{renderAction(plan)}</td></tr>)}</tbody>
      </table>
    </div> : <div className="rounded-xl border bg-card px-5 py-10 text-center"><p className="font-medium">{search ? 'No matching plans' : emptyMessage}</p>{search && <p className="mt-1 text-sm text-muted-foreground">Try a different title, subject, grade, or status.</p>}</div>}
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{filtered.length ? `Page ${currentPage + 1} of ${pageCount}` : 'No plans to show'}</p>
      <div className="flex gap-2"><button type="button" className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft aria-hidden="true" className="size-4" />Previous</button><button type="button" className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight aria-hidden="true" className="size-4" /></button></div>
    </div>
  </section>
}
