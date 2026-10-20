import { createRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, FileText, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { ApiPrincipal, LessonPlanContent, LessonPlanStatus } from '@nova/shared'
import { LessonPlanContentSchema } from '@nova/shared'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { apiRequest } from '../lib/api-request'
import { requireRole } from '../lib/route-auth'
import { route as rootRoute } from './root'

type Outcome = { id: string; targetId: string; title: string; subject: string; grade: string; content: string }
type CurriculumSource = { documentId: string; chunkId: string; documentType: string; title: string; subject: string; grade: string; content: string }
type Plan = { id: string; teacherId: string; status: LessonPlanStatus; content: LessonPlanContent; version: number; createdAt: string; updatedAt: string }
type Review = { id: string; decision: string; comment: string | null; createdAt: string }
type Qa = { passed: boolean; checks: { code: string; passed: boolean; message: string }[] }
const unwrap = <T,>(value: T[] | { items: T[] }) => Array.isArray(value) ? value : value.items
const statusLabel: Record<LessonPlanStatus, string> = { draft: 'Draft', submitted: 'In review', returned: 'Draft · returned', published: 'Published' }

function TeacherHome() {
  const user = route.useRouteContext()
  return <TeacherWorkspace user={user} />
}

function TeacherWorkspace({ user }: { user: ApiPrincipal }) {
  const qc = useQueryClient()
  const outcomes = useQuery({ queryKey: ['outcomes'], queryFn: async () => unwrap(await apiRequest<Outcome[] | {items: Outcome[]}>('/api/outcomes')) })
  const sources = useQuery({ queryKey: ['curriculum-sources'], queryFn: async () => (await apiRequest<{ items: CurriculumSource[] }>('/api/sources')).items })
  const plans = useQuery({ queryKey: ['lesson-plans'], queryFn: async () => unwrap(await apiRequest<Plan[] | {items: Plan[]}>('/api/lesson-plans')) })
  const [targetId, setTargetId] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(45)
  const generate = useMutation({ mutationFn: () => apiRequest<{ plan: Plan; qa: Qa }>('/api/lesson-plans/generate', { method: 'POST', body: JSON.stringify({ targetId, durationMinutes }) }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['lesson-plans'] }) } })
  const outcomeList = outcomes.data ?? []
  const planList = plans.data ?? []
  const error = outcomes.error ?? plans.error ?? sources.error ?? generate.error

  return <AppShell role={user.roles[0]}>
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="space-y-2"><p className="text-sm font-medium text-muted-foreground">Teacher workspace</p><h1 className="text-3xl font-semibold tracking-tight">Your lesson plans</h1><p className="max-w-xl text-muted-foreground">Build curriculum-aligned lessons, edit every detail, and send them for review.</p></div>
        <div className="rounded-xl border bg-background px-4 py-3 text-sm"><span className="font-semibold">{planList.length}</span><span className="ml-2 text-muted-foreground">plans in your workspace</span></div>
      </section>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(280px,0.8fr)_1.2fr]">
        <Card className="h-fit"><CardHeader><span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="size-5" /></span><CardTitle>Start with an outcome</CardTitle><CardDescription>Generate a first draft grounded in the approved curriculum sources.</CardDescription></CardHeader><CardContent className="space-y-4">
          {outcomes.isLoading ? <div className="h-10 animate-pulse rounded-md bg-muted" /> : outcomeList.length ? <label className="block space-y-2 text-sm font-medium">Curriculum outcome<select className="h-10 w-full rounded-md border bg-background px-3 font-normal" value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">Choose an outcome</option>{outcomeList.map(o => <option key={o.id} value={o.targetId}>{o.subject} · {o.grade} — {o.title}</option>)}</select></label> : <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">No curriculum outcomes are available yet.</p>}
          <label className="block space-y-2 text-sm font-medium">Lesson length<select className="h-10 w-full rounded-md border bg-background px-3 font-normal" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))}><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>60 minutes</option><option value={90}>90 minutes</option></select></label>
          <Button className="w-full" disabled={!targetId || generate.isPending} onClick={() => generate.mutate()}><Plus />{generate.isPending ? 'Creating draft…' : 'Generate lesson plan'}</Button>
        </CardContent></Card>
        <section className="space-y-8">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Recent plans</h2>
              <p className="text-sm text-muted-foreground">Continue editing or check a plan’s review status.</p>
            </div>
            {plans.isLoading ? <PlanListSkeleton /> : planList.filter(plan => plan.status !== 'published').length ? <div className="space-y-3">{planList.filter(plan => plan.status !== 'published').map(plan => <PlanEditor key={plan.id} plan={plan} sources={sources.data ?? []} />)}</div> : <EmptyPlans />}
          </div>
          <PublishedBank plans={planList.filter(plan => plan.status === 'published')} sources={sources.data ?? []} loading={plans.isLoading} />
        </section>
      </div>
    </div>
  </AppShell>
}

function PlanEditor({ plan, sources }: { plan: Plan; sources: CurriculumSource[] }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState<LessonPlanContent | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const detail = useQuery({
    queryKey: ['lesson-plan', plan.id],
    queryFn: () => apiRequest<{ plan: Plan; reviews: Review[]; qa?: Qa }>(`/api/lesson-plans/${plan.id}`),
    enabled: open,
  })
  const editable = plan.status === 'draft' || plan.status === 'returned'
  const currentPlan = detail.data?.plan ?? plan
  const currentContent = content ?? currentPlan.content
  const qa = detail.data?.qa
  const reviews = detail.data?.reviews ?? []
  const save = useMutation({
    mutationFn: (value: LessonPlanContent) => apiRequest<{ plan: Plan; qa: Qa }>(`/api/lesson-plans/${plan.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: value }),
    }),
    onSuccess: async ({ plan: updatedPlan, qa }) => {
      setContent(updatedPlan.content)
      qc.setQueryData(['lesson-plan', plan.id], { plan: updatedPlan, reviews: detail.data?.reviews ?? [], qa })
      await qc.invalidateQueries({ queryKey: ['lesson-plans'] })
    },
  })
  const submit = useMutation({
    mutationFn: async (value: LessonPlanContent) => {
      await apiRequest<{ plan: Plan; qa: Qa }>(`/api/lesson-plans/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: value }),
      })
      return apiRequest<{ plan: Plan; qa: Qa }>(`/api/lesson-plans/${plan.id}/submit`, { method: 'POST' })
    },
    onSuccess: async ({ plan: updatedPlan, qa }) => {
      setContent(updatedPlan.content)
      qc.setQueryData(['lesson-plan', plan.id], { plan: updatedPlan, reviews: detail.data?.reviews ?? [], qa })
      await qc.invalidateQueries({ queryKey: ['lesson-plans'] })
    },
  })

  function update<K extends keyof LessonPlanContent>(key: K, value: LessonPlanContent[K]) {
    setContent(existing => ({ ...(existing ?? currentPlan.content), [key]: value }))
    setValidationErrors([])
  }

  function saveChanges() {
    const result = LessonPlanContentSchema.safeParse(currentContent)
    if (!result.success) {
      setValidationErrors(result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`))
      return
    }
    setValidationErrors([])
    save.mutate(result.data)
  }

  function submitChanges() {
    const result = LessonPlanContentSchema.safeParse(currentContent)
    if (!result.success) {
      setValidationErrors(result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`))
      return
    }
    setValidationErrors([])
    submit.mutate(result.data)
  }

  return <Card>
    <CardContent className="p-0">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="min-w-0 text-left">
          <span className="block truncate font-semibold">{currentPlan.content.title}</span>
          <span className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {currentPlan.content.subject} · {currentPlan.content.grade} · {new Date(currentPlan.updatedAt).toLocaleDateString()}
          </span>
        </button>
        <div className="flex items-center gap-3 self-start sm:self-center">
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{statusLabel[currentPlan.status]}</span>
          <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            {open ? 'Close' : editable ? 'Edit plan' : 'View plan'} <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      {open && <div className="space-y-5 border-t p-4">
        {detail.isLoading ? <p role="status" className="text-sm text-muted-foreground">Loading lesson plan and quality checks…</p> : detail.error ? <p role="alert" className="text-sm text-destructive">{detail.error.message}</p> : <>
          <TextField label="Title" value={currentContent.title} disabled={!editable} onChange={value => update('title', value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Subject" value={currentContent.subject} disabled={!editable} onChange={value => update('subject', value)} />
            <TextField label="Grade" value={currentContent.grade} disabled={!editable} onChange={value => update('grade', value)} />
          </div>
          <TextAreaField label="Learning outcome" value={currentContent.learningOutcome} disabled={!editable} onChange={value => update('learningOutcome', value)} />
          <ListEditor label="Objectives" values={currentContent.objectives} disabled={!editable} onChange={values => update('objectives', values)} />
          <ListEditor label="Materials" values={currentContent.materials} disabled={!editable} onChange={values => update('materials', values)} allowEmpty />
          <TextAreaField label="Starter" value={currentContent.starter} disabled={!editable} onChange={value => update('starter', value)} />
          <ActivitiesEditor activities={currentContent.activities} disabled={!editable} onChange={activities => update('activities', activities)} />
          <TextAreaField label="Check for understanding" value={currentContent.checkForUnderstanding} disabled={!editable} onChange={value => update('checkForUnderstanding', value)} />
          <div className="rounded-lg border p-3">
            <h3 className="text-sm font-semibold">Curriculum sources</h3>
            <p className="mt-1 text-sm text-muted-foreground">{currentContent.sources.length} source references attached to this plan.</p>
          </div>
          {qa && <QualityReport qa={qa} />}
          <SourceReferences sources={currentContent.sources} sourceLibrary={sources} />
          {reviews.length > 0 && <section className="space-y-2" aria-label="Review history">
            <h3 className="text-sm font-semibold">Review history</h3>
            {reviews.map(review => <div key={review.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{review.decision === 'published' ? 'Published' : 'Returned'} · {new Date(review.createdAt).toLocaleDateString()}</p>
              {review.comment && <p className="mt-1 text-muted-foreground">{review.comment}</p>}
            </div>)}
          </section>}
          {validationErrors.length > 0 && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p className="font-medium">Fix these fields before saving:</p><ul className="mt-1 list-inside list-disc">{validationErrors.map(error => <li key={error}>{error}</li>)}</ul></div>}
          {save.error && <p role="alert" className="text-sm text-destructive">Save failed: {save.error.message}</p>}
          {submit.error && <p role="alert" className="text-sm text-destructive">Submission failed: {submit.error.message}</p>}
          {editable && <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={save.isPending || submit.isPending} onClick={saveChanges}>{save.isPending ? 'Saving…' : 'Save changes'}</Button>
            <Button disabled={submit.isPending || save.isPending} onClick={submitChanges}>{submit.isPending ? 'Saving and submitting…' : 'Submit for review'}</Button>
          </div>}
          {!editable && <p className="text-sm text-muted-foreground">This plan is locked while it is in review or published.</p>}
        </>}
      </div>}
    </CardContent>
  </Card>
}

function PlanListSkeleton() {
  return <div className="space-y-3" role="status" aria-label="Loading lesson plans">
    {[1, 2, 3].map(index => <div key={index} className="h-24 animate-pulse rounded-xl border bg-card" />)}
  </div>
}

function EmptyPlans() {
  return <Card>
    <CardContent className="flex flex-col items-center py-12 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
      </span>
      <h3 className="font-semibold">No plans yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">Choose a curriculum outcome to create your first lesson plan.</p>
    </CardContent>
  </Card>
}

function PublishedBank({ plans, sources, loading }: { plans: Plan[]; sources: CurriculumSource[]; loading: boolean }) {
  return <section className="space-y-3" aria-labelledby="published-bank-heading">
    <div>
      <h2 id="published-bank-heading" className="text-xl font-semibold tracking-tight">Published lesson bank</h2>
      <p className="text-sm text-muted-foreground">Lessons approved for classroom use.</p>
    </div>
    {loading ? <div className="h-20 animate-pulse rounded-xl border bg-card" role="status" aria-label="Loading published lessons" /> : plans.length ? <div className="space-y-3">{plans.map(plan => <PlanEditor key={plan.id} plan={plan} sources={sources} />)}</div> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Published lessons will appear here.</p>}
  </section>
}

function SourceReferences({ sources, sourceLibrary }: { sources: LessonPlanContent['sources']; sourceLibrary: CurriculumSource[] }) {
  const references = sources.map(source => ({
    source,
    detail: sourceLibrary.find(item => item.documentId === source.documentId && item.chunkId === source.chunkId),
  }))

  return <section className="space-y-2" aria-labelledby="source-references-heading">
    <h3 id="source-references-heading" className="text-sm font-semibold">Curriculum sources</h3>
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

function TextField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="block space-y-1 text-sm font-medium">{label}<input className="h-10 w-full rounded-md border bg-background px-3 font-normal disabled:bg-muted" disabled={disabled} value={value} onChange={event => onChange(event.target.value)} /></label>
}

function TextAreaField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="block space-y-1 text-sm font-medium">{label}<textarea className="min-h-20 w-full rounded-md border bg-background p-3 font-normal disabled:bg-muted" disabled={disabled} value={value} onChange={event => onChange(event.target.value)} /></label>
}

function ListEditor({ label, values, disabled, onChange, allowEmpty = false }: { label: string; values: string[]; disabled: boolean; onChange: (values: string[]) => void; allowEmpty?: boolean }) {
  return <fieldset className="space-y-2">
    <legend className="text-sm font-semibold">{label}</legend>
    {values.map((value, index) => <div key={`${label}-${index}`} className="flex gap-2">
      <input aria-label={`${label} item ${index + 1}`} className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm disabled:bg-muted" disabled={disabled} value={value} onChange={event => onChange(values.map((item, i) => i === index ? event.target.value : item))} />
      {!allowEmpty && <Button type="button" variant="outline" size="sm" disabled={disabled || values.length === 1} aria-label={`Remove ${label.toLowerCase()} item ${index + 1}`} onClick={() => onChange(values.filter((_, i) => i !== index))}>Remove</Button>}
      {allowEmpty && <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Remove ${label.toLowerCase()} item ${index + 1}`} onClick={() => onChange(values.filter((_, i) => i !== index))}>Remove</Button>}
    </div>)}
    {!allowEmpty && <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...values, ''])}>Add {label.toLowerCase().replace(/s$/, '')}</Button>}
  </fieldset>
}

function ActivitiesEditor({ activities, disabled, onChange }: { activities: LessonPlanContent['activities']; disabled: boolean; onChange: (activities: LessonPlanContent['activities']) => void }) {
  return <fieldset className="space-y-3">
    <legend className="text-sm font-semibold">Activities</legend>
    {activities.map((activity, index) => <div key={`activity-${index}`} className="space-y-3 rounded-lg bg-muted/50 p-3">
      <TextField label="Activity title" value={activity.title} disabled={disabled} onChange={title => onChange(activities.map((item, i) => i === index ? { ...item, title } : item))} />
      <TextAreaField label="Description" value={activity.description} disabled={disabled} onChange={description => onChange(activities.map((item, i) => i === index ? { ...item, description } : item))} />
      <label className="block space-y-1 text-sm font-medium">Duration (minutes)<input type="number" min={1} className="h-10 w-full rounded-md border bg-background px-3 font-normal disabled:bg-muted sm:max-w-40" disabled={disabled} value={activity.durationMinutes} onChange={event => onChange(activities.map((item, i) => i === index ? { ...item, durationMinutes: Number(event.target.value) } : item))} /></label>
      <Button type="button" variant="outline" size="sm" disabled={disabled || activities.length === 1} onClick={() => onChange(activities.filter((_, i) => i !== index))}>Remove activity</Button>
    </div>)}
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...activities, { title: '', description: '', durationMinutes: 1 }])}>Add activity</Button>
  </fieldset>
}

function QualityReport({ qa }: { qa: Qa }) {
  return <section className="rounded-xl border bg-muted/30 p-4" aria-label="Quality checks">
    <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Quality checks</h3><span className="text-xs font-medium">{qa.passed ? 'Passed' : 'Needs attention'}</span></div>
    <ul className="space-y-2">{qa.checks.map(check => <li key={check.code} className="flex gap-2 text-sm"><span aria-hidden="true">{check.passed ? '✓' : '!'}</span><span>{check.message}</span></li>)}</ul>
  </section>
}

export const route = createRoute({ getParentRoute: () => rootRoute, path: '/teacher', beforeLoad: ({ location }) => requireRole('teacher', location.href), component: TeacherHome })
