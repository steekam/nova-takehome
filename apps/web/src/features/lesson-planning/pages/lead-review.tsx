import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { hasValidReturnComment } from '@nova/shared'
import { Button } from '../../../components/ui/button'
import { Card, CardContent } from '../../../components/ui/card'
import { ApiError } from '../../../lib/api-client'
import type { LeadQueueSearch } from './lead-dashboard'
import { getLessonPlan, lessonPlanningKeys, reviewLessonPlan, type LessonPlanDetails } from '../api'
import { curriculumLibraryKeys, listCurriculumSources } from '../../curriculum-library/api'
import { PlanDetailLayout } from '../components/plan-detail-layout'
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

  const { plan } = detail.data
  const content = plan.content
  const { availableActions } = detail.data.viewer
  const canReview = availableActions.returnForRevision || availableActions.publish
  const returnCommentValid = hasValidReturnComment(comment)

  return (
    <PlanDetailLayout
      detail={detail.data}
      sources={sources.data ?? []}
      sourcesLoading={sources.isLoading}
      sourcesError={sources.error?.message}
      backLink={
        <Link
          to="/curriculum-lead"
          search={overviewSearch}
          className="mb-1 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Overview
        </Link>
      }
      headerNote="Review submission"
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
      <div className={canReview ? 'space-y-5 pb-28' : 'space-y-5'}>
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
        <p className="text-xs text-muted-foreground">
          Updated {new Date(plan.updatedAt).toLocaleDateString()} · Version {plan.version}
        </p>
        <article className="space-y-7">
          <section
            className="rounded-xl border bg-card p-5 sm:p-6"
            aria-labelledby="learning-outcome-heading"
          >
            <div className="space-y-5">
              <div>
                <h2 id="learning-outcome-heading" className="text-lg font-semibold">
                  Learning outcome
                </h2>
                <p className="mt-2 leading-7 text-muted-foreground">{content.learningOutcome}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground">Objectives</h3>
                <ul className="mt-2 list-inside list-disc space-y-2 text-sm leading-6 text-muted-foreground">
                  {content.objectives.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
          <section
            className="rounded-xl border bg-card p-5 sm:p-6"
            aria-labelledby="lesson-sequence-heading"
          >
            <h2 id="lesson-sequence-heading" className="text-lg font-semibold">
              Lesson sequence
            </h2>
            <div className="mt-5 space-y-6">
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground">Materials</h3>
                {content.materials.length ? (
                  <ul className="mt-2 list-inside list-disc space-y-2 text-sm leading-6 text-muted-foreground">
                    {content.materials.map((material, index) => (
                      <li key={`${index}-${material}`}>{material}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No additional materials.</p>
                )}
              </section>
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground">Starter</h3>
                <p className="mt-2 whitespace-pre-wrap leading-7 text-muted-foreground">
                  {content.starter}
                </p>
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
            </div>
          </section>
          <section
            className="rounded-xl border bg-card p-5 sm:p-6"
            aria-labelledby="assessment-heading"
          >
            <h2 id="assessment-heading" className="text-lg font-semibold">
              Check for understanding
            </h2>
            <p className="mt-2 whitespace-pre-wrap leading-7 text-muted-foreground">
              {content.checkForUnderstanding}
            </p>
          </section>
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
    </PlanDetailLayout>
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
