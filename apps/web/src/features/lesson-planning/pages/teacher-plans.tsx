import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ApiPrincipal } from '@nova/shared'
import { LessonPlanContentSchema } from '@nova/shared'
import { AppShell } from '../../../components/app-shell'
import { RubricQaPanel } from '../../../components/rubric-qa-panel'
import { Button } from '../../../components/ui/button'
import { buttonVariants } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import {
  PlanReviewHistory,
  PlanVersionHistory,
  type LessonPlanVersion,
} from '../../../components/plan-history'
import {
  generateLessonPlan,
  getLessonPlan,
  lessonPlanningKeys,
  submitLessonPlan,
  updateLessonPlan,
  type LessonPlan,
  type LessonPlanContent,
  type LessonPlanDetails,
  type QualityReport,
} from '../api'
import {
  curriculumLibraryKeys,
  listCurriculumOutcomes,
  listCurriculumSources,
  type CurriculumSource,
} from '../../curriculum-library/api'

type Plan = LessonPlan
type Detail = LessonPlanDetails
type Qa = QualityReport
const statusLabel: Record<Plan['status'], string> = {
  draft: 'Draft',
  submitted: 'In review',
  returned: 'Returned',
  published: 'Published',
}

export function GeneratePage({ user }: { user: ApiPrincipal }) {
  const queryClient = useQueryClient()
  const outcomes = useQuery({
    queryKey: curriculumLibraryKeys.outcomes,
    queryFn: listCurriculumOutcomes,
  })
  const [targetId, setTargetId] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(45)
  const generate = useMutation({
    mutationFn: () => generateLessonPlan({ targetRevisionId: targetId, durationMinutes }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.all }),
  })
  const selectedOutcome = outcomes.data?.find((outcome) => outcome.id === targetId)
  return (
    <AppShell role={user.roles[0]}>
      <div className="mx-auto max-w-4xl space-y-7">
        <header className="border-b border-primary/15 pb-6">
          <Link
            to="/teacher"
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Overview
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Create a lesson plan</h1>
          <p className="mt-2 text-muted-foreground">
            Choose a curriculum outcome and lesson length. You can edit the generated draft before
            submitting it.
          </p>
        </header>
        {outcomes.error && (
          <ErrorMessage
            message={`Curriculum outcomes could not be loaded: ${outcomes.error.message}`}
          />
        )}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(250px,0.8fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Plan starting point</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {outcomes.isLoading ? (
                <div role="status" className="h-11 animate-pulse rounded-md bg-muted" />
              ) : outcomes.isError ? null : outcomes.data?.length ? (
                <label className="block space-y-2 text-sm font-medium">
                  Curriculum outcome
                  <select
                    required
                    className="h-11 w-full rounded-md border bg-background px-3 font-normal"
                    value={targetId}
                    onChange={(event) => setTargetId(event.target.value)}
                  >
                    <option value="">Choose an outcome</option>
                    {outcomes.data.map((outcome) => (
                      <option key={outcome.id} value={outcome.id}>
                        {outcome.framework} · {outcome.programme} · {outcome.grade}{' '}
                        {outcome.subject} — {outcome.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No curriculum outcomes are ready yet. Browse the{' '}
                  <Link className="font-medium text-primary underline" to="/library">
                    Curriculum Library
                  </Link>{' '}
                  for targets that need sources.
                </p>
              )}
              <label className="block space-y-2 text-sm font-medium">
                Lesson length
                <select
                  className="h-11 w-full rounded-md border bg-background px-3 font-normal"
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(Number(event.target.value))}
                >
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                  <option value={90}>90 minutes</option>
                </select>
              </label>
              {generate.error && (
                <ErrorMessage message={`Plan generation failed: ${generate.error.message}`} />
              )}
              {generate.data ? (
                <div role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="font-medium">Draft ready: {generate.data.plan.content.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Review the full plan, then edit it before submission.
                  </p>
                  <Link
                    className={`${buttonVariants()} mt-4`}
                    to="/teacher/plans/$planId/edit"
                    params={{ planId: generate.data.plan.id }}
                  >
                    Edit draft <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              ) : (
                <Button
                  disabled={!targetId || generate.isPending || outcomes.isLoading}
                  onClick={() => generate.mutate()}
                >
                  {generate.isPending ? 'Generating draft…' : 'Generate draft'}
                </Button>
              )}
            </CardContent>
          </Card>
          <aside className="space-y-3 border-t pt-5 text-sm leading-6 text-muted-foreground lg:border-l lg:border-t-0 lg:pl-6 lg:pt-1">
            <h2 className="font-semibold text-foreground">Selected outcome</h2>
            {selectedOutcome ? (
              <>
                <p className="font-medium text-foreground">{selectedOutcome.title}</p>
                <p>
                  {selectedOutcome.framework} · {selectedOutcome.programme} ·{' '}
                  {selectedOutcome.subject} · {selectedOutcome.grade} ·{' '}
                  {selectedOutcome.editionLabel} · {selectedOutcome.locator}
                </p>
                <p>{selectedOutcome.content}</p>
              </>
            ) : (
              <p>The outcome’s learning goal will guide the generated plan.</p>
            )}
            <p>The generated plan stays a draft until you submit it for curriculum review.</p>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

export function PlanDetailPage({ user, planId }: { user: ApiPrincipal; planId: string }) {
  const detail = useQuery({
    queryKey: lessonPlanningKeys.detail(planId),
    queryFn: () => getLessonPlan(planId),
  })
  const sources = useQuery({
    queryKey: curriculumLibraryKeys.sources,
    queryFn: listCurriculumSources,
  })
  if (detail.isLoading) return <ShellLoading user={user} label="Loading lesson plan" />
  if (detail.error)
    return (
      <ShellError
        user={user}
        message={`This lesson plan could not be loaded: ${detail.error.message}`}
      />
    )
  if (!detail.data) return null
  if (detail.data.plan.teacherId !== user.subject)
    return <ShellError user={user} message="This lesson plan is not available in your workspace." />
  return (
    <AppShell role={user.roles[0]}>
      <PlanContent
        detail={detail.data}
        sources={sources.data ?? []}
        sourcesLoading={sources.isLoading}
        sourcesError={sources.error?.message}
      />
    </AppShell>
  )
}

export function EditPlanPage({ user, planId }: { user: ApiPrincipal; planId: string }) {
  const detail = useQuery({
    queryKey: lessonPlanningKeys.detail(planId),
    queryFn: () => getLessonPlan(planId),
  })
  const sources = useQuery({
    queryKey: curriculumLibraryKeys.sources,
    queryFn: listCurriculumSources,
  })
  if (detail.isLoading) return <ShellLoading user={user} label="Loading lesson plan editor" />
  if (detail.error)
    return (
      <ShellError
        user={user}
        message={`This lesson plan could not be loaded: ${detail.error.message}`}
      />
    )
  if (!detail.data) return null
  if (detail.data.plan.teacherId !== user.subject)
    return <ShellError user={user} message="This lesson plan is not available in your workspace." />
  if (detail.data.plan.status !== 'draft' && detail.data.plan.status !== 'returned')
    return (
      <AppShell role={user.roles[0]}>
        <PlanContent
          detail={detail.data}
          sources={sources.data ?? []}
          sourcesLoading={sources.isLoading}
          sourcesError={sources.error?.message}
        />
      </AppShell>
    )
  return (
    <AppShell role={user.roles[0]}>
      <PlanEditor
        key={detail.data.plan.id}
        initial={detail.data}
        sources={sources.data ?? []}
        sourcesLoading={sources.isLoading}
        sourcesError={sources.error?.message}
      />
    </AppShell>
  )
}

function ShellLoading({ user, label }: { user: ApiPrincipal; label: string }) {
  return (
    <AppShell role={user.roles[0]}>
      <div
        role="status"
        aria-label={label}
        className="h-96 animate-pulse rounded-xl border bg-card"
      />
    </AppShell>
  )
}
function ShellError({ user, message }: { user: ApiPrincipal; message: string }) {
  return (
    <AppShell role={user.roles[0]}>
      <div className="space-y-4">
        <Link
          to="/teacher"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Overview
        </Link>
        <ErrorMessage message={message} />
      </div>
    </AppShell>
  )
}

function PlanEditor({
  initial,
  sources,
  sourcesLoading,
  sourcesError,
}: {
  initial: Detail
  sources: CurriculumSource[]
  sourcesLoading: boolean
  sourcesError?: string
}) {
  const queryClient = useQueryClient()
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const errorsRef = useRef<HTMLDivElement>(null)
  const plan = initial.plan
  const [content, setContent] = useState(plan.content)
  const [versions, setVersions] = useState(initial.versions)
  const [qa, setQa] = useState(initial.qa)
  const [qaStale, setQaStale] = useState(false)
  const [submittedPlan, setSubmittedPlan] = useState<Plan | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const save = useMutation({
    mutationFn: (value: LessonPlanContent) => updateLessonPlan(plan.id, value),
    onSuccess: async (result) => {
      setContent(result.plan.content)
      setQa(result.qa)
      setQaStale(false)
      setVersions((current) => withLatestVersion(current, result.plan))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.detail(plan.id) }),
        queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.all }),
      ])
    },
  })
  const submit = useMutation({
    mutationFn: async (value: LessonPlanContent) => {
      const saved = await updateLessonPlan(plan.id, value)
      try {
        return await submitLessonPlan(plan.id)
      } catch (error) {
        setContent(saved.plan.content)
        setQa(saved.qa)
        setQaStale(false)
        setVersions((current) => withLatestVersion(current, saved.plan))
        queryClient.setQueryData(lessonPlanningKeys.detail(plan.id), {
          ...initial,
          ...saved,
          reviews: initial.reviews,
        })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.detail(plan.id) }),
          queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.all }),
        ])
        throw new Error(
          `Changes were saved, but submission failed: ${error instanceof Error ? error.message : 'Request failed.'}`,
        )
      }
    },
    onSuccess: async (result) => {
      setSubmittedPlan(result.plan)
      setVersions((current) => withLatestVersion(current, result.plan))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.detail(plan.id) }),
        queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.all }),
      ])
    },
  })
  useEffect(() => {
    if (validationErrors.length) errorsRef.current?.focus()
  }, [validationErrors])
  useEffect(() => {
    if (save.isSuccess || submit.isSuccess) feedbackRef.current?.focus()
  }, [save.isSuccess, submit.isSuccess])
  function update<K extends keyof LessonPlanContent>(key: K, value: LessonPlanContent[K]) {
    setContent((existing) => ({ ...existing, [key]: value }))
    setQaStale(true)
    setValidationErrors([])
    save.reset()
    submit.reset()
  }
  function validate() {
    const result = LessonPlanContentSchema.safeParse(content)
    if (!result.success) {
      setValidationErrors(
        result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      )
      return null
    }
    setValidationErrors([])
    return result.data
  }
  const sourceContent: Detail = { ...initial, versions, plan: { ...plan, content } }
  if (submittedPlan)
    return (
      <PlanContent
        detail={{ ...initial, plan: submittedPlan, versions, qa: submit.data?.qa ?? qa }}
        sources={sources}
        sourcesLoading={sourcesLoading}
        sourcesError={sourcesError}
      />
    )
  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-primary/15 pb-6 sm:flex-row sm:items-end">
        <div>
          <Link
            to="/teacher/plans/$planId"
            params={{ planId: plan.id }}
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> View plan
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Edit lesson plan</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Changes stay in draft until you submit for review.
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1.5 text-sm font-medium">
          {statusLabel[plan.status]}
        </span>
      </header>
      {(save.isSuccess || submit.isSuccess) && (
        <p
          ref={feedbackRef}
          tabIndex={-1}
          role="status"
          className="rounded-lg bg-primary/5 p-3 text-sm font-medium text-primary"
        >
          {submit.isSuccess ? 'Submitted for curriculum review.' : 'Changes saved.'}
        </p>
      )}
      {(save.error || submit.error) && (
        <ErrorMessage
          message={save.error?.message ?? submit.error?.message ?? 'The plan could not be saved.'}
        />
      )}
      {validationErrors.length > 0 && (
        <div
          ref={errorsRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <p className="font-medium">Fix these fields before saving:</p>
          <ul className="mt-2 list-inside list-disc">
            {validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.7fr)]">
        <fieldset disabled={save.isPending || submit.isPending} className="min-w-0 space-y-7">
          <Card>
            <CardHeader>
              <CardTitle>Plan details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <TextField
                label="Title"
                value={content.title}
                onChange={(value) => update('title', value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Subject"
                  readOnly={!!plan.targetRevisionId}
                  value={content.subject}
                  onChange={(value) => update('subject', value)}
                />
                <TextField
                  label="Grade"
                  readOnly={!!plan.targetRevisionId}
                  value={content.grade}
                  onChange={(value) => update('grade', value)}
                />
              </div>
              <TextAreaField
                label="Learning outcome"
                readOnly={!!plan.targetRevisionId}
                value={content.learningOutcome}
                onChange={(value) => update('learningOutcome', value)}
              />
              {plan.targetRevisionId && (
                <p className="text-sm text-muted-foreground">
                  The curriculum target fixes the subject, grade and learning outcome.{' '}
                  <Link to="/teacher/plans/new" className="font-medium text-primary underline">
                    Create a new plan
                  </Link>{' '}
                  to choose another target.
                </p>
              )}
              <ListEditor
                label="Objectives"
                values={content.objectives}
                onChange={(values) => update('objectives', values)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Lesson sequence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <ListEditor
                label="Materials"
                values={content.materials}
                onChange={(values) => update('materials', values)}
                allowEmpty
              />
              <TextAreaField
                label="Starter"
                value={content.starter}
                onChange={(value) => update('starter', value)}
              />
              <ActivitiesEditor
                activities={content.activities}
                onChange={(activities) => update('activities', activities)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Assessment</CardTitle>
            </CardHeader>
            <CardContent>
              <TextAreaField
                label="Check for understanding"
                value={content.checkForUnderstanding}
                onChange={(value) => update('checkForUnderstanding', value)}
              />
            </CardContent>
          </Card>
        </fieldset>
        <aside className="space-y-6 xl:sticky xl:top-6">
          <PlanContext
            detail={sourceContent}
            sources={sources}
            sourcesLoading={sourcesLoading}
            sourcesError={sourcesError}
          />
          {!qaStale && (
            <RubricQaPanel
              planId={plan.id}
              versionId={plan.versionId}
              validation={initial.rubricQa}
            />
          )}
          {qaStale ? (
            <p
              role="status"
              className="rounded-xl border bg-card p-4 text-sm text-muted-foreground"
            >
              Quality checks need to be rerun after your edits. Save the draft to check the current
              plan.
            </p>
          ) : (
            qa && <QualityReport qa={qa} />
          )}
          <div className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold">Ready to send?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Save your draft as you work. Submit when the plan is ready for curriculum review.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={save.isPending || submit.isPending}
                onClick={() => {
                  const valid = validate()
                  if (valid) save.mutate(valid)
                }}
              >
                {save.isPending ? 'Saving…' : 'Save draft'}
              </Button>
              <Button
                disabled={submit.isPending || save.isPending}
                onClick={() => {
                  const valid = validate()
                  if (valid) submit.mutate(valid)
                }}
              >
                {submit.isPending ? 'Submitting…' : 'Submit for review'}
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function withLatestVersion(versions: LessonPlanVersion[], plan: Plan): LessonPlanVersion[] {
  return [
    {
      version: plan.version,
      content: plan.content,
      createdBy: plan.teacherId,
      createdAt: plan.updatedAt,
    },
    ...versions.filter((version) => version.version !== plan.version),
  ].sort((a, b) => b.version - a.version)
}

function PlanContent({
  detail,
  sources,
  sourcesLoading,
  sourcesError,
}: {
  detail: Detail
  sources: CurriculumSource[]
  sourcesLoading: boolean
  sourcesError?: string
}) {
  const { plan } = detail
  const editable = plan.status === 'draft' || plan.status === 'returned'
  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-primary/15 pb-6 sm:flex-row sm:items-end">
        <div>
          <Link
            to="/teacher"
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Overview
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{plan.content.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {plan.content.subject} · {plan.content.grade} · {plan.content.durationMinutes} minutes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-muted px-3 py-1.5 text-sm font-medium">
            {statusLabel[plan.status]}
          </span>
          {editable && (
            <Link
              className={buttonVariants()}
              to="/teacher/plans/$planId/edit"
              params={{ planId: plan.id }}
            >
              Edit plan
            </Link>
          )}
        </div>
      </header>
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.7fr)]">
        <div className="space-y-7">
          <Card>
            <CardHeader>
              <CardTitle>Learning goals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground">Learning outcome</h2>
                <p className="mt-2 leading-7">{plan.content.learningOutcome}</p>
              </section>
              <ListReadOnly label="Objectives" values={plan.content.objectives} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Lesson sequence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <ListReadOnly label="Materials" values={plan.content.materials} />
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground">Starter</h2>
                <p className="mt-2 whitespace-pre-wrap leading-7">{plan.content.starter}</p>
              </section>
              <section className="space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground">Activities</h2>
                <ol className="divide-y">
                  {plan.content.activities.map((activity, index) => (
                    <li
                      key={`${activity.title}-${index}`}
                      className="flex gap-4 py-4 first:pt-0 last:pb-0"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h3 className="font-semibold">{activity.title}</h3>
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
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Assessment</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap leading-7">{plan.content.checkForUnderstanding}</p>
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-6 xl:sticky xl:top-6">
          <PlanContext
            detail={detail}
            sources={sources}
            sourcesLoading={sourcesLoading}
            sourcesError={sourcesError}
          />
          {detail.qa && <QualityReport qa={detail.qa} />}
          <RubricQaPanel planId={plan.id} versionId={plan.versionId} validation={detail.rubricQa} />
          <PlanVersionHistory versions={detail.versions} currentVersion={plan.version} />
          <PlanReviewHistory reviews={detail.reviews} />
          {plan.status === 'submitted' && (
            <p className="rounded-xl border bg-card p-4 text-sm leading-6 text-muted-foreground">
              This plan is locked while it is with the curriculum lead for review.
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}

function PlanContext({
  detail,
  sources,
  sourcesLoading,
  sourcesError,
}: {
  detail: Detail
  sources: CurriculumSource[]
  sourcesLoading: boolean
  sourcesError?: string
}) {
  const content = detail.plan.content
  const references = content.sources.map((source) => ({
    source,
    match: sources.find(
      (item) => item.documentId === source.documentId && item.chunkId === source.chunkId,
    ),
  }))
  return (
    <section className="space-y-4" aria-labelledby="plan-context-heading">
      <h2 id="plan-context-heading" className="text-lg font-semibold">
        Plan context
      </h2>
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Selected curriculum target</h3>
        {detail.plan.targetRevisionId ? (
          <Link
            to="/library/targets/$targetRevisionId"
            params={{ targetRevisionId: detail.plan.targetRevisionId }}
            className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
          >
            {content.subject} · {content.grade} · View exact target
          </Link>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            This is a legacy plan without a linked catalogue target.
          </p>
        )}
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Curriculum sources</h3>
        {sourcesError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Source details could not be loaded: {sourcesError}
          </p>
        ) : (
          sourcesLoading && (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              Loading source details…
            </p>
          )
        )}
        {!sourcesLoading && !sourcesError && references.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">No source references were attached.</p>
        )}
        {!sourcesLoading && !sourcesError && (
          <div className="mt-3 space-y-4">
            {references.map(({ source, match }) => (
              <article
                key={`${source.documentId}-${source.chunkId}`}
                className="border-t pt-3 first:border-0 first:pt-0"
              >
                <h4 className="font-medium">{match?.title ?? 'Curriculum source'}</h4>
                {match && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {match.resourceType} · {match.subject} · {match.grade}
                  </p>
                )}
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {match?.content ?? `Source reference ${source.documentId} · ${source.chunkId}`}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function TextField({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string
  value: string
  readOnly?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      {label}
      <input
        className="h-10 w-full rounded-md border bg-background px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
function TextAreaField({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string
  value: string
  readOnly?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      {label}
      <textarea
        className="min-h-24 w-full rounded-md border bg-background p-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
function ListEditor({
  label,
  values,
  onChange,
  allowEmpty = false,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  allowEmpty?: boolean
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      {values.map((value, index) => (
        <div key={`${label}-${index}`} className="flex gap-2">
          <input
            aria-label={`${label} item ${index + 1}`}
            className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
            value={value}
            onChange={(event) =>
              onChange(values.map((item, i) => (i === index ? event.target.value : item)))
            }
          />
          {allowEmpty || values.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Remove ${label.toLowerCase()} item ${index + 1}`}
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          ) : null}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ''])}>
        Add item
      </Button>
    </fieldset>
  )
}
function ListReadOnly({ label, values }: { label: string; values: string[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted-foreground">{label}</h2>
      <ul className="mt-2 list-inside list-disc space-y-1.5">
        {values.map((value, index) => (
          <li key={`${label}-${index}`} className="leading-6">
            {value}
          </li>
        ))}
      </ul>
    </section>
  )
}
function ActivitiesEditor({
  activities,
  onChange,
}: {
  activities: LessonPlanContent['activities']
  onChange: (activities: LessonPlanContent['activities']) => void
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 text-sm font-semibold">Activities</legend>
      {activities.map((activity, index) => (
        <div key={`activity-${index}`} className="space-y-3 rounded-lg bg-muted/50 p-4">
          <TextField
            label="Activity title"
            value={activity.title}
            onChange={(title) =>
              onChange(activities.map((item, i) => (i === index ? { ...item, title } : item)))
            }
          />
          <TextAreaField
            label="Description"
            value={activity.description}
            onChange={(description) =>
              onChange(activities.map((item, i) => (i === index ? { ...item, description } : item)))
            }
          />
          <label className="block space-y-1.5 text-sm font-medium">
            Duration (minutes)
            <input
              type="number"
              min={1}
              className="h-10 w-full rounded-md border bg-background px-3 sm:max-w-40"
              value={activity.durationMinutes}
              onChange={(event) =>
                onChange(
                  activities.map((item, i) =>
                    i === index ? { ...item, durationMinutes: Number(event.target.value) } : item,
                  ),
                )
              }
            />
          </label>
          {activities.length > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(activities.filter((_, i) => i !== index))}
            >
              Remove activity
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([...activities, { title: '', description: '', durationMinutes: 1 }])
        }
      >
        Add activity
      </Button>
    </fieldset>
  )
}
function QualityReport({ qa }: { qa: Qa }) {
  return (
    <section className="rounded-xl border bg-card p-4" aria-label="Quality checks">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Quality checks</h2>
        <span className="text-xs font-medium">{qa.passed ? 'Passed' : 'Needs attention'}</span>
      </div>
      <ul className="mt-3 space-y-2">
        {qa.checks.map((check) => (
          <li key={check.code} className="flex gap-2 text-sm leading-6">
            <span
              aria-hidden="true"
              className={check.passed ? 'text-emerald-700' : 'text-destructive'}
            >
              {check.passed ? <Check className="mt-1 size-4" /> : <X className="mt-1 size-4" />}
            </span>
            <span>{check.message}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {message}
    </p>
  )
}
