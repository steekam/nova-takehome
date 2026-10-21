import { z } from 'zod'

export const CurriculumOutcomeDtoSchema = z
  .object({
    id: z.string().uuid(),
    designVersionId: z.string().uuid(),
    offeringId: z.string().uuid(),
    kind: z.enum(['specific_learning_outcome', 'learning_objective', 'syllabus_content_point']),
    title: z.string(),
    subject: z.string(),
    grade: z.string(),
    programme: z.string(),
    framework: z.string(),
    editionLabel: z.string(),
    locator: z.string(),
    content: z.string(),
    sourceCount: z.number().int().nonnegative(),
    generationReady: z.boolean(),
  })
  .strict()
export type CurriculumOutcomeDto = z.infer<typeof CurriculumOutcomeDtoSchema>

export const CurriculumSourceDtoSchema = z
  .object({
    linkId: z.string().uuid().nullable(),
    documentId: z.string().uuid(),
    resourceRevisionId: z.string().uuid(),
    revisionNumber: z.number().int().positive(),
    chunkId: z.string().uuid(),
    resourceType: z.enum([
      'curriculum_design',
      'scheme_of_work',
      'assessment_item',
      'teaching_note',
      'lead_guidance',
      'exemplar',
    ]),
    title: z.string(),
    subject: z.string(),
    grade: z.string(),
    content: z.string(),
    authority: z.enum(['official', 'school', 'internal', 'synthetic']),
    editionLabel: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    locator: z.string().nullable(),
    synthetic: z.boolean(),
    role: z.enum([
      'defines_target',
      'teaching_support',
      'assessment_support',
      'guidance',
      'exemplar',
    ]),
    status: z.enum(['draft', 'published', 'retired']),
  })
  .strict()
export type CurriculumSourceDto = z.infer<typeof CurriculumSourceDtoSchema>

export const CurriculumLibraryTargetDtoSchema = z
  .object({
    id: z.string().uuid(),
    designVersionId: z.string().uuid(),
    offeringId: z.string().uuid(),
    framework: z.string(),
    programme: z.string(),
    level: z.string(),
    subject: z.string(),
    editionLabel: z.string(),
    origin: z.enum(['official_import', 'demo_fixture']),
    kind: z.enum(['specific_learning_outcome', 'learning_objective', 'syllabus_content_point']),
    title: z.string(),
    statement: z.string(),
    locator: z.string(),
    path: z.array(z.string()),
    sourceCount: z.number().int().nonnegative(),
    generationReady: z.boolean(),
    sources: z.array(CurriculumSourceDtoSchema),
  })
  .strict()
export type CurriculumLibraryTargetDto = z.infer<typeof CurriculumLibraryTargetDtoSchema>

export const CurriculumLibraryOfferingDtoSchema = z
  .object({
    id: z.string().uuid(),
    framework: z.string(),
    programme: z.string(),
    level: z.string(),
    subject: z.string(),
    externalCode: z.string().nullable(),
    designs: z.array(
      z
        .object({
          id: z.string().uuid(),
          editionLabel: z.string(),
          revisionNumber: z.number().int().positive(),
          origin: z.enum(['official_import', 'demo_fixture']),
          status: z.enum(['draft', 'published', 'retired']),
          targets: z.array(CurriculumLibraryTargetDtoSchema),
        })
        .strict(),
    ),
  })
  .strict()
export type CurriculumLibraryOfferingDto = z.infer<typeof CurriculumLibraryOfferingDtoSchema>

export const CurriculumLibraryResponseSchema = z
  .object({ offerings: z.array(CurriculumLibraryOfferingDtoSchema) })
  .strict()
export const CurriculumLibraryTargetResponseSchema = CurriculumLibraryTargetDtoSchema
export const CurriculumSourcesResponseSchema = z
  .object({ items: z.array(CurriculumSourceDtoSchema) })
  .strict()
export const CurriculumOutcomesResponseSchema = z
  .object({ items: z.array(CurriculumOutcomeDtoSchema) })
  .strict()
export const CurriculumSourceLinkResultSchema = z
  .object({
    linkId: z.string().uuid(),
    targetRevisionId: z.string().uuid(),
    status: z.enum(['draft', 'published']),
  })
  .strict()

export const CurriculumLibrarySourceInputSchema = z
  .object({
    resourceId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200),
    resourceType: z.enum([
      'curriculum_design',
      'scheme_of_work',
      'assessment_item',
      'teaching_note',
      'lead_guidance',
      'exemplar',
    ]),
    authority: z.enum(['official', 'school', 'internal', 'synthetic']),
    editionLabel: z.string().trim().max(120).optional(),
    sourceUrl: z.string().url().optional(),
    locator: z.string().trim().max(200).optional(),
    content: z.string().trim().min(20).max(20000),
    role: z.enum([
      'defines_target',
      'teaching_support',
      'assessment_support',
      'guidance',
      'exemplar',
    ]),
  })
  .strict()
  .superRefine((source, context) => {
    if (source.authority === 'official' && !source.sourceUrl) {
      context.addIssue({
        code: 'custom',
        path: ['sourceUrl'],
        message: 'Official sources need a URL for provenance.',
      })
    }
    if (source.role === 'defines_target') {
      if (source.resourceType !== 'curriculum_design' || source.authority !== 'official') {
        context.addIssue({
          code: 'custom',
          path: ['role'],
          message: 'A target-defining source must be an official curriculum design excerpt.',
        })
      }
      if (!source.editionLabel)
        context.addIssue({
          code: 'custom',
          path: ['editionLabel'],
          message: 'A target-defining source needs its curriculum edition.',
        })
      if (!source.locator)
        context.addIssue({
          code: 'custom',
          path: ['locator'],
          message: 'A target-defining source needs its source locator.',
        })
    }
  })
export type CurriculumLibrarySourceInput = z.infer<typeof CurriculumLibrarySourceInputSchema>
