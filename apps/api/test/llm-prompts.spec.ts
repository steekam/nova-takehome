import {
  lessonPlanGenerationPrompt,
  lessonPlanGenerationPromptVersion,
  renderLessonPlanGenerationPrompt,
  lessonPlanGenerationOutputSchema,
} from '../src/lesson-planning/llm-workflows/generation-prompt'
import {
  lessonPlanRubricPrompt,
  lessonPlanRubricPromptVersion,
  renderLessonPlanRubricPrompt,
  lessonPlanRubricOutputSchema,
} from '../src/lesson-planning/llm-workflows/rubric-prompt'
import { LessonPlanContentSchema, LessonPlanRubricReviewOutputSchema } from '@nova/shared'
import { z } from 'zod'
import { hasPromptVariables } from '../src/lesson-planning/llm-workflows/langfuse-prompts'

describe('lesson planning prompts', () => {
  it('requires managed prompts to expose every runtime contract variable', () => {
    expect(hasPromptVariables('schema: {{{output_schema}}}', { output_schema: '{}' })).toBe(true)
    expect(hasPromptVariables('old static prompt', { output_schema: '{}' })).toBe(false)
  })

  it('versions the teacher-facing generation instructions', () => {
    expect(lessonPlanGenerationPromptVersion).toBe('lesson-plan-generation-v4')
    expect(lessonPlanGenerationPrompt.prompt).toContain('concrete learner actions')
    expect(lessonPlanGenerationPrompt.prompt).toContain('never invent an ID')
    expect(lessonPlanGenerationPrompt.prompt).toContain('Required contract')
    expect(lessonPlanGenerationPrompt.prompt).toContain('Lesson design guidance')
    expect(lessonPlanGenerationPrompt.prompt).toContain(
      'An exact activity-duration total is not a quality requirement',
    )
    expect(lessonPlanGenerationPrompt.prompt).toContain('Do not improvise hazardous experiments')
    expect(renderLessonPlanGenerationPrompt()).toContain(
      JSON.stringify(lessonPlanGenerationOutputSchema(), null, 2),
    )
    expect(lessonPlanGenerationOutputSchema()).toEqual(
      expect.objectContaining({ properties: expect.any(Object) }),
    )
    expect(
      (lessonPlanGenerationOutputSchema().properties as Record<string, unknown>).title,
    ).toEqual(
      (z.toJSONSchema(LessonPlanContentSchema) as { properties: Record<string, unknown> })
        .properties.title,
    )
  })

  it('renders the review contract from shared schema and keeps rubric guidance', () => {
    expect(lessonPlanRubricPromptVersion).toBe('lesson-plan-rubric-v5')
    for (const dimension of [
      'outcome_alignment',
      'objective_measurability',
      'activity_alignment',
      'assessment_quality',
      'pacing_feasibility',
      'source_support',
    ]) {
      expect(renderLessonPlanRubricPrompt()).toContain(`${dimension}: 1`)
    }
    expect(renderLessonPlanRubricPrompt()).toContain(
      'same field or source may support more than one dimension',
    )
    expect(renderLessonPlanRubricPrompt()).toContain(
      JSON.stringify(lessonPlanRubricOutputSchema(), null, 2),
    )
    expect(lessonPlanRubricOutputSchema()).toEqual(
      z.toJSONSchema(LessonPlanRubricReviewOutputSchema),
    )
    expect(lessonPlanRubricPrompt.prompt).toContain('{{{output_schema}}}')
    expect(lessonPlanRubricPrompt.prompt).toContain(
      'citation presence alone does not establish support',
    )
    expect(renderLessonPlanRubricPrompt()).toContain(
      'an activity-duration sum mismatch alone must not lower the score',
    )
    expect(lessonPlanRubricPrompt.prompt).toContain(
      "present in both the reviewed plan's sources and the supplied evidence",
    )
  })
})
