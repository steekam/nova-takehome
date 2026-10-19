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

export interface ApiPrincipal {
  subject: string
  roles: UserRole[]
  permissions: string[]
}
