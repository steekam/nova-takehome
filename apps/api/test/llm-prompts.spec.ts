import { lessonPlanGenerationPrompt, lessonPlanGenerationPromptVersion } from '../src/lesson-planning/llm-workflows/generation-prompt'
import { lessonPlanRubricPrompt, lessonPlanRubricPromptVersion } from '../src/lesson-planning/llm-workflows/rubric-prompt'

describe('lesson planning prompts', () => {
  it('versions the teacher-facing generation instructions', () => {
    expect(lessonPlanGenerationPromptVersion).toBe('lesson-plan-generation-v2')
    expect(lessonPlanGenerationPrompt.prompt).toContain('concrete learner actions')
    expect(lessonPlanGenerationPrompt.prompt).toContain('never invent an ID')
  })

  it('anchors each review dimension and permits relevant evidence reuse', () => {
    expect(lessonPlanRubricPromptVersion).toBe('lesson-plan-rubric-v2')
    for (const dimension of ['outcome_alignment', 'objective_measurability', 'activity_alignment', 'assessment_quality', 'pacing_feasibility', 'source_support']) {
      expect(lessonPlanRubricPrompt.prompt).toContain(`${dimension}: 1`)
    }
    expect(lessonPlanRubricPrompt.prompt).toContain('same field or source may support more than one dimension')
    expect(lessonPlanRubricPrompt.prompt).not.toContain('Never repeat evidence')
  })
})
