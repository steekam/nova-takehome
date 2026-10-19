import { Injectable } from '@nestjs/common'
import type { LessonPlanCompletionRequest, LessonPlanProvider } from './llm-provider'

@Injectable()
export class MockLessonPlanProvider implements LessonPlanProvider {
  async complete(request: LessonPlanCompletionRequest): Promise<string> {
    const input = JSON.parse(request.user) as {
      outcome: { id: string; targetId: string; title: string; subject: string; grade: string; content: string }
      sources: Array<{ id: string; targetId: string }>
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
    return JSON.stringify({
      title: `Lesson: ${outcome.title}`, subject: outcome.subject, grade: outcome.grade,
      learningOutcome: outcome.content, durationMinutes,
      objectives: [`Demonstrate understanding of ${outcome.title}`],
      materials: ['Board', 'Learner notebooks'], starter: `Discuss: ${outcome.content}`,
      activities,
      checkForUnderstanding: `Ask learners to explain how their work meets: ${outcome.content}`,
      sources: sources.map((source) => ({ documentId: source.id, chunkId: source.targetId })),
    })
  }
}
