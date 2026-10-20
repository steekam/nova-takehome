import { createRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { hasValidReturnComment, type LessonPlanContent, type LessonPlanStatus } from '@nova/shared'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { PlanReviewHistory, PlanVersionHistory, type LessonPlanVersion, type PlanReview } from '../components/plan-history'
import { apiRequest } from '../lib/api-request'
import { requireRole } from '../lib/route-auth'
import { route as curriculumLeadRoute } from './curriculum-lead'

type Plan = {
  id: string
  teacherId: string
  status: LessonPlanStatus
  content: LessonPlanContent
  version: number
  createdAt: string
  updatedAt: string
}
type Qa = { passed: boolean; checks: { code: string; passed: boolean; message: string }[] }
type Detail = { plan: Plan; reviews: PlanReview[]; versions: LessonPlanVersion[]; qa?: Qa }
type CurriculumSource = { documentId: string; chunkId: string; documentType: string; title: string; subject: string; grade: string; content: string }

function SelectedPlan() {
  const { planId } = planRoute.useParams()
  const queryClient = useQueryClient()
  const announcementRef = useRef<HTMLParagraphElement>(null)
  const [comment, setComment] = useState('')
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const detail = useQuery({
    queryKey: ['lesson-plan', planId],
    queryFn: () => apiRequest<Detail>(`/api/lesson-plans/${planId}`),
  })
  const sources = useQuery({
    queryKey: ['curriculum-sources'],
    queryFn: async () => (await apiRequest<{ items: CurriculumSource[] }>('/api/sources')).items,
  })
  const review = useMutation({
    mutationFn: (decision: 'returned' | 'published') => apiRequest(`/api/lesson-plans/${planId}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ decision, ...(comment.trim() ? { comment: comment.trim() } : {}) }),
    }),
    onSuccess: async (_data, decision) => {
      setComment('')
      setConfirmPublish(false)
      setAnnouncement(decision === 'published' ? 'Lesson plan published.' : 'Lesson plan returned for revision.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lesson-plans'] }),
        queryClient.invalidateQueries({ queryKey: ['lesson-plan', planId] }),
      ])
    },
  })

  useEffect(() => {
    if (announcement) announcementRef.current?.focus()
  }, [announcement])

  if (detail.isLoading) return <div className="h-96 animate-pulse rounded-xl border bg-card" role="status" aria-label="Loading selected lesson plan" />
  if (detail.error) return <Card><CardContent className="p-5"><p role="alert" className="text-sm text-destructive">{detail.error.message || 'Unable to load this plan.'}</p><Button className="mt-3" variant="outline" onClick={() => detail.refetch()}>Try again</Button></CardContent></Card>
  if (!detail.data) return null

  const { plan, qa, reviews, versions } = detail.data
  const content = plan.content
  const statusLabel: Record<LessonPlanStatus, string> = { draft: 'Draft', submitted: 'Submitted', returned: 'Returned', published: 'Published' }
  const returnCommentValid = hasValidReturnComment(comment)
  const sourceDetails = content.sources.map(source => ({
    source,
    detail: sources.data?.find(item => item.documentId === source.documentId && item.chunkId === source.chunkId),
  }))

  return <div className="space-y-7">
    <header className="space-y-3 border-b border-primary/15 pb-6">
      <Link to="/curriculum-lead" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" aria-hidden="true" />Overview</Link>
      <div><h1 className="text-3xl font-semibold tracking-tight">{content.title}</h1><p className="mt-2 text-sm text-muted-foreground">Review submission · {content.subject} · {content.grade} · {content.durationMinutes} minutes</p></div>
    </header>
    {announcement && <p ref={announcementRef} tabIndex={-1} role="status" className="rounded-lg bg-[#e9f0f2] p-3 text-sm font-medium text-primary">{announcement}</p>}
    <article className="rounded-xl border bg-card">
      <header className="border-b p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">Updated {new Date(plan.updatedAt).toLocaleDateString()} · Version {plan.version}</p>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{statusLabel[plan.status]}</span>
        </div>
      </header>

      <div className="grid items-start gap-8 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(270px,0.75fr)]">
        <div className="min-w-0 space-y-8">
          <section className="space-y-3" aria-labelledby="learning-outcome-heading">
            <div><h3 id="learning-outcome-heading" className="font-semibold">Learning outcome</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{content.learningOutcome}</p></div>
            <div><h4 className="text-sm font-semibold">Objectives</h4><ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-6 text-muted-foreground">{content.objectives.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>
          </section>

          <section aria-labelledby="lesson-sequence-heading">
            <h3 id="lesson-sequence-heading" className="mb-3 font-semibold">Lesson sequence</h3>
            <article className="mb-4 rounded-lg bg-muted/55 p-4"><h4 className="font-semibold">Starter</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{content.starter}</p></article>
            <div>{content.activities.map((activity, index) => <article key={`${index}-${activity.title}`} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-t py-4 first:border-t-0 first:pt-0">
              <span className="pt-0.5 text-sm font-semibold tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
              <div><div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><h4 className="font-medium">{activity.title}</h4><span className="text-sm text-muted-foreground">{activity.durationMinutes} min</span></div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{activity.description}</p></div>
            </article>)}</div>
          </section>

          <section aria-labelledby="materials-heading"><h3 id="materials-heading" className="font-semibold">Materials</h3><ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">{content.materials.map((material, index) => <li key={`${index}-${material}`}>{material}</li>)}</ul></section>
          <section aria-labelledby="assessment-heading"><h3 id="assessment-heading" className="font-semibold">Check for understanding</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{content.checkForUnderstanding}</p></section>

          <section aria-labelledby="sources-heading">
            <h3 id="sources-heading" className="font-semibold">Curriculum references</h3>
            {sources.isLoading ? <p role="status" className="mt-2 text-sm text-muted-foreground">Loading source details…</p> : sources.error ? <p role="alert" className="mt-2 text-sm text-destructive">Source details could not be loaded: {sources.error.message}</p> : content.sources.length ? <div className="mt-3 space-y-3">{sourceDetails.map(({ source, detail }) => <article key={`${source.documentId}-${source.chunkId}`} className="rounded-lg border p-4">
              <h4 className="font-medium">{detail?.title ?? 'Curriculum source'}</h4>
              <p className="mt-1 text-xs text-muted-foreground">{detail ? `${detail.documentType} · ${detail.subject} · ${detail.grade}` : `Reference ${source.documentId} · ${source.chunkId}`}</p>
              {detail && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{detail.content}</p>}
            </article>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No curriculum references attached.</p>}
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6">
          <section className="rounded-xl border bg-[#f0f5f5] p-4" aria-labelledby="quality-checks-heading">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="quality-checks-heading" className="font-semibold">Quality checks</h3>{qa && <span className={`text-xs font-semibold ${qa.passed ? 'text-emerald-700' : 'text-destructive'}`}>{qa.passed ? 'Passed' : 'Review needed'}</span>}</div>
            {qa ? <ul className="mt-3 space-y-2">{qa.checks.map(check => <li key={check.code} className="flex gap-2 text-sm"><span className={check.passed ? 'text-emerald-700' : 'text-destructive'}>{check.passed ? <CheckCircle2 className="size-4" aria-label="Passed" /> : <XCircle className="size-4" aria-label="Failed" />}</span><span>{check.message}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No quality check report is attached.</p>}
          </section>

          <PlanVersionHistory versions={versions} currentVersion={plan.version} />
          <PlanReviewHistory reviews={reviews} />

          {plan.status === 'submitted' ? <section className="space-y-3 border-t pt-5" aria-labelledby="decision-heading">
            <h3 id="decision-heading" className="font-semibold">Make a decision</h3>
            <label className="block space-y-1 text-sm font-medium">Feedback for the teacher<textarea className="min-h-28 w-full rounded-md border bg-background p-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={comment} onChange={event => setComment(event.target.value)} /></label>
            {confirmPublish && <div className="rounded-lg bg-[#f8efcf] p-3 text-sm"><p className="font-semibold">Publish “{content.title}”?</p><p className="mt-1">The plan will be approved and locked for editing.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" disabled={review.isPending} onClick={() => review.mutate('published')}>{review.isPending ? 'Publishing…' : 'Confirm publish'}</Button><Button type="button" size="sm" variant="outline" disabled={review.isPending} onClick={() => setConfirmPublish(false)}>Cancel</Button></div></div>}
            <div className="flex flex-wrap gap-2">{!confirmPublish && <Button type="button" disabled={review.isPending} onClick={() => setConfirmPublish(true)}><CheckCircle2 aria-hidden="true" />Publish plan</Button>}<Button type="button" variant="outline" disabled={review.isPending || !returnCommentValid} onClick={() => review.mutate('returned')}>Return for revision <ArrowRight aria-hidden="true" /></Button></div>
            {!returnCommentValid && <p className="text-xs text-muted-foreground">Add at least eight characters of feedback to return this plan.</p>}
            {review.error && <p role="alert" className="text-sm text-destructive">Decision failed: {review.error.message}</p>}
          </section> : <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{plan.status === 'returned' ? 'This plan has been returned for revision.' : plan.status === 'published' ? 'This plan is published and available to both roles.' : 'This plan has not been submitted for review.'}</p>}
        </aside>
      </div>
    </article>
  </div>
}

export const planRoute = createRoute({
  getParentRoute: () => curriculumLeadRoute,
  path: 'reviews/$planId',
  beforeLoad: ({ location }) => requireRole('curriculum_lead', location.href),
  component: SelectedPlan,
})
