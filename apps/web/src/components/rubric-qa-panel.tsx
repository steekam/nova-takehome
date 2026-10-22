import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import {
  lessonPlanningKeys,
  validateLessonPlan,
  type RubricQa,
} from '../features/lesson-planning/api'

const rubricDimensions: Record<
  RubricQa['dimensions'][number]['key'],
  { label: string; description: string }
> = {
  outcome_alignment: {
    label: 'Outcome alignment',
    description: 'Does the lesson teach the selected curriculum outcome?',
  },
  objective_measurability: {
    label: 'Measurable objectives',
    description: 'Can a teacher observe whether learners met each objective?',
  },
  activity_alignment: {
    label: 'Activity alignment',
    description: 'Do the lesson steps give learners practice toward the outcome?',
  },
  assessment_quality: {
    label: 'Assessment quality',
    description: 'Does the final check show whether learners met the outcome?',
  },
  pacing_feasibility: {
    label: 'Pacing',
    description: 'Do the activities fit the time available for this lesson?',
  },
  source_support: {
    label: 'Source support',
    description: 'Do the cited curriculum passages support the lesson content?',
  },
}
const planFieldLabels: Record<
  RubricQa['dimensions'][number]['evidence'][number]['planPath'],
  string
> = {
  title: 'Title',
  subject: 'Subject',
  grade: 'Grade',
  learningOutcome: 'Learning outcome',
  durationMinutes: 'Lesson duration',
  objectives: 'Objectives',
  materials: 'Materials',
  starter: 'Starter',
  activities: 'Activities',
  checkForUnderstanding: 'Check for understanding',
  sources: 'Curriculum references',
}

export function RubricQaPanel({
  planId,
  versionId,
  validation,
}: {
  planId: string
  versionId: string
  validation: RubricQa | null
}) {
  const queryClient = useQueryClient()
  const run = useMutation({
    mutationFn: () => validateLessonPlan(planId, versionId),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.detail(planId) }),
  })
  const stale = validation !== null && validation.lessonPlanVersionId !== versionId
  const current = stale ? null : validation
  return (
    <Card aria-label="Guided quality review">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles aria-hidden="true" className="size-4" /> Guided quality review
        </CardTitle>
        <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? 'Reviewing…' : current ? 'Run again' : 'Run review'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs leading-5 text-muted-foreground">
          AI advice is optional and does not block saving, submission, or publication. Scores run
          from 1 (not met) to 4 (clearly met); 2 means major gaps and 3 means mostly met with minor
          gaps.
        </p>
        {run.isPending && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            Reviewing this plan version…
          </p>
        )}
        {run.isSuccess && !run.isPending && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            Guided review complete. Results are saved for this plan version.
          </p>
        )}
        {stale && (
          <p role="status" className="text-sm text-muted-foreground">
            This review covers an earlier version. Run it again for the current version.
          </p>
        )}
        {run.error && (
          <p role="alert" className="text-sm text-destructive">
            Guided review failed: {run.error.message}
          </p>
        )}
        {!current && !stale && !run.isPending && (
          <p className="text-sm leading-6 text-muted-foreground">
            Run a review to get suggestions on the lesson’s alignment, objectives, activities,
            assessment, pacing, and curriculum support.
          </p>
        )}
        {current && (
          <>
            <div className="flex items-start gap-2 text-sm">
              <span
                className={current.status === 'completed' ? 'text-emerald-700' : 'text-amber-700'}
              >
                {current.status === 'completed' ? (
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4" />
                ) : (
                  <AlertCircle aria-hidden="true" className="mt-0.5 size-4" />
                )}
              </span>
              <p>{current.summary}</p>
            </div>
            {current.dimensions.map((dimension) => {
              const planFields = [
                ...new Set(dimension.evidence.map((item) => planFieldLabels[item.planPath])),
              ]
              const sourceCount = new Set(dimension.evidence.flatMap((item) => item.sourceChunkIds))
                .size
              return (
                <section key={dimension.key} className="border-t pt-3 text-sm">
                  <div className="flex justify-between gap-3 font-medium">
                    <h3>{rubricDimensions[dimension.key].label}</h3>
                    <span>Score {dimension.score} of 4</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {rubricDimensions[dimension.key].description}
                  </p>
                  <p className="mt-1 leading-6 text-muted-foreground">{dimension.rationale}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Evidence:{' '}
                    {planFields.length ? planFields.join(', ') : 'No plan section recorded'}
                    {sourceCount > 0
                      ? ` · ${sourceCount} curriculum excerpt${sourceCount === 1 ? '' : 's'}`
                      : ''}
                  </p>
                  {dimension.suggestions.length > 0 && (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                      {dimension.suggestions.map((suggestion, index) => (
                        <li key={index}>{suggestion}</li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </>
        )}
      </CardContent>
    </Card>
  )
}
