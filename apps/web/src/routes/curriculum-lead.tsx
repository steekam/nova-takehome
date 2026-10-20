import { createRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import { Check, CheckCircle2, ClipboardCheck, Clock3, FileText, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { ApiPrincipal, LessonPlanContent, LessonPlanStatus } from '@nova/shared'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { apiRequest } from '../lib/api-request'
import { requireRole } from '../lib/route-auth'
import { route as rootRoute } from './root'

type Plan = {
  id: string
  teacherId: string
  status: LessonPlanStatus
  content: LessonPlanContent
  version: number
  createdAt: string
  updatedAt: string
}
type Review = {
  id: string
  lessonPlanId: string
  curriculumLeadId: string
  decision: string
  comment: string | null
  createdAt: string
}
type Qa = { passed: boolean; checks: { code: string; passed: boolean; message: string }[] }
type Detail = { plan: Plan; reviews: Review[]; qa?: Qa }
type CurriculumSource = { documentId: string; chunkId: string; documentType: string; title: string; subject: string; grade: string; content: string }

function CurriculumLeadHome() {
  const user = route.useRouteContext()
  return <ReviewWorkspace user={user} />
}

function ReviewWorkspace({ user }: { user: ApiPrincipal }) {
  const queryClient = useQueryClient()
  const queue = useQuery({
    queryKey: ['lesson-plans'],
    queryFn: async () => (await apiRequest<{ items: Plan[] }>('/api/lesson-plans')).items,
  })
  const sources = useQuery({
    queryKey: ['curriculum-sources'],
    queryFn: async () => (await apiRequest<{ items: CurriculumSource[] }>('/api/sources')).items,
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const detail = useQuery({
    queryKey: ['lesson-plan', selectedId],
    queryFn: () => apiRequest<Detail>(`/api/lesson-plans/${selectedId}`),
    enabled: Boolean(selectedId),
  })
  const [comment, setComment] = useState('')
  const review = useMutation({
    mutationFn: (decision: 'returned' | 'published') => apiRequest(`/api/lesson-plans/${selectedId}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ decision, ...(comment.trim() ? { comment: comment.trim() } : {}) }),
    }),
    onSuccess: async () => {
      setComment('')
      setSelectedId(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lesson-plans'] }),
        queryClient.invalidateQueries({ queryKey: ['lesson-plan', selectedId] }),
      ])
    },
  })
  const plans = queue.data?.filter(plan => plan.status === 'submitted') ?? []

  return <AppShell role={user.roles[0]}>
    <div className="space-y-8">
      <ReviewHeader count={plans.length} />
      {queue.error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{queue.error.message}</p>}
      {sources.error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Curriculum source details could not be loaded: {sources.error.message}</p>}
      {queue.isLoading ? <WorkspaceSkeleton /> : <div className="grid items-start gap-6 lg:grid-cols-[minmax(260px,0.75fr)_1.25fr]">
        <ReviewQueue plans={plans} selectedId={selectedId} onSelect={setSelectedId} />
        <ReviewPanel selectedId={selectedId} detail={detail} sources={sources.data ?? []} comment={comment} setComment={setComment} review={review} />
      </div>}
    </div>
  </AppShell>
}

function ReviewHeader({ count }: { count: number }) {
  return <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">Curriculum lead workspace</p>
      <h1 className="text-3xl font-semibold tracking-tight">Review queue</h1>
      <p className="max-w-xl text-muted-foreground">Check each lesson against its curriculum sources, then publish it or return it with clear guidance.</p>
    </div>
    <div className="rounded-xl border bg-background px-4 py-3 text-sm">
      <span className="font-semibold">{count}</span>
      <span className="ml-2 text-muted-foreground">awaiting review</span>
    </div>
  </section>
}

function WorkspaceSkeleton() {
  return <div className="grid gap-6 lg:grid-cols-[minmax(260px,0.75fr)_1.25fr]" aria-label="Loading review queue" role="status">
    <div className="h-64 animate-pulse rounded-xl border bg-card" />
    <div className="h-96 animate-pulse rounded-xl border bg-card" />
  </div>
}

function ReviewQueue({ plans, selectedId, onSelect }: { plans: Plan[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <section className="space-y-3" aria-labelledby="submitted-plans-heading">
    <h2 id="submitted-plans-heading" className="text-lg font-semibold">Submitted plans</h2>
    {plans.length ? <div className="space-y-3">{plans.map(plan => <QueuePlan key={plan.id} plan={plan} selected={selectedId === plan.id} onSelect={() => onSelect(plan.id)} />)}</div> : <EmptyQueue />}
  </section>
}

function QueuePlan({ plan, selected, onSelect }: { plan: Plan; selected: boolean; onSelect: () => void }) {
  return <button
    type="button"
    aria-pressed={selected}
    aria-label={`Review ${plan.content.title}, ${plan.content.subject}, ${plan.content.grade}`}
    onClick={onSelect}
    className={`w-full rounded-xl border bg-card p-4 text-left transition hover:border-foreground/30 ${selected ? 'border-primary ring-1 ring-primary' : ''}`}
  >
    <span className="block font-semibold">{plan.content.title}</span>
    <span className="mt-1 block text-sm text-muted-foreground">{plan.content.subject} · {plan.content.grade}</span>
    <span className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
      <Clock3 className="size-3" aria-hidden="true" />
      Submitted {new Date(plan.updatedAt).toLocaleDateString()}
    </span>
  </button>
}

function EmptyQueue() {
  return <Card>
    <CardContent className="flex flex-col items-center py-10 text-center">
      <ClipboardCheck className="mb-3 size-7 text-muted-foreground" aria-hidden="true" />
      <h3 className="font-medium">Queue is clear</h3>
      <p className="mt-1 text-sm text-muted-foreground">New submissions will show up here.</p>
    </CardContent>
  </Card>
}

function ReviewPanel({ selectedId, detail, sources, comment, setComment, review }: {
  selectedId: string | null
  detail: UseQueryResult<Detail, Error>
  sources: CurriculumSource[]
  comment: string
  setComment: (value: string) => void
  review: UseMutationResult<unknown, Error, 'returned' | 'published'>
}) {
  if (!selectedId) return <ChoosePlan />
  if (detail.isLoading) return <div className="h-96 animate-pulse rounded-xl border bg-card" role="status" aria-label="Loading selected lesson plan" />
  if (detail.error) return <p role="alert" className="rounded-lg border p-4 text-sm text-destructive">{detail.error.message || 'Unable to load this plan.'}</p>
  if (!detail.data) return null

  return <ReviewDetail detail={detail.data} sources={sources} comment={comment} setComment={setComment} review={review} />
}

function ChoosePlan() {
  return <Card>
    <CardContent className="flex flex-col items-center py-16 text-center">
      <FileText className="mb-4 size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-semibold">Choose a plan to review</h2>
      <p className="mt-1 text-sm text-muted-foreground">The lesson and its quality checks will appear here.</p>
    </CardContent>
  </Card>
}

function ReviewDetail({ detail, sources, comment, setComment, review }: { detail: Detail; sources: CurriculumSource[]; comment: string; setComment: (value: string) => void; review: UseMutationResult<unknown, Error, 'returned' | 'published'> }) {
  const { plan, qa, reviews } = detail
  const content = plan.content
  const statusLabel: Record<LessonPlanStatus, string> = { draft: 'Draft', submitted: 'In review', returned: 'Returned', published: 'Published' }

  return <Card>
    <CardHeader>
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle>{content.title}</CardTitle>
          <CardDescription className="mt-1">{content.subject} · {content.grade} · {content.durationMinutes} minutes</CardDescription>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{statusLabel[plan.status]}</span>
      </div>
    </CardHeader>
    <CardContent className="space-y-6">
      <LessonSummary content={content} />
      <LessonActivities activities={content.activities} />
      <QualityChecks qa={qa} />
      {content.sources.length > 0 && <CurriculumReferences sources={content.sources} sourceLibrary={sources} />}
      <ReviewHistory reviews={reviews} />
      {plan.status === 'submitted'
        ? <ReviewActions comment={comment} setComment={setComment} review={review} />
        : <p className="border-t pt-4 text-sm text-muted-foreground">{plan.status === 'returned' ? 'The teacher can edit this plan and resubmit it.' : 'This plan is published. Review is complete.'}</p>}
    </CardContent>
  </Card>
}

function LessonSummary({ content }: { content: LessonPlanContent }) {
  return <section className="space-y-2">
    <h3 className="text-sm font-semibold">Learning outcome</h3>
    <p className="text-sm text-muted-foreground">{content.learningOutcome}</p>
    <h3 className="pt-2 text-sm font-semibold">Objectives</h3>
    <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
      {content.objectives.map((item, index) => <li key={index}>{item}</li>)}
    </ul>
  </section>
}

function LessonActivities({ activities }: { activities: LessonPlanContent['activities'] }) {
  return <section>
    <h3 className="mb-2 text-sm font-semibold">Lesson sequence</h3>
    <div className="space-y-2">
      {activities.map((activity, index) => <article key={index} className="rounded-lg border p-3">
        <div className="flex justify-between gap-3">
          <h4 className="text-sm font-medium">{activity.title}</h4>
          <span className="shrink-0 text-xs text-muted-foreground">{activity.durationMinutes} min</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{activity.description}</p>
      </article>)}
    </div>
  </section>
}

function QualityChecks({ qa }: { qa?: Qa }) {
  return <section className="rounded-xl border bg-muted/30 p-4" aria-labelledby="quality-checks-heading">
    <div className="mb-3 flex items-center justify-between">
      <h3 id="quality-checks-heading" className="text-sm font-semibold">Quality checks</h3>
      {qa && <span className={`text-xs font-medium ${qa.passed ? 'text-emerald-700' : 'text-destructive'}`}>{qa.passed ? 'All checks passed' : 'Review needed'}</span>}
    </div>
    {qa ? <ul className="space-y-2">
      {qa.checks.map(check => <li key={check.code} className="flex gap-2 text-sm">
        <span className={check.passed ? 'text-emerald-700' : 'text-destructive'} aria-label={check.passed ? 'Passed' : 'Failed'}>
          {check.passed ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
        </span>
        <span>{check.message}</span>
      </li>)}
    </ul> : <p className="text-sm text-muted-foreground">No quality check report is attached.</p>}
  </section>
}

function CurriculumReferences({ sources, sourceLibrary }: { sources: LessonPlanContent['sources']; sourceLibrary: CurriculumSource[] }) {
  const references = sources.map(source => ({
    source,
    detail: sourceLibrary.find(item => item.documentId === source.documentId && item.chunkId === source.chunkId),
  }))

  return <section>
    <h3 className="mb-2 text-sm font-semibold">Curriculum references</h3>
    <div className="space-y-2">
      {references.map(({ source, detail }) => <details key={`${source.documentId}-${source.chunkId}`} className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {detail?.title ?? 'Curriculum source'}
          {detail && <span className="ml-2 font-normal text-muted-foreground">{detail.documentType} · {detail.subject} · {detail.grade}</span>}
        </summary>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{detail?.content ?? `Source reference ${source.documentId} · ${source.chunkId}`}</p>
      </details>)}
    </div>
  </section>
}

function ReviewHistory({ reviews }: { reviews: Review[] }) {
  if (!reviews.length) return null
  return <section aria-labelledby="review-history-heading">
    <h3 id="review-history-heading" className="mb-2 text-sm font-semibold">Review history</h3>
    <div className="space-y-2">
      {reviews.map(item => <p key={item.id} className="border-l-2 pl-3 text-sm text-muted-foreground">
        {item.decision === 'published' ? 'Published' : 'Returned'} · {new Date(item.createdAt).toLocaleDateString()}
        {item.comment ? ` — ${item.comment}` : ''}
      </p>)}
    </div>
  </section>
}

function ReviewActions({ comment, setComment, review }: { comment: string; setComment: (value: string) => void; review: UseMutationResult<unknown, Error, 'returned' | 'published'> }) {
  return <section className="space-y-3 border-t pt-4" aria-labelledby="review-actions-heading">
    <h3 id="review-actions-heading" className="text-sm font-semibold">Review decision</h3>
    <label className="block space-y-1 text-sm font-medium">
      Feedback to teacher <span className="font-normal text-muted-foreground">(needed when returning)</span>
      <textarea
        aria-label="Feedback to teacher"
        className="min-h-20 w-full rounded-md border bg-background p-3 font-normal"
        placeholder="Add specific, actionable feedback…"
        value={comment}
        onChange={event => setComment(event.target.value)}
      />
    </label>
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={review.isPending} onClick={() => review.mutate('published')}>
        <Check aria-hidden="true" /> Publish plan
      </Button>
      <Button type="button" variant="outline" disabled={review.isPending || !comment.trim()} onClick={() => review.mutate('returned')}>
        Return for revision
      </Button>
    </div>
    {review.error && <p role="alert" className="text-sm text-destructive">{review.error.message}</p>}
  </section>
}

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/curriculum-lead',
  beforeLoad: ({ location }) => requireRole('curriculum_lead', location.href),
  component: CurriculumLeadHome,
})
