import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { QualityReport } from '../features/lesson-planning/api'

const checkLabels: Record<string, { label: string; passed: string; failed: string }> = {
  'lesson-structure': {
    label: 'Required lesson sections',
    passed: 'All required sections are present.',
    failed: 'Add or correct the missing required sections.',
  },
  'duration-total': {
    label: 'Suggested activity timing',
    passed: 'Activity times add up to the lesson length.',
    failed: 'Review suggested activity times before teaching.',
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
  const hasWarnings = qa.checks.some((check) => check.status === 'warning')
  return (
    <section className="rounded-xl border bg-card p-4" aria-label="Quality checks">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Quality checks</h2>
        <span className="text-xs font-medium">
          {!qa.passed ? 'Needs attention' : hasWarnings ? 'Review suggestions' : 'Passed'}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        These checks verify structure and source links. Activity timing is a suggestion; adjust it
        if needed. They do not judge teaching quality.
      </p>
      <ul className="mt-3 space-y-2">
        {[...qa.checks]
          .sort(
            (left, right) =>
              ({ failed: 0, warning: 1, passed: 2 })[left.status] -
              { failed: 0, warning: 1, passed: 2 }[right.status],
          )
          .map((check) => {
            const copy = checkLabels[check.code]
            return (
              <li key={check.code} className="flex gap-2 text-sm leading-6">
                <span
                  aria-hidden="true"
                  className={
                    check.status === 'passed'
                      ? 'text-emerald-700'
                      : check.status === 'warning'
                        ? 'text-amber-700'
                        : 'text-destructive'
                  }
                >
                  {check.status === 'passed' ? (
                    <CheckCircle2 className="mt-1 size-4" />
                  ) : check.status === 'warning' ? (
                    <AlertTriangle className="mt-1 size-4" />
                  ) : (
                    <XCircle className="mt-1 size-4" />
                  )}
                </span>
                <span>
                  <strong>{copy?.label ?? 'Plan check'}:</strong>{' '}
                  {check.code === 'duration-total' && check.status === 'warning'
                    ? check.message
                    : copy
                      ? check.status === 'passed'
                        ? copy.passed
                        : copy.failed
                      : check.message}
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
