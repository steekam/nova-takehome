import type { LessonPlanContent } from '@nova/shared'

export type LessonPlanVersion = {
  version: number
  content: LessonPlanContent
  createdBy: string
  createdAt: string
}
export type PlanReview = {
  id: string
  lessonPlanVersionId: string
  lessonPlanVersionNumber: number
  decision: string
  comment: string | null
  createdAt: string
}

export function PlanVersionHistory({
  versions,
  currentVersion,
}: {
  versions: LessonPlanVersion[]
  currentVersion: number
}) {
  return (
    <section aria-labelledby="version-history-heading">
      <h2 id="version-history-heading" className="font-semibold">
        Version history
      </h2>
      {versions.length ? (
        <ol className="mt-3 divide-y rounded-lg border px-3">
          {versions.map((version) => (
            <li
              key={version.version}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  Version {version.version}
                  {version.version === currentVersion && (
                    <span className="ml-2 text-xs text-primary">Current</span>
                  )}
                </p>
                <p className="mt-1 text-muted-foreground">{version.content.title}</p>
              </div>
              <p className="text-right text-xs text-muted-foreground">
                {new Date(version.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No saved versions.</p>
      )}
    </section>
  )
}

export function PlanReviewHistory({ reviews }: { reviews: PlanReview[] }) {
  return (
    <section aria-labelledby="review-history-heading">
      <h2 id="review-history-heading" className="font-semibold">
        Review comments
      </h2>
      {reviews.length ? (
        <ol className="mt-3 divide-y rounded-lg border px-3">
          {reviews.map((review) => (
            <li key={review.id} className="py-3 text-sm">
              <p className="font-medium">
                {review.decision === 'published' ? 'Published' : 'Returned'} · Version{' '}
                {review.lessonPlanVersionNumber} · {new Date(review.createdAt).toLocaleDateString()}
              </p>
              {review.comment && (
                <p className="mt-1 whitespace-pre-wrap leading-6 text-muted-foreground">
                  {review.comment}
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No review feedback yet.</p>
      )}
    </section>
  )
}
