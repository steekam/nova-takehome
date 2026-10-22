import { CheckCircle2, XCircle } from 'lucide-react'
import type { QualityReport } from '../features/lesson-planning/api'

const checkLabels: Record<string, { label: string; passed: string; failed: string }> = {
  'lesson-structure': {
    label: 'Required lesson sections',
    passed: 'All required sections are present.',
    failed: 'Add or correct the missing required sections.',
  },
  'duration-total': {
    label: 'Activity timing',
    passed: 'Activity times add up to the lesson length.',
    failed: 'Adjust activity times so they add up to the lesson length.',
  },
  'citations-present': {
    label: 'Curriculum citations',
    passed: 'The plan cites curriculum passages.',
    failed: 'Add at least one curriculum source citation.',
  },
  'official-target-citation': {
    label: 'Selected outcome source',
    passed: 'The plan cites the official passage that defines this outcome.',
    failed: 'Cite the official passage that defines the selected outcome.',
  },
  'citation-source-membership': {
    label: 'Source set membership',
    passed: 'Every citation came from the source set retrieved for this plan.',
    failed: 'Use only curriculum passages retrieved for this plan.',
  },
}

export function QualityChecks({ qa }: { qa: QualityReport }) {
  return (
    <section className="rounded-xl border bg-card p-4" aria-label="Quality checks">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Quality checks</h2>
        <span className="text-xs font-medium">{qa.passed ? 'Passed' : 'Needs attention'}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        These checks verify structure, timing, and source links. They do not judge teaching quality.
      </p>
      <ul className="mt-3 space-y-2">
        {[...qa.checks]
          .sort((left, right) => Number(left.passed) - Number(right.passed))
          .map((check) => {
            const copy = checkLabels[check.code]
            return (
              <li key={check.code} className="flex gap-2 text-sm leading-6">
                <span
                  aria-hidden="true"
                  className={check.passed ? 'text-emerald-700' : 'text-destructive'}
                >
                  {check.passed ? (
                    <CheckCircle2 className="mt-1 size-4" />
                  ) : (
                    <XCircle className="mt-1 size-4" />
                  )}
                </span>
                <span>
                  <strong>{copy?.label ?? 'Plan check'}:</strong>{' '}
                  {copy ? (check.passed ? copy.passed : copy.failed) : check.message}
                </span>
              </li>
            )
          })}
      </ul>
      <p className="mt-3 border-t pt-3 text-xs leading-5 text-muted-foreground">
        Source checks confirm that citations belong to this plan; they do not confirm that each
        passage supports the teaching claim.
      </p>
    </section>
  )
}
