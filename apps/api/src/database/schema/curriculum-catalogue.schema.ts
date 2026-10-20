import { foreignKey, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { libraryResourceRevisions } from './library.schema'

export const curriculumLevelKind = pgEnum('curriculum_level_kind', ['grade', 'stage', 'year', 'qualification'])

export const curriculumDesignStatus = pgEnum('curriculum_design_status', ['draft', 'published', 'retired'])

export const curriculumDesignOrigin = pgEnum('curriculum_design_origin', ['official_import', 'demo_fixture'])

export const curriculumNodeKind = pgEnum('curriculum_node_kind', ['strand', 'sub_strand', 'topic', 'subtopic', 'unit', 'section'])

export const curriculumTargetKind = pgEnum('curriculum_target_kind', ['specific_learning_outcome', 'learning_objective', 'syllabus_content_point'])

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
