import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  foreignKey,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'
import { userRoles, type LessonPlanContent } from '@nova/shared'

export const userRole = pgEnum('user_role', userRoles)
export const planStatus = pgEnum('plan_status', ['draft', 'submitted', 'returned', 'published'])
export const curriculumDocumentType = pgEnum('curriculum_document_type', [
  'scheme_of_work',
  'learning_outcome',
  'assessment_item',
])
export const reviewDecision = pgEnum('review_decision', ['returned', 'published'])
export const curriculumLevelKind = pgEnum('curriculum_level_kind', ['grade', 'stage', 'year', 'qualification'])
export const curriculumDesignStatus = pgEnum('curriculum_design_status', ['draft', 'published', 'retired'])
export const curriculumDesignOrigin = pgEnum('curriculum_design_origin', ['official_import', 'demo_fixture'])
export const curriculumNodeKind = pgEnum('curriculum_node_kind', ['strand', 'sub_strand', 'topic', 'subtopic', 'unit', 'section'])
export const curriculumTargetKind = pgEnum('curriculum_target_kind', ['specific_learning_outcome', 'learning_objective', 'syllabus_content_point'])
export const libraryResourceType = pgEnum('library_resource_type', ['curriculum_design', 'scheme_of_work', 'assessment_item', 'teaching_note', 'lead_guidance', 'exemplar'])
export const libraryAuthority = pgEnum('library_authority', ['official', 'school', 'internal', 'synthetic'])
export const libraryRevisionStatus = pgEnum('library_revision_status', ['draft', 'published', 'retired'])
export const curriculumSourceRole = pgEnum('curriculum_source_role', ['defines_target', 'teaching_support', 'assessment_support', 'guidance', 'exemplar'])
export const curriculumSourceLinkStatus = pgEnum('curriculum_source_link_status', ['draft', 'published', 'retired'])

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const curriculumDocuments = pgTable('curriculum_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentType: curriculumDocumentType('document_type').notNull(),
  subject: text('subject').notNull(),
  grade: text('grade').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const curriculumChunks = pgTable(
  'curriculum_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id').references(() => curriculumDocuments.id).notNull(),
    ordinal: integer('ordinal').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 384 }).notNull(),
  },
  (table) => [
    uniqueIndex('curriculum_chunks_document_ordinal_idx').on(table.documentId, table.ordinal),
    index('curriculum_chunks_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
)

export const curriculumFrameworks = pgTable('curriculum_frameworks', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  authority: text('authority').notNull(),
})

export const curriculumProgrammes = pgTable('curriculum_programmes', {
  id: uuid('id').defaultRandom().primaryKey(),
  frameworkId: uuid('framework_id').references(() => curriculumFrameworks.id).notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [uniqueIndex('curriculum_programmes_framework_code_idx').on(table.frameworkId, table.code)])

export const curriculumLevels = pgTable('curriculum_levels', {
  id: uuid('id').defaultRandom().primaryKey(),
  programmeId: uuid('programme_id').references(() => curriculumProgrammes.id).notNull(),
  kind: curriculumLevelKind('kind').notNull(),
  code: text('code').notNull(),
  label: text('label').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [uniqueIndex('curriculum_levels_programme_code_idx').on(table.programmeId, table.code)])

export const curriculumSubjects = pgTable('curriculum_subjects', {
  id: uuid('id').defaultRandom().primaryKey(),
  frameworkId: uuid('framework_id').references(() => curriculumFrameworks.id).notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
}, (table) => [uniqueIndex('curriculum_subjects_framework_code_idx').on(table.frameworkId, table.code)])

export const curriculumOfferings = pgTable('curriculum_offerings', {
  id: uuid('id').defaultRandom().primaryKey(),
  programmeId: uuid('programme_id').references(() => curriculumProgrammes.id).notNull(),
  levelId: uuid('level_id').references(() => curriculumLevels.id),
  subjectId: uuid('subject_id').references(() => curriculumSubjects.id).notNull(),
  externalCode: text('external_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('curriculum_offerings_context_idx').on(table.programmeId, table.levelId, table.subjectId)])

export const libraryResources = pgTable('library_resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  resourceType: libraryResourceType('resource_type').notNull(),
  title: text('title').notNull(),
  authority: libraryAuthority('authority').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const libraryResourceRevisions = pgTable('library_resource_revisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  resourceId: uuid('resource_id').references(() => libraryResources.id).notNull(),
  revisionNumber: integer('revision_number').notNull(),
  editionLabel: text('edition_label'),
  sourceUrl: text('source_url'),
  contentHash: text('content_hash').notNull(),
  content: text('content').notNull(),
  status: libraryRevisionStatus('status').default('draft').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('library_resource_revisions_resource_revision_idx').on(table.resourceId, table.revisionNumber)])

export const libraryResourceChunks = pgTable('library_resource_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  resourceRevisionId: uuid('resource_revision_id').references(() => libraryResourceRevisions.id).notNull(),
  ordinal: integer('ordinal').notNull(),
  locator: text('locator'),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 384 }).notNull(),
}, (table) => [
  uniqueIndex('library_resource_chunks_revision_ordinal_idx').on(table.resourceRevisionId, table.ordinal),
  index('library_resource_chunks_embedding_hnsw_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
])

export const curriculumDesignVersions = pgTable('curriculum_design_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  offeringId: uuid('offering_id').references(() => curriculumOfferings.id).notNull(),
  sourceResourceRevisionId: uuid('source_resource_revision_id').references(() => libraryResourceRevisions.id),
  editionLabel: text('edition_label').notNull(),
  revisionNumber: integer('revision_number').notNull().default(1),
  origin: curriculumDesignOrigin('origin').notNull(),
  status: curriculumDesignStatus('status').default('draft').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  supersedesId: uuid('supersedes_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('curriculum_design_versions_offering_edition_revision_idx').on(table.offeringId, table.editionLabel, table.revisionNumber),
  foreignKey({ columns: [table.supersedesId], foreignColumns: [table.id], name: 'curriculum_design_versions_supersedes_fk' }),
])

export const curriculumNodes = pgTable('curriculum_nodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  designVersionId: uuid('design_version_id').references(() => curriculumDesignVersions.id).notNull(),
  parentNodeId: uuid('parent_node_id'),
  kind: curriculumNodeKind('kind').notNull(),
  code: text('code'),
  label: text('label').notNull(),
  sourceLocator: text('source_locator'),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  uniqueIndex('curriculum_nodes_id_design_version_idx').on(table.id, table.designVersionId),
  uniqueIndex('curriculum_nodes_version_locator_idx').on(table.designVersionId, table.sourceLocator),
  foreignKey({ columns: [table.parentNodeId, table.designVersionId], foreignColumns: [table.id, table.designVersionId], name: 'curriculum_nodes_parent_same_version_fk' }),
])

export const curriculumTargetRevisions = pgTable('curriculum_target_revisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  designVersionId: uuid('design_version_id').references(() => curriculumDesignVersions.id).notNull(),
  nodeId: uuid('node_id').notNull(),
  kind: curriculumTargetKind('kind').notNull(),
  code: text('code'),
  sourceLocator: text('source_locator').notNull(),
  title: text('title').notNull(),
  statement: text('statement').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('curriculum_target_revisions_version_locator_idx').on(table.designVersionId, table.sourceLocator),
  foreignKey({ columns: [table.nodeId, table.designVersionId], foreignColumns: [curriculumNodes.id, curriculumNodes.designVersionId], name: 'curriculum_target_revisions_node_same_version_fk' }),
])

export const curriculumSourceLinks = pgTable('curriculum_source_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  targetRevisionId: uuid('target_revision_id').references(() => curriculumTargetRevisions.id).notNull(),
  resourceRevisionId: uuid('resource_revision_id').references(() => libraryResourceRevisions.id).notNull(),
  role: curriculumSourceRole('role').notNull(),
  status: curriculumSourceLinkStatus('status').default('draft').notNull(),
  addedBy: uuid('added_by').references(() => users.id).notNull(),
  publishedBy: uuid('published_by').references(() => users.id),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('curriculum_source_links_target_resource_role_idx').on(table.targetRevisionId, table.resourceRevisionId, table.role)])

export const lessonPlans = pgTable('lesson_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  teacherId: uuid('teacher_id').references(() => users.id).notNull(),
  status: planStatus('status').default('draft').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const lessonPlanVersions = pgTable(
  'lesson_plan_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lessonPlanId: uuid('lesson_plan_id').references(() => lessonPlans.id).notNull(),
    targetRevisionId: uuid('target_revision_id').references(() => curriculumTargetRevisions.id),
    version: integer('version').notNull(),
    content: jsonb('content').$type<LessonPlanContent>().notNull(),
    createdBy: uuid('created_by').references(() => users.id).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('lesson_plan_versions_plan_version_idx').on(table.lessonPlanId, table.version),
    uniqueIndex('lesson_plan_versions_id_plan_idx').on(table.id, table.lessonPlanId),
  ],
)

export const lessonPlanVersionSources = pgTable('lesson_plan_version_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonPlanVersionId: uuid('lesson_plan_version_id').references(() => lessonPlanVersions.id).notNull(),
  resourceChunkId: uuid('resource_chunk_id').references(() => libraryResourceChunks.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('lesson_plan_version_sources_version_chunk_idx').on(table.lessonPlanVersionId, table.resourceChunkId)])

export const lessonPlanRetrievalCandidates = pgTable('lesson_plan_retrieval_candidates', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonPlanId: uuid('lesson_plan_id').references(() => lessonPlans.id).notNull(),
  resourceChunkId: uuid('resource_chunk_id').references(() => libraryResourceChunks.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('lesson_plan_retrieval_candidates_plan_chunk_idx').on(table.lessonPlanId, table.resourceChunkId)])

export const planReviews = pgTable('plan_reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonPlanId: uuid('lesson_plan_id').references(() => lessonPlans.id).notNull(),
  lessonPlanVersionId: uuid('lesson_plan_version_id').notNull(),
  curriculumLeadId: uuid('curriculum_lead_id').references(() => users.id).notNull(),
  decision: reviewDecision('decision').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => [foreignKey({
  columns: [table.lessonPlanVersionId, table.lessonPlanId],
  foreignColumns: [lessonPlanVersions.id, lessonPlanVersions.lessonPlanId],
  name: 'plan_reviews_version_same_plan_fk',
})])
