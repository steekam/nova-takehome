import { Injectable } from '@nestjs/common'
import type { LessonPlanCompletionRequest, LessonPlanProvider } from './llm-provider'
import { recordProviderAttempt } from './generation-telemetry'

@Injectable()
export class MockLessonPlanProvider implements LessonPlanProvider {
  async complete(request: LessonPlanCompletionRequest, _modelOverride?: string) {
    const startedAt = Date.now()
    if (request.system.includes('six requested dimensions')) {
      const input = JSON.parse(request.user) as { lessonPlan: { sources: Array<{ chunkId: string }> } }
      const keys = ['outcome_alignment', 'objective_measurability', 'activity_alignment', 'assessment_quality', 'pacing_feasibility', 'source_support']
      const content = JSON.stringify({
        summary: 'Mock rubric review: the plan has a usable structure. Replace mock mode with a live reviewer for evidence-based quality guidance.',
        dimensions: keys.map((key) => ({ key, score: 3, rationale: 'Mock reviewer placeholder; no model assessment was performed.', evidence: [{ planPath: 'learningOutcome', sourceChunkIds: input.lessonPlan.sources.map((source) => source.chunkId) }], suggestions: ['Run a live rubric review for specific improvement guidance.'] })),
      })
      const durationMs = Date.now() - startedAt
      recordProviderAttempt({ provider: 'mock', outcome: 'success', durationMs })
      return { content, provider: 'mock', model: 'deterministic-mock', durationMs, providerAttempts: 1 }
    }
    const input = JSON.parse(request.user) as {
      outcome: { id: string; title: string; subject: string; grade: string; content: string }
      sources: Array<{ documentId: string; chunkId: string; role: string }>
      durationMinutes: number
    }
    const { outcome, sources, durationMinutes } = input
    const first = Math.floor(durationMinutes / 2)
    const activities = durationMinutes === 1
      ? [{ title: 'Guided practice', description: `Learners practise the stated outcome: ${outcome.content}`, durationMinutes: 1 }]
      : [
        { title: 'Guided practice', description: `Learners practise the stated outcome: ${outcome.content}`, durationMinutes: first },
        { title: 'Independent practice', description: `Learners demonstrate: ${outcome.content}`, durationMinutes: durationMinutes - first },
      ]
    const content = JSON.stringify({
      title: `Lesson: ${outcome.title}`, subject: outcome.subject, grade: outcome.grade,
      learningOutcome: outcome.content, durationMinutes,
      objectives: [`Demonstrate understanding of ${outcome.title}`],
      materials: ['Board', 'Learner notebooks'], starter: `Discuss: ${outcome.content}`,
      activities,
      checkForUnderstanding: `Ask learners to explain how their work meets: ${outcome.content}`,
      sources: sources.map((source) => ({ documentId: source.documentId, chunkId: source.chunkId })),
    })
    const durationMs = Date.now() - startedAt
    recordProviderAttempt({ provider: 'mock', outcome: 'success', durationMs })
    return { content, provider: 'mock', model: 'deterministic-mock', durationMs, providerAttempts: 1 }
  }
}
