import { Injectable } from '@nestjs/common'
import type { LlmMockScenario } from '@nova/shared'
import type { LessonPlanCompletionRequest, LessonPlanProvider } from './llm-provider'
import { LessonPlanProviderFailure } from './llm-provider'
import { recordProviderAttempt } from './generation-telemetry'

@Injectable()
export class MockLessonPlanProvider implements LessonPlanProvider {
  async complete(
    request: LessonPlanCompletionRequest,
    _modelOverride?: string,
    scenario: LlmMockScenario = 'happy_path',
  ) {
    const startedAt = Date.now()
    if (scenario === 'connection_failure') {
      const durationMs = Date.now() - startedAt
      recordProviderAttempt({
        provider: 'mock',
        outcome: 'failure',
        durationMs,
        errorCode: 'LLM_PROVIDER_UNAVAILABLE',
      })
      throw new LessonPlanProviderFailure('mock', 'deterministic-mock', 1, {
        code: 'LLM_PROVIDER_UNAVAILABLE',
        message:
          'The mock provider is simulating an unavailable connection. No draft was saved; select another mock scenario or try again.',
      })
    }
    const inputText = requestPayload(request.user)
    if (request.system.includes('each rubric dimension exactly once')) {
      const input = JSON.parse(inputText) as {
        lessonPlan: { sources: Array<{ chunkId: string }> }
      }
      const keys = [
        'outcome_alignment',
        'objective_measurability',
        'activity_alignment',
        'assessment_quality',
        'pacing_feasibility',
        'source_support',
      ]
      const content = JSON.stringify({
        summary:
          'Mock rubric review: the plan has a usable structure. Replace mock mode with a live reviewer for evidence-based quality guidance.',
        dimensions: keys.map((key) => ({
          key,
          score: 3,
          rationale: 'Mock reviewer placeholder; no model assessment was performed.',
          evidence: [
            {
              planPath: 'learningOutcome',
              sourceChunkIds: input.lessonPlan.sources.map((source) => source.chunkId),
            },
          ],
          suggestions: ['Run a live rubric review for specific improvement guidance.'],
        })),
      })
      const durationMs = Date.now() - startedAt
      recordProviderAttempt({ provider: 'mock', outcome: 'success', durationMs })
      return {
        content,
        provider: 'mock',
        model: 'deterministic-mock',
        durationMs,
        providerAttempts: 1,
      }
    }
    const input = JSON.parse(inputText) as {
      outcome: { id: string; title: string; subject: string; grade: string; content: string }
      sources: Array<{ documentId: string; chunkId: string; role: string }>
      durationMinutes: number
    }
    const { outcome, sources, durationMinutes } = input
    const first = Math.floor(durationMinutes / 2)
    const activities =
      durationMinutes === 1
        ? [
            {
              title: 'Guided practice',
              description: `Learners practise the stated outcome: ${outcome.content}`,
              durationMinutes: 1,
            },
          ]
        : [
            {
              title: 'Guided practice',
              description: `Learners practise the stated outcome: ${outcome.content}`,
              durationMinutes: first,
            },
            {
              title: 'Independent practice',
              description: `Learners demonstrate: ${outcome.content}`,
              durationMinutes: durationMinutes - first,
            },
          ]
    const generated = {
      title: `Lesson: ${outcome.title}`,
      subject: outcome.subject,
      grade: outcome.grade,
      learningOutcome: outcome.content,
      durationMinutes,
      objectives: [`Demonstrate understanding of ${outcome.title}`],
      materials: ['Board', 'Learner notebooks'],
      starter: `Discuss: ${outcome.content}`,
      activities,
      checkForUnderstanding: `Ask learners to explain how their work meets: ${outcome.content}`,
      sources: sources.map((source) => ({
        documentId: source.documentId,
        chunkId: source.chunkId,
      })),
    }
    const output = JSON.stringify({
      ...generated,
      ...(scenario === 'invalid_output' ? { durationMinutes: durationMinutes + 1 } : {}),
    })
    const durationMs = Date.now() - startedAt
    recordProviderAttempt({ provider: 'mock', outcome: 'success', durationMs })
    return {
      content: output,
      provider: 'mock',
      model: 'deterministic-mock',
      durationMs,
      providerAttempts: 1,
    }
  }
}

function requestPayload(user: string): string {
  const correctionStart = user.indexOf('\n\nValidation issues:')
  return correctionStart === -1 ? user : user.slice(0, correctionStart)
}
