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
export const userRoles = ['teacher', 'curriculum_lead'] as const
export const UserRoleSchema = z.enum(userRoles)

export type LessonPlanContent = z.infer<typeof LessonPlanContentSchema>
export type LessonPlanSource = z.infer<typeof LessonPlanSourceSchema>
export type LessonPlanStatus = z.infer<typeof LessonPlanStatusSchema>
export type UserRole = z.infer<typeof UserRoleSchema>

export const LessonPlanDtoSchema = z.object({
  id: z.string().uuid(), teacherId: z.string().uuid(), status: LessonPlanStatusSchema,
  content: LessonPlanContentSchema, version: z.number().int().positive(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict()
export type LessonPlanDto = z.infer<typeof LessonPlanDtoSchema>

export const CurriculumOutcomeDtoSchema = z.object({
  id: z.string().uuid(), targetId: z.string().uuid(), title: z.string(), subject: z.string(), grade: z.string(), content: z.string(),
}).strict()
export type CurriculumOutcomeDto = z.infer<typeof CurriculumOutcomeDtoSchema>

export const CurriculumSourceDtoSchema = z.object({
  documentId: z.string().uuid(), chunkId: z.string().uuid(), documentType: z.enum(['scheme_of_work', 'learning_outcome', 'assessment_item']),
  title: z.string(), subject: z.string(), grade: z.string(), content: z.string(),
}).strict()
export type CurriculumSourceDto = z.infer<typeof CurriculumSourceDtoSchema>

export const LessonPlanReviewDtoSchema = z.object({
  id: z.string().uuid(), lessonPlanId: z.string().uuid(), curriculumLeadId: z.string().uuid(),
  decision: z.enum(['returned', 'published']), comment: z.string().nullable(), createdAt: z.string().datetime(),
}).strict()
export type LessonPlanReviewDto = z.infer<typeof LessonPlanReviewDtoSchema>

export interface ApiPrincipal {
  subject: string
  roles: UserRole[]
  permissions: string[]
}
