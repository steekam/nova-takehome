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
export const userRoles = ['teacher', 'curriculum_lead'] as const
export const UserRoleSchema = z.enum(userRoles)

export type LessonPlanContent = z.infer<typeof LessonPlanContentSchema>
export type LessonPlanSource = z.infer<typeof LessonPlanSourceSchema>
export type LessonPlanStatus = z.infer<typeof LessonPlanStatusSchema>
export type LessonPlanAction = z.infer<typeof LessonPlanActionSchema>
export type UserRole = z.infer<typeof UserRoleSchema>

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

export const CurriculumOutcomeDtoSchema = z.object({
  id: z.string().uuid(), designVersionId: z.string().uuid(), offeringId: z.string().uuid(), kind: z.enum(['specific_learning_outcome', 'learning_objective', 'syllabus_content_point']),
  title: z.string(), subject: z.string(), grade: z.string(), programme: z.string(), framework: z.string(), editionLabel: z.string(), locator: z.string(), content: z.string(),
  sourceCount: z.number().int().nonnegative(), generationReady: z.boolean(),
}).strict()
export type CurriculumOutcomeDto = z.infer<typeof CurriculumOutcomeDtoSchema>

export const CurriculumSourceDtoSchema = z.object({
  linkId: z.string().uuid().nullable(), documentId: z.string().uuid(), resourceRevisionId: z.string().uuid(), revisionNumber: z.number().int().positive(), chunkId: z.string().uuid(), resourceType: z.enum(['curriculum_design', 'scheme_of_work', 'assessment_item', 'teaching_note', 'lead_guidance', 'exemplar']),
  title: z.string(), subject: z.string(), grade: z.string(), content: z.string(), authority: z.enum(['official', 'school', 'internal', 'synthetic']),
  editionLabel: z.string().nullable(), sourceUrl: z.string().nullable(), locator: z.string().nullable(), synthetic: z.boolean(),
  role: z.enum(['defines_target', 'teaching_support', 'assessment_support', 'guidance', 'exemplar']), status: z.enum(['draft', 'published', 'retired']),
}).strict()
export type CurriculumSourceDto = z.infer<typeof CurriculumSourceDtoSchema>

export const CurriculumLibraryTargetDtoSchema = z.object({
  id: z.string().uuid(), designVersionId: z.string().uuid(), offeringId: z.string().uuid(),
  framework: z.string(), programme: z.string(), level: z.string(), subject: z.string(), editionLabel: z.string(), origin: z.enum(['official_import', 'demo_fixture']),
  kind: z.enum(['specific_learning_outcome', 'learning_objective', 'syllabus_content_point']), title: z.string(), statement: z.string(), locator: z.string(),
  path: z.array(z.string()), sourceCount: z.number().int().nonnegative(), generationReady: z.boolean(),
  sources: z.array(CurriculumSourceDtoSchema),
}).strict()
export type CurriculumLibraryTargetDto = z.infer<typeof CurriculumLibraryTargetDtoSchema>

export const CurriculumLibraryOfferingDtoSchema = z.object({
  id: z.string().uuid(), framework: z.string(), programme: z.string(), level: z.string(), subject: z.string(), externalCode: z.string().nullable(),
  designs: z.array(z.object({
    id: z.string().uuid(), editionLabel: z.string(), revisionNumber: z.number().int().positive(), origin: z.enum(['official_import', 'demo_fixture']),
    status: z.enum(['draft', 'published', 'retired']), targets: z.array(CurriculumLibraryTargetDtoSchema),
  }).strict()),
}).strict()
export type CurriculumLibraryOfferingDto = z.infer<typeof CurriculumLibraryOfferingDtoSchema>

export const CurriculumLibrarySourceInputSchema = z.object({
  resourceId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  resourceType: z.enum(['curriculum_design', 'scheme_of_work', 'assessment_item', 'teaching_note', 'lead_guidance', 'exemplar']),
  authority: z.enum(['official', 'school', 'internal', 'synthetic']),
  editionLabel: z.string().trim().max(120).optional(), sourceUrl: z.string().url().optional(),
  locator: z.string().trim().max(200).optional(), content: z.string().trim().min(20).max(20000),
  role: z.enum(['defines_target', 'teaching_support', 'assessment_support', 'guidance', 'exemplar']),
}).strict().superRefine((source, context) => {
  if (source.authority === 'official' && !source.sourceUrl) {
    context.addIssue({ code: 'custom', path: ['sourceUrl'], message: 'Official sources need a URL for provenance.' })
  }
  if (source.role === 'defines_target') {
    if (source.resourceType !== 'curriculum_design' || source.authority !== 'official') {
      context.addIssue({ code: 'custom', path: ['role'], message: 'A target-defining source must be an official curriculum design excerpt.' })
    }
    if (!source.editionLabel) context.addIssue({ code: 'custom', path: ['editionLabel'], message: 'A target-defining source needs its curriculum edition.' })
    if (!source.locator) context.addIssue({ code: 'custom', path: ['locator'], message: 'A target-defining source needs its source locator.' })
  }
})
export type CurriculumLibrarySourceInput = z.infer<typeof CurriculumLibrarySourceInputSchema>

export const LessonPlanReviewDtoSchema = z.object({
  id: z.string().uuid(), lessonPlanId: z.string().uuid(), lessonPlanVersionId: z.string().uuid(), curriculumLeadId: z.string().uuid(),
  lessonPlanVersionNumber: z.number().int().positive(), decision: z.enum(['returned', 'published']), comment: z.string().nullable(), createdAt: z.string().datetime(),
}).strict()
export type LessonPlanReviewDto = z.infer<typeof LessonPlanReviewDtoSchema>

export interface ApiPrincipal {
  subject: string
  roles: UserRole[]
  permissions: string[]
}

const lessonPlanTransitions: Record<LessonPlanStatus, Partial<Record<LessonPlanAction, LessonPlanStatus>>> = {
  draft: { edit: 'draft', submit: 'submitted' },
  submitted: { returned: 'returned', published: 'published' },
  returned: { edit: 'draft' },
  published: {},
}

export function transitionLessonPlan(status: LessonPlanStatus, action: LessonPlanAction):
  | { ok: true; status: LessonPlanStatus }
  | { ok: false; code: 'PLAN_TRANSITION_INVALID'; message: string } {
  const next = lessonPlanTransitions[status][action]
  if (next) return { ok: true, status: next }
  if (status === 'published') return { ok: false, code: 'PLAN_TRANSITION_INVALID', message: 'Published lesson plans are read-only.' }
  if (status === 'submitted') return { ok: false, code: 'PLAN_TRANSITION_INVALID', message: action === 'edit'
    ? 'This lesson plan is under review. Wait for the curriculum lead before editing.'
    : 'This lesson plan is already awaiting review.' }
  if (status === 'returned') return { ok: false, code: 'PLAN_TRANSITION_INVALID', message: 'Returned lesson plans must be edited before they can be resubmitted.' }
  return { ok: false, code: 'PLAN_TRANSITION_INVALID', message: 'Only a submitted lesson plan can be reviewed.' }
}
