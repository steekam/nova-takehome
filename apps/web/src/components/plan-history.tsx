import type { LessonPlanContent } from '@nova/shared'
import { ChevronRight } from 'lucide-react'

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
    <details className="rounded-xl border bg-card">
      <summary className="group flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span>
          Version history{' '}
          <span className="text-sm font-normal text-muted-foreground">({versions.length})</span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
        />
      </summary>
      {versions.length ? (
        <ol className="divide-y border-t px-4">
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
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">No saved versions.</p>
      )}
    </details>
  )
}

export function PlanReviewHistory({ reviews }: { reviews: PlanReview[] }) {
  return (
    <details className="rounded-xl border bg-card">
      <summary className="group flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span>
          Review comments{' '}
          <span className="text-sm font-normal text-muted-foreground">({reviews.length})</span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
        />
      </summary>
      {reviews.length ? (
        <ol className="divide-y border-t px-4">
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
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">No review feedback yet.</p>
      )}
    </details>
  )
}
