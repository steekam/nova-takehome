import { z } from 'zod'

export const LessonPlanActivitySchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    durationMinutes: z.number().int().positive(),
  })
  .strict()

export const LessonPlanSourceSchema = z
  .object({
    documentId: z.string().uuid(),
    chunkId: z.string().uuid(),
  })
  .strict()

export const LessonPlanContentSchema = z
  .object({
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
  })
  .strict()

export const LessonPlanRubricDimensionKeySchema = z.enum([
  'outcome_alignment',
  'objective_measurability',
  'activity_alignment',
  'assessment_quality',
  'pacing_feasibility',
  'source_support',
])
export const LessonPlanRubricDimensionKeys = LessonPlanRubricDimensionKeySchema.options
export const LessonPlanFieldSchema = z.enum(
  Object.keys(LessonPlanContentSchema.shape) as [string, ...string[]],
)

export const LessonPlanStatusSchema = z.enum(['draft', 'submitted', 'returned', 'published'])
export const LessonPlanActionSchema = z.enum(['edit', 'submit', 'returned', 'published'])

export const GenerateLessonPlanRequestSchema = z
  .object({
    targetRevisionId: z.string().uuid(),
    durationMinutes: z.number().int().positive().max(240),
  })
  .strict()

export const EditLessonPlanRequestSchema = z
  .object({
    content: LessonPlanContentSchema,
  })
  .strict()

export const ReviewLessonPlanRequestSchema = z
  .object({
    decision: z.enum(['returned', 'published']),
    comment: z.string().max(2000).optional(),
  })
  .strict()

export const LessonPlanQaCheckSchema = z
  .object({
    code: z.string(),
    status: z.enum(['passed', 'warning', 'failed']),
    message: z.string(),
  })
  .strict()

export const LessonPlanQaSchema = z
  .object({
    passed: z.boolean(),
    checks: z.array(LessonPlanQaCheckSchema),
  })
  .strict()

export const LessonPlanRubricDimensionSchema = z
  .object({
    key: LessonPlanRubricDimensionKeySchema,
    score: z.number().int().min(1).max(4),
    rationale: z.string().min(1),
    evidence: z.array(
      z
        .object({ planPath: LessonPlanFieldSchema, sourceChunkIds: z.array(z.string().uuid()) })
        .strict(),
    ),
    suggestions: z.array(z.string()),
  })
  .strict()

export const LessonPlanRubricReviewOutputSchema = z
  .object({
    summary: z.string(),
    dimensions: z
      .array(LessonPlanRubricDimensionSchema)
      .length(LessonPlanRubricDimensionKeys.length),
  })
  .strict()

export const LessonPlanRubricQaSchema = z
  .object({
    id: z.string().uuid(),
    lessonPlanId: z.string().uuid(),
    lessonPlanVersionId: z.string().uuid(),
    status: z.enum(['completed', 'unavailable', 'invalid_output']),
    rubricVersion: z.string(),
    promptVersion: z.string(),
    reviewerModel: z.string(),
    summary: z.string(),
    dimensions: z.array(LessonPlanRubricDimensionSchema),
    traceId: z.string().optional(),
    createdAt: z.string().datetime(),
  })
  .strict()

export const ValidateLessonPlanRequestSchema = z.object({ versionId: z.string().uuid() }).strict()
export const LessonPlanRubricQaResponseSchema = z
  .object({ validation: LessonPlanRubricQaSchema })
  .strict()

export const LessonPlanVersionDtoSchema = z
  .object({
    version: z.number().int().positive(),
    content: LessonPlanContentSchema,
    createdBy: z.string().uuid(),
    createdAt: z.string().datetime(),
  })
  .strict()

export type LessonPlanContent = z.infer<typeof LessonPlanContentSchema>
export type LessonPlanSource = z.infer<typeof LessonPlanSourceSchema>
export type LessonPlanStatus = z.infer<typeof LessonPlanStatusSchema>
export type LessonPlanAction = z.infer<typeof LessonPlanActionSchema>
export type GenerateLessonPlanRequest = z.infer<typeof GenerateLessonPlanRequestSchema>
export type EditLessonPlanRequest = z.infer<typeof EditLessonPlanRequestSchema>
export type ReviewLessonPlanRequest = z.infer<typeof ReviewLessonPlanRequestSchema>
export type LessonPlanQa = z.infer<typeof LessonPlanQaSchema>
export type LessonPlanRubricQa = z.infer<typeof LessonPlanRubricQaSchema>

export function hasValidReturnComment(comment: string): boolean {
  return comment.replace(/\s/g, '').length >= 8
}

export const LessonPlanAvailableActionsSchema = z
  .object({
    edit: z.boolean(),
    submit: z.boolean(),
    delete: z.boolean(),
    returnForRevision: z.boolean(),
    publish: z.boolean(),
    validate: z.boolean(),
  })
  .strict()
export type LessonPlanAvailableActions = z.infer<typeof LessonPlanAvailableActionsSchema>

export const LessonPlanViewerSchema = z
  .object({
    availableActions: LessonPlanAvailableActionsSchema,
  })
  .strict()
export type LessonPlanViewer = z.infer<typeof LessonPlanViewerSchema>

export const LessonPlanDtoSchema = z
  .object({
    id: z.string().uuid(),
    teacherId: z.string().uuid(),
    status: LessonPlanStatusSchema,
    targetRevisionId: z.string().uuid().nullable(),
    versionId: z.string().uuid(),
    content: LessonPlanContentSchema,
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type LessonPlanDto = z.infer<typeof LessonPlanDtoSchema>

export const LessonPlanCurriculumContextSchema = z
  .object({
    framework: z.string(),
    programme: z.string(),
    grade: z.string(),
    subject: z.string(),
    releaseLabel: z.string(),
    locator: z.string(),
    targetTitle: z.string(),
  })
  .strict()
export type LessonPlanCurriculumContext = z.infer<typeof LessonPlanCurriculumContextSchema>

export const LessonPlanListItemSchema = LessonPlanDtoSchema.extend({
  curriculumContext: LessonPlanCurriculumContextSchema.nullable(),
  viewer: LessonPlanViewerSchema,
}).strict()
export type LessonPlanListItem = z.infer<typeof LessonPlanListItemSchema>

export const LessonPlanReviewDtoSchema = z
  .object({
    id: z.string().uuid(),
    lessonPlanId: z.string().uuid(),
    lessonPlanVersionId: z.string().uuid(),
    curriculumLeadId: z.string().uuid(),
    lessonPlanVersionNumber: z.number().int().positive(),
    decision: z.enum(['returned', 'published']),
    comment: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict()
export type LessonPlanReviewDto = z.infer<typeof LessonPlanReviewDtoSchema>

export const LessonPlanListResponseSchema = z
  .object({
    items: z.array(LessonPlanListItemSchema),
  })
  .strict()

export const LessonPlanResponseSchema = z
  .object({
    plan: LessonPlanDtoSchema,
    viewer: LessonPlanViewerSchema,
    qa: LessonPlanQaSchema,
    rubricQa: LessonPlanRubricQaSchema.optional(),
  })
  .strict()

export const LessonPlanDetailsResponseSchema = z
  .object({
    plan: LessonPlanDtoSchema,
    viewer: LessonPlanViewerSchema,
    reviews: z.array(LessonPlanReviewDtoSchema),
    versions: z.array(LessonPlanVersionDtoSchema),
    qa: LessonPlanQaSchema,
    rubricQa: LessonPlanRubricQaSchema.nullable(),
  })
  .strict()

export const LessonPlanReviewResponseSchema = z
  .object({
    plan: LessonPlanDtoSchema,
    viewer: LessonPlanViewerSchema,
    review: LessonPlanReviewDtoSchema,
  })
  .strict()
