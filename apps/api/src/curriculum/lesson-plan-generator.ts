import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import { LessonPlanContentSchema, type CurriculumOutcomeDto, type LessonPlanContent } from '@nova/shared'
import { LESSON_PLAN_PROVIDER, type LessonPlanProvider } from './llm-provider'

@Injectable()
export class LessonPlanGenerator {
  constructor(@Inject(LESSON_PLAN_PROVIDER) private readonly provider: LessonPlanProvider) {}

  async generate(outcome: CurriculumOutcomeDto, sources: CurriculumOutcomeDto[], durationMinutes: number): Promise<LessonPlanContent> {
    return trace.getTracer('nova-api-curriculum').startActiveSpan('curriculum.lesson_plan.generate', async (span) => {
      span.setAttribute('curriculum.target_id', outcome.targetId)
      span.setAttribute('curriculum.source_count', sources.length)
      span.setAttribute('lesson.duration_minutes', durationMinutes)
      try {
        const system = 'Return exactly one JSON object with no markdown and no extra keys. Shape: {"title":"string","subject":"string","grade":"string","learningOutcome":"string","durationMinutes":integer,"objectives":["string"],"materials":["string"],"starter":"string","activities":[{"title":"string","description":"string","durationMinutes":integer}],"checkForUnderstanding":"string","sources":[{"documentId":"UUID","chunkId":"UUID"}]}. Use positive integer activity durations that sum exactly to durationMinutes. Copy subject, grade, learningOutcome, and durationMinutes exactly from the selected outcome and request. Ground every section in the supplied curriculum material. Cite the selected outcome. Each source documentId must equal a supplied source id and chunkId its targetId; never invent IDs.'
        const request = JSON.stringify({ outcome, sources, durationMinutes })
        let repair: string | undefined
        for (let attempt = 0; attempt < 2; attempt += 1) {
          span.setAttribute('generation.attempt', attempt + 1)
          const raw = await this.provider.complete({
            system,
            user: `${request}${repair ? `\n\nRegenerate the plan. The prior response failed these checks: ${repair}. Return a corrected JSON object.` : ''}`,
          })
          const parsedJson = parseJson(raw)
          const issues = generatedPlanIssues(parsedJson, outcome, sources, durationMinutes)
          if (issues.length === 0) {
            span.setAttribute('generation.validation', 'passed')
            span.setStatus({ code: SpanStatusCode.OK })
            return LessonPlanContentSchema.parse(parsedJson)
          }
          repair = issues.join('; ').slice(0, 700)
          span.setAttribute('generation.validation', 'failed')
          span.setAttribute('generation.failed_check_count', issues.length)
        }
        throw new ServiceUnavailableException({ code: 'LLM_INVALID_RESPONSE', message: `The model could not produce a valid lesson plan after one correction. Check: ${repair}. No draft was saved; try again or check the provider configuration.` })
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error(String(error)))
        span.setStatus({ code: SpanStatusCode.ERROR })
        throw error
      } finally {
        span.end()
      }
    })
  }
}

export function validateGeneratedPlan(plan: LessonPlanContent, outcome: CurriculumOutcomeDto, sources: CurriculumOutcomeDto[], durationMinutes: number): void {
  const issues = generatedPlanIssues(plan, outcome, sources, durationMinutes)
  if (issues.length > 0) throw new Error(`Generated plan failed checks: ${issues.join('; ')}`)
}

function generatedPlanIssues(plan: unknown, outcome: CurriculumOutcomeDto, sources: CurriculumOutcomeDto[], durationMinutes: number): string[] {
  const parsed = LessonPlanContentSchema.safeParse(plan)
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join('.') || 'content'}: ${issue.message}`)
  const content = parsed.data
  const cited = new Set(content.sources.map((source) => `${source.documentId}:${source.chunkId}`))
  const eligible = new Set(sources.map((source) => `${source.id}:${source.targetId}`))
  const selectedOutcome = `${outcome.id}:${outcome.targetId}`
  return [
    ...(content.durationMinutes !== durationMinutes ? ['durationMinutes must match the requested lesson duration'] : []),
    ...(content.subject !== outcome.subject ? ['subject must match the selected outcome'] : []),
    ...(content.grade !== outcome.grade ? ['grade must match the selected outcome'] : []),
    ...(content.learningOutcome !== outcome.content ? ['learningOutcome must match the selected outcome exactly'] : []),
    ...(content.activities.reduce((sum, activity) => sum + activity.durationMinutes, 0) !== durationMinutes ? ['activity durations must sum to durationMinutes'] : []),
    ...(cited.size !== content.sources.length ? ['source references must be unique'] : []),
    ...(!cited.has(selectedOutcome) ? ['sources must cite the selected outcome'] : []),
    ...([...cited].some((source) => !eligible.has(source)) ? ['sources must use only supplied curriculum source IDs'] : []),
  ]
}

function parseJson(content: string | undefined): unknown {
  if (!content) return undefined
  try { return JSON.parse(content) as unknown } catch { return undefined }
}
