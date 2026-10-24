import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { hasValidReturnComment } from '@nova/shared'
import { Button } from '../../../components/ui/button'
import { Card, CardContent } from '../../../components/ui/card'
import { PlanReviewHistory, PlanVersionHistory } from '../../../components/plan-history'
import { SourcePassage, SourceProvenance } from '../../../components/source-evidence'
import { RubricQaPanel } from '../../../components/rubric-qa-panel'
import { QualityChecks } from '../../../components/quality-checks'
import { ApiError } from '../../../lib/api-client'
import type { LeadQueueSearch } from './lead-dashboard'
import {
  getLessonPlan,
  lessonPlanningKeys,
  reviewLessonPlan,
  type LessonPlan,
  type LessonPlanDetails,
} from '../api'
import { curriculumLibraryKeys, listCurriculumSources } from '../../curriculum-library/api'

type Plan = LessonPlan
type Detail = LessonPlanDetails

export function LeadReviewPage({
  planId,
  overviewSearch,
}: {
  planId: string
  overviewSearch: LeadQueueSearch
}) {
  const queryClient = useQueryClient()
  const announcementRef = useRef<HTMLParagraphElement>(null)
  const publishDialogRef = useRef<HTMLDialogElement>(null)
  const cancelPublishRef = useRef<HTMLButtonElement>(null)
  const [comment, setComment] = useState('')
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const detail = useQuery({
    queryKey: lessonPlanningKeys.detail(planId),
    queryFn: () => getLessonPlan(planId),
  })
  const sources = useQuery({
    queryKey: curriculumLibraryKeys.sources,
    queryFn: listCurriculumSources,
  })
  const review = useMutation({
    mutationFn: (decision: 'returned' | 'published') =>
      reviewLessonPlan(planId, {
        decision,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      }),
    onSuccess: async (data, decision) => {
      if (decision === 'published') publishDialogRef.current?.close()
      queryClient.setQueryData<Detail>(lessonPlanningKeys.detail(planId), (current) =>
        current
          ? {
              ...current,
              plan: data.plan,
              viewer: data.viewer,
              reviews: [data.review, ...current.reviews],
            }
          : undefined,
      )
      setComment('')
      setConfirmPublish(false)
      setAnnouncement(
        decision === 'published' ? 'Lesson plan published.' : 'Lesson plan returned for revision.',
      )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.all }),
        queryClient.invalidateQueries({
          queryKey: lessonPlanningKeys.detail(planId),
          refetchType: decision === 'returned' ? 'none' : 'active',
        }),
      ])
    },
  })

  useEffect(() => {
    if (announcement) announcementRef.current?.focus()
  }, [announcement])

  useEffect(() => {
    const dialog = publishDialogRef.current
    if (!dialog) return
    if (confirmPublish && !dialog.open) {
      dialog.showModal()
      cancelPublishRef.current?.focus()
    } else if (!confirmPublish && dialog.open) {
      dialog.close()
    }
  }, [confirmPublish])

  if (detail.isLoading)
    return (
      <div
        className="h-96 animate-pulse rounded-xl border bg-card"
        role="status"
        aria-label="Loading selected lesson plan"
      />
    )
  if (detail.error)
    return (
      <Card>
        <CardContent className="p-5">
          <p role="alert" className="text-sm text-destructive">
            {detail.error.message || 'Unable to load this plan.'}
          </p>
          <Button className="mt-3" variant="outline" onClick={() => detail.refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    )
  if (!detail.data) return null

  const { plan, qa, reviews, versions } = detail.data
  const content = plan.content
  const { availableActions } = detail.data.viewer
  const canReview = availableActions.returnForRevision || availableActions.publish
  const statusLabel: Record<Plan['status'], string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    returned: 'Returned',
    published: 'Published',
  }
  const returnCommentValid = hasValidReturnComment(comment)
  const sourceDetails = content.sources.map((source) => ({
    source,
    detail: sources.data?.find(
      (item) => item.documentId === source.documentId && item.chunkId === source.chunkId,
    ),
  }))

  return (
    <div className={canReview ? 'space-y-7 pb-28' : 'space-y-7'}>
      <header className="space-y-3 border-b border-primary/15 pb-6">
        <Link
          to="/curriculum-lead"
          search={overviewSearch}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Overview
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{content.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Review submission · {content.subject} · {content.grade} · {content.durationMinutes}{' '}
            minutes
          </p>
          {plan.targetRevisionId && (
            <Link
              to="/library/targets/$targetRevisionId"
              params={{ targetRevisionId: plan.targetRevisionId }}
              className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
            >
              View exact curriculum target
            </Link>
          )}
        </div>
      </header>
      {announcement && (
        <p
          ref={announcementRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="rounded-lg bg-[#e9f0f2] p-3 text-sm font-medium text-primary"
        >
          {announcement}
        </p>
      )}
      {canReview ? (
        <section
          className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
          aria-labelledby="decision-heading"
        >
          <div>
            <h2 id="decision-heading" className="font-semibold">
              Make a decision
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Publish to approve and lock this plan, or return it with feedback.
            </p>
          </div>
          <label className="block max-w-3xl space-y-1 text-sm font-medium">
            Feedback for the teacher
            <textarea
              maxLength={2000}
              disabled={review.isPending}
              className="min-h-24 w-full rounded-md border bg-background p-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {availableActions.publish && (
              <Button
                type="button"
                disabled={review.isPending}
                onClick={() => setConfirmPublish(true)}
              >
                <CheckCircle2 aria-hidden="true" />
                Publish plan
              </Button>
            )}
            {availableActions.returnForRevision && (
              <Button
                type="button"
                variant="outline"
                disabled={review.isPending || !returnCommentValid}
                onClick={() => review.mutate('returned')}
              >
                Return for revision <ArrowRight aria-hidden="true" />
              </Button>
            )}
            {!returnCommentValid && (
              <p className="text-xs text-muted-foreground">
                Add at least eight characters of feedback to return this plan.
              </p>
            )}
          </div>
          {review.isPending && (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {review.variables === 'published' ? 'Publishing plan…' : 'Returning plan…'}
            </p>
          )}
          <dialog
            ref={publishDialogRef}
            aria-labelledby="publish-confirmation-title"
            aria-describedby="publish-confirmation-description"
            onClose={() => setConfirmPublish(false)}
            className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/50"
          >
            <div className="space-y-4 p-5">
              <div>
                <h3 id="publish-confirmation-title" className="font-semibold">
                  Publish “{content.title}”?
                </h3>
                <p
                  id="publish-confirmation-description"
                  className="mt-1 text-sm text-muted-foreground"
                >
                  The plan will be approved and locked for editing.
                </p>
              </div>
              {review.error && <ReviewError error={review.error} />}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  ref={cancelPublishRef}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() => publishDialogRef.current?.close()}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={review.isPending}
                  onClick={() => review.mutate('published')}
                >
                  {review.isPending ? 'Publishing…' : 'Confirm publish'}
                </Button>
              </div>
            </div>
          </dialog>
        </section>
      ) : (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {plan.status === 'returned'
            ? 'This plan has been returned for revision.'
            : plan.status === 'published'
              ? 'This plan is published and available to both roles.'
              : 'This plan has not been submitted for review.'}
        </p>
      )}
      <article className="rounded-xl border bg-card">
        <header className="border-b p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Updated {new Date(plan.updatedAt).toLocaleDateString()} · Version {plan.version}
            </p>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
              {statusLabel[plan.status]}
            </span>
          </div>
        </header>

        <div className="grid items-start gap-8 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(270px,0.75fr)]">
          <div className="min-w-0 space-y-8">
            <section className="space-y-3" aria-labelledby="learning-outcome-heading">
              <div>
                <h3 id="learning-outcome-heading" className="font-semibold">
                  Learning outcome
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {content.learningOutcome}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-semibold">Objectives</h4>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-6 text-muted-foreground">
                  {content.objectives.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section aria-labelledby="lesson-sequence-heading">
              <h3 id="lesson-sequence-heading" className="mb-3 font-semibold">
                Lesson sequence
              </h3>
              <article className="mb-4 rounded-lg bg-muted/55 p-4">
                <h4 className="font-semibold">Starter</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {content.starter}
                </p>
              </article>
              <div>
                {content.activities.map((activity, index) => (
                  <article
                    key={`${index}-${activity.title}`}
                    className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-t py-4 first:border-t-0 first:pt-0"
                  >
                    <span className="pt-0.5 text-sm font-semibold tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                        <h4 className="font-medium">{activity.title}</h4>
                        <span className="text-sm text-muted-foreground">
                          {activity.durationMinutes} min
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {activity.description}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section aria-labelledby="materials-heading">
              <h3 id="materials-heading" className="font-semibold">
                Materials
              </h3>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {content.materials.map((material, index) => (
                  <li key={`${index}-${material}`}>{material}</li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="assessment-heading">
              <h3 id="assessment-heading" className="font-semibold">
                Check for understanding
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {content.checkForUnderstanding}
              </p>
            </section>

            <section aria-labelledby="sources-heading">
              <h3 id="sources-heading" className="font-semibold">
                Curriculum references
              </h3>
              {sources.isLoading ? (
                <p role="status" className="mt-2 text-sm text-muted-foreground">
                  Loading source details…
                </p>
              ) : sources.error ? (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  Source details could not be loaded: {sources.error.message}
                </p>
              ) : content.sources.length ? (
                <div className="mt-3 space-y-3">
                  {sourceDetails.map(({ source, detail }) => (
                    <article
                      key={`${source.documentId}-${source.chunkId}`}
                      className="rounded-lg border p-4"
                    >
                      <h4 className="font-medium">{detail?.title ?? 'Curriculum source'}</h4>
                      {detail ? (
                        <>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {detail.subject} · {detail.grade}
                          </p>
                          <SourceProvenance source={detail} />
                          <SourcePassage source={detail} />
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Source details are unavailable. The citation remains attached to this
                          plan.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No curriculum references attached.
                </p>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-5 xl:sticky xl:top-6">
            {qa && <QualityChecks qa={qa} />}

            {availableActions.validate && (
              <RubricQaPanel
                planId={plan.id}
                versionId={plan.versionId}
                validation={detail.data.rubricQa}
              />
            )}

            <PlanVersionHistory versions={versions} currentVersion={plan.version} />
            <PlanReviewHistory reviews={reviews} />
          </aside>
        </div>
      </article>
      {canReview && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-lg backdrop-blur md:pl-64 md:pr-0">
          <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-2 md:px-8">
            {review.error && !confirmPublish && <ReviewError error={review.error} />}
            <div role="group" aria-label="Review actions" className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={review.isPending || !returnCommentValid}
                onClick={() => review.mutate('returned')}
              >
                Return for revision
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={review.isPending}
                onClick={() => setConfirmPublish(true)}
              >
                Publish plan
              </Button>
            </div>
            {!returnCommentValid && (
              <p className="text-right text-xs text-muted-foreground">
                Add at least eight characters of feedback above to return this plan.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ReviewError({ error }: { error: Error }) {
  return (
    <div role="alert" className="text-sm text-destructive">
      <p>Decision failed: {error.message}</p>
      {error instanceof ApiError && error.errors && (
        <ul className="mt-2 list-inside list-disc">
          {error.errors.map((issue) => (
            <li key={issue.field}>
              {issue.field}: {issue.constraints.join('. ')}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
