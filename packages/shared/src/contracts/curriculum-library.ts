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

export const CurriculumLibraryResourceTypeSchema = z.enum([
  'curriculum_design',
  'scheme_of_work',
  'assessment_items',
  'teaching_note',
  'lead_guidance',
  'exemplar',
])
export type CurriculumLibraryResourceType = z.infer<typeof CurriculumLibraryResourceTypeSchema>

export const CurriculumSourceMetadataSchema = z
  .object({
    framework: z.string().trim().min(1).max(120).optional(),
    programme: z.string().trim().min(1).max(120).optional(),
    grade: z.string().trim().min(1).max(80).optional(),
    subject: z.string().trim().min(1).max(120).optional(),
    language: z.string().trim().min(2).max(35).optional(),
    publisher: z.string().trim().min(1).max(200).optional(),
    sourceAuthority: z.string().trim().min(1).max(200).optional(),
    publicationDate: z.string().date().optional(),
    attributes: z
      .record(
        z.string().trim().min(1).max(100),
        z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]),
      )
      .optional(),
  })
  .strict()
export type CurriculumSourceMetadata = z.infer<typeof CurriculumSourceMetadataSchema>

export const CurriculumChunkMetadataSchema = z
  .object({
    kind: z.string().trim().min(1).max(80).optional(),
    headingPath: z.array(z.string().trim().min(1).max(200)).max(16).optional(),
    outcomeCodes: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
    itemId: z.string().trim().min(1).max(100).optional(),
    relatedItemIds: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    instrument: z.string().trim().min(1).max(100).optional(),
    term: z.number().int().positive().optional(),
    week: z.number().int().positive().optional(),
    periodStart: z.number().int().positive().optional(),
    periodEnd: z.number().int().positive().optional(),
    marks: z.number().nonnegative().optional(),
    sourceLineStart: z.number().int().positive().optional(),
    sourceLineEnd: z.number().int().positive().optional(),
    printedPageStart: z.number().int().positive().optional(),
    printedPageEnd: z.number().int().positive().optional(),
    pdfPageStart: z.number().int().positive().optional(),
    pdfPageEnd: z.number().int().positive().optional(),
    attributes: z
      .record(
        z.string().trim().min(1).max(100),
        z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]),
      )
      .optional(),
  })
  .strict()
  .superRefine((metadata, context) => {
    for (const [startKey, endKey] of [
      ['sourceLineStart', 'sourceLineEnd'],
      ['printedPageStart', 'printedPageEnd'],
      ['pdfPageStart', 'pdfPageEnd'],
      ['periodStart', 'periodEnd'],
    ] as const) {
      const start = metadata[startKey]
      const end = metadata[endKey]
      if (start !== undefined && end !== undefined && end < start) {
        context.addIssue({
          code: 'custom',
          path: [endKey],
          message: `${endKey} must be greater than or equal to ${startKey}.`,
        })
      }
    }
  })
export type CurriculumChunkMetadata = z.infer<typeof CurriculumChunkMetadataSchema>

export const CurriculumLibrarySourceChunkInputSchema = z
  .object({
    content: z.string().trim().min(1).max(20000),
    locator: z.string().trim().max(200).optional(),
    metadata: CurriculumChunkMetadataSchema.default({}),
  })
  .strict()
export type CurriculumLibrarySourceChunkInput = z.infer<
  typeof CurriculumLibrarySourceChunkInputSchema
>

export const CurriculumSourceFormatSchema = z.enum([
  'plain_text',
  'markdown',
  'html',
  'docx',
  'pdf',
  'normalized',
])

export const CurriculumSourceDtoSchema = z
  .object({
    linkId: z.string().uuid().nullable(),
    documentId: z.string().uuid(),
    resourceRevisionId: z.string().uuid(),
    revisionNumber: z.number().int().positive(),
    chunkId: z.string().uuid(),
    resourceType: CurriculumLibraryResourceTypeSchema,
    title: z.string(),
    subject: z.string(),
    grade: z.string(),
    content: z.string(),
    authority: z.enum(['official', 'school', 'internal', 'synthetic']),
    editionLabel: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    locator: z.string().nullable(),
    sourceLocator: z.string().nullable(),
    resourceMetadata: CurriculumSourceMetadataSchema,
    metadata: CurriculumChunkMetadataSchema.optional(),
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

export const CurriculumNodeKindSchema = z.enum([
  'strand',
  'sub_strand',
  'topic',
  'subtopic',
  'unit',
  'section',
])
export type CurriculumNodeKind = z.infer<typeof CurriculumNodeKindSchema>

export const CurriculumLevelKindSchema = z.enum(['grade', 'stage', 'year', 'qualification'])
export type CurriculumLevelKind = z.infer<typeof CurriculumLevelKindSchema>

export const CurriculumHierarchyNodeDtoSchema = z
  .object({
    id: z.string().uuid(),
    kind: CurriculumNodeKindSchema,
    code: z.string().nullable(),
    label: z.string(),
    sortOrder: z.number().int(),
  })
  .strict()
export type CurriculumHierarchyNodeDto = z.infer<typeof CurriculumHierarchyNodeDtoSchema>

export const CurriculumDesignNodeDtoSchema = z
  .object({
    id: z.string().uuid(),
    parentNodeId: z.string().uuid().nullable(),
    kind: CurriculumNodeKindSchema,
    code: z.string().nullable(),
    label: z.string(),
    sortOrder: z.number().int(),
  })
  .strict()
export type CurriculumDesignNodeDto = z.infer<typeof CurriculumDesignNodeDtoSchema>

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
    sortOrder: z.number().int(),
    hierarchy: z.array(CurriculumHierarchyNodeDtoSchema),
    sourceCount: z.number().int().nonnegative(),
    generationReady: z.boolean(),
    sources: z.array(CurriculumSourceDtoSchema),
  })
  .strict()
export type CurriculumLibraryTargetDto = z.infer<typeof CurriculumLibraryTargetDtoSchema>

export const CurriculumLibraryOfferingDtoSchema = z
  .object({
    id: z.string().uuid(),
    frameworkId: z.string().uuid(),
    frameworkCode: z.string(),
    framework: z.string(),
    programmeId: z.string().uuid(),
    programmeCode: z.string(),
    programme: z.string(),
    levelId: z.string().uuid().nullable(),
    levelKind: CurriculumLevelKindSchema.nullable(),
    levelCode: z.string().nullable(),
    level: z.string(),
    subjectId: z.string().uuid(),
    subjectCode: z.string(),
    subject: z.string(),
    externalCode: z.string().nullable(),
    designs: z.array(
      z
        .object({
          id: z.string().uuid(),
          editionLabel: z.string(),
          revisionNumber: z.number().int().positive(),
          publishedAt: z.string().datetime().nullable(),
          origin: z.enum(['official_import', 'demo_fixture']),
          status: z.enum(['draft', 'published', 'retired']),
          nodes: z.array(CurriculumDesignNodeDtoSchema),
          targets: z.array(CurriculumLibraryTargetDtoSchema),
        })
        .strict(),
    ),
  })
  .strict()
export type CurriculumLibraryOfferingDto = z.infer<typeof CurriculumLibraryOfferingDtoSchema>

export const CurriculumLibraryDesignSummaryDtoSchema = z
  .object({
    id: z.string().uuid(),
    editionLabel: z.string(),
    revisionNumber: z.number().int().positive(),
    publishedAt: z.string().datetime().nullable(),
    origin: z.enum(['official_import', 'demo_fixture']),
    status: z.enum(['draft', 'published', 'retired']),
    targetCount: z.number().int().nonnegative(),
    generationReadyCount: z.number().int().nonnegative(),
  })
  .strict()
export type CurriculumLibraryDesignSummaryDto = z.infer<
  typeof CurriculumLibraryDesignSummaryDtoSchema
>

export const CurriculumLibraryBrowseOfferingDtoSchema = z
  .object({
    id: z.string().uuid(),
    frameworkId: z.string().uuid(),
    frameworkCode: z.string(),
    framework: z.string(),
    programmeId: z.string().uuid(),
    programmeCode: z.string(),
    programme: z.string(),
    levelId: z.string().uuid().nullable(),
    levelKind: CurriculumLevelKindSchema.nullable(),
    levelCode: z.string().nullable(),
    level: z.string(),
    subjectId: z.string().uuid(),
    subjectCode: z.string(),
    subject: z.string(),
    externalCode: z.string().nullable(),
    designs: z.array(CurriculumLibraryDesignSummaryDtoSchema),
  })
  .strict()
export type CurriculumLibraryBrowseOfferingDto = z.infer<
  typeof CurriculumLibraryBrowseOfferingDtoSchema
>

export const CurriculumLibraryResponseSchema = z
  .object({ offerings: z.array(CurriculumLibraryBrowseOfferingDtoSchema) })
  .strict()
export const CurriculumLibraryDesignResponseSchema = CurriculumLibraryOfferingDtoSchema
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
    sourceKey: z.string().trim().min(1).max(200).optional(),
    resourceId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200),
    resourceType: CurriculumLibraryResourceTypeSchema,
    authority: z.enum(['official', 'school', 'internal', 'synthetic']),
    editionLabel: z.string().trim().max(120).optional(),
    sourceUrl: z.string().url().optional(),
    locator: z.string().trim().max(200).optional(),
    content: z.string().trim().min(20).max(250000),
    sourceFormat: CurriculumSourceFormatSchema.optional(),
    parserVersion: z.string().trim().min(1).max(80).optional(),
    chunkerVersion: z.string().trim().min(1).max(80).optional(),
    resourceMetadata: CurriculumSourceMetadataSchema.optional(),
    chunks: z.array(CurriculumLibrarySourceChunkInputSchema).min(1).max(1000).optional(),
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
    if (
      !source.chunks &&
      ['html', 'docx', 'pdf', 'normalized'].includes(source.sourceFormat ?? '')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['chunks'],
        message: 'This source format needs chunks from a format adapter.',
      })
    }
    if (source.chunks && !source.chunkerVersion) {
      context.addIssue({
        code: 'custom',
        path: ['chunkerVersion'],
        message: 'Structured chunks need a chunker version.',
      })
    }
    if (source.chunks && source.sourceFormat !== 'normalized' && !source.parserVersion) {
      context.addIssue({
        code: 'custom',
        path: ['parserVersion'],
        message: 'Adapter-produced chunks need a parser version.',
      })
    }
    if (
      source.chunks &&
      source.chunks.reduce((total, chunk) => total + chunk.content.length, 0) > 250000
    ) {
      context.addIssue({
        code: 'custom',
        path: ['chunks'],
        message: 'Combined chunk content must not exceed 250000 characters.',
      })
    }
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
  .refine((source) => !(source.sourceKey && source.resourceId), {
    path: ['sourceKey'],
    message: 'Use either sourceKey or resourceId, not both.',
  })
export type CurriculumLibrarySourceInput = z.infer<typeof CurriculumLibrarySourceInputSchema>

export const CurriculumMarkdownSourceInputSchema = z
  .object({ markdown: z.string().trim().min(20).max(250000) })
  .strict()
export type CurriculumMarkdownSourceInput = z.infer<typeof CurriculumMarkdownSourceInputSchema>
