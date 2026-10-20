import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { lessonPlanningKeys, validateLessonPlan, type RubricQa } from '../features/lesson-planning/api'

export function RubricQaPanel({ planId, versionId, validation }: { planId: string; versionId: string; validation: RubricQa | null }) {
  const queryClient = useQueryClient()
  const run = useMutation({
    mutationFn: () => validateLessonPlan(planId, versionId),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.detail(planId) }),
  })
  const stale = validation !== null && validation.lessonPlanVersionId !== versionId
  const current = stale ? null : validation
  return <Card aria-label="Guided rubric review">
    <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
      <CardTitle className="flex items-center gap-2 text-base"><Sparkles aria-hidden="true" className="size-4" /> Guided review</CardTitle>
      <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? 'Reviewing…' : current ? 'Run again' : 'Run review'}</Button>
    </CardHeader>
    <CardContent className="space-y-4">
      {stale && <p role="status" className="text-sm text-muted-foreground">This review covers an earlier version. Run it again for the current version.</p>}
      {run.error && <p role="alert" className="text-sm text-destructive">Guided review failed: {run.error.message}</p>}
      {!current && !stale && !run.isPending && <p className="text-sm leading-6 text-muted-foreground">Get suggestions on outcome alignment, objectives, activities, assessment, pacing and source support. This advice does not block saving or submission.</p>}
      {current && <>
        <div className="flex items-start gap-2 text-sm"><span className={current.status === 'completed' ? 'text-emerald-700' : 'text-amber-700'}>{current.status === 'completed' ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4" /> : <AlertCircle aria-hidden="true" className="mt-0.5 size-4" />}</span><p>{current.summary}</p></div>
        {current.dimensions.map(dimension => <section key={dimension.key} className="border-t pt-3 text-sm">
          <div className="flex justify-between gap-3 font-medium"><h3>{dimension.key.replaceAll('_', ' ')}</h3><span>{dimension.score}/4</span></div>
          <p className="mt-1 leading-6 text-muted-foreground">{dimension.rationale}</p>
          {dimension.suggestions.length > 0 && <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">{dimension.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul>}
        </section>)}
      </>}
    </CardContent>
  </Card>
}
