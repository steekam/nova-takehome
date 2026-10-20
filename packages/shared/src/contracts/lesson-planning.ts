import { z } from 'zod'

export const LessonPlanActivitySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  durationMinutes: z.number().int().positive(),
})

export const LessonPlanSourceSchema = z.object({
  documentId: z.string().uuid(),
  chunkId: z.string().uuid(),
})

export const LessonPlanContentSchema = z.object({
  title: z.string().min(1),
  subject: z.string().min(1),
  grade: z.string().min(1),
  learningOutcome: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  objectives: z.array(z.string().min(1)).min(1),
  materials: z.array(z.string().min(1)),
  starter: z.string().min(1),
  activities: z.array(LessonPlanActivitySchema).min(1),
  checkForUnderstanding: z.string().min(1),
  sources: z.array(LessonPlanSourceSchema).min(1),
}).strict()

export const LessonPlanStatusSchema = z.enum(['draft', 'submitted', 'returned', 'published'])
export const LessonPlanActionSchema = z.enum(['edit', 'submit', 'returned', 'published'])

export const GenerateLessonPlanRequestSchema = z.object({
  targetRevisionId: z.string().uuid(),
  durationMinutes: z.number().int().positive().max(240),
}).strict()

export const EditLessonPlanRequestSchema = z.object({
  content: LessonPlanContentSchema,
}).strict()

export const ReviewLessonPlanRequestSchema = z.object({
  decision: z.enum(['returned', 'published']),
  comment: z.string().max(2000).optional(),
}).strict()

export const RuntimeLlmModeRequestSchema = z.object({ mode: z.enum(['mock', 'live']) }).strict()

export const LessonPlanQaCheckSchema = z.object({
  code: z.string(),
  passed: z.boolean(),
  message: z.string(),
}).strict()

export const LessonPlanQaSchema = z.object({
  passed: z.boolean(),
  checks: z.array(LessonPlanQaCheckSchema),
}).strict()

export const LessonPlanVersionDtoSchema = z.object({
  version: z.number().int().positive(),
  content: LessonPlanContentSchema,
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
}).strict()

export type LessonPlanContent = z.infer<typeof LessonPlanContentSchema>
export type LessonPlanSource = z.infer<typeof LessonPlanSourceSchema>
export type LessonPlanStatus = z.infer<typeof LessonPlanStatusSchema>
export type LessonPlanAction = z.infer<typeof LessonPlanActionSchema>
export type GenerateLessonPlanRequest = z.infer<typeof GenerateLessonPlanRequestSchema>
export type EditLessonPlanRequest = z.infer<typeof EditLessonPlanRequestSchema>
export type ReviewLessonPlanRequest = z.infer<typeof ReviewLessonPlanRequestSchema>
export type LessonPlanQa = z.infer<typeof LessonPlanQaSchema>

export function hasValidReturnComment(comment: string): boolean {
  return comment.replace(/\s/g, '').length >= 8
}

export const LessonPlanDtoSchema = z.object({
  id: z.string().uuid(), teacherId: z.string().uuid(), status: LessonPlanStatusSchema,
  targetRevisionId: z.string().uuid().nullable(), versionId: z.string().uuid(),
  content: LessonPlanContentSchema, version: z.number().int().positive(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict()
export type LessonPlanDto = z.infer<typeof LessonPlanDtoSchema>

export const LessonPlanReviewDtoSchema = z.object({
  id: z.string().uuid(), lessonPlanId: z.string().uuid(), lessonPlanVersionId: z.string().uuid(), curriculumLeadId: z.string().uuid(),
  lessonPlanVersionNumber: z.number().int().positive(), decision: z.enum(['returned', 'published']), comment: z.string().nullable(), createdAt: z.string().datetime(),
}).strict()
export type LessonPlanReviewDto = z.infer<typeof LessonPlanReviewDtoSchema>

export const LessonPlanListResponseSchema = z.object({
  items: z.array(LessonPlanDtoSchema),
}).strict()

export const LessonPlanResponseSchema = z.object({
  plan: LessonPlanDtoSchema,
  qa: LessonPlanQaSchema,
}).strict()

export const LessonPlanDetailsResponseSchema = z.object({
  plan: LessonPlanDtoSchema,
  reviews: z.array(LessonPlanReviewDtoSchema),
  versions: z.array(LessonPlanVersionDtoSchema),
  qa: LessonPlanQaSchema,
}).strict()

export const LessonPlanReviewResponseSchema = z.object({
  plan: LessonPlanDtoSchema,
  review: LessonPlanReviewDtoSchema,
}).strict()

