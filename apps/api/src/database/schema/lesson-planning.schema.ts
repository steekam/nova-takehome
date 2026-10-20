import { sql } from 'drizzle-orm'
import { foreignKey, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { type LessonPlanContent, type LessonPlanRubricQa } from '@nova/shared'
import { users } from './identity.schema'
import { curriculumTargetRevisions } from './curriculum-catalogue.schema'
import { libraryResourceChunks } from './library.schema'

export const planStatus = pgEnum('plan_status', ['draft', 'submitted', 'returned', 'published'])

export const reviewDecision = pgEnum('review_decision', ['returned', 'published'])

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

export const lessonPlanValidations = pgTable('lesson_plan_validations', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonPlanId: uuid('lesson_plan_id').references(() => lessonPlans.id).notNull(),
  lessonPlanVersionId: uuid('lesson_plan_version_id').notNull(),
  status: text('status').$type<LessonPlanRubricQa['status']>().notNull(),
  rubricVersion: text('rubric_version').notNull(),
  promptVersion: text('prompt_version').notNull(),
  reviewerModel: text('reviewer_model').notNull(),
  summary: text('summary').notNull(),
  dimensions: jsonb('dimensions').$type<LessonPlanRubricQa['dimensions']>().notNull(),
  traceId: text('trace_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [foreignKey({
  columns: [table.lessonPlanVersionId, table.lessonPlanId],
  foreignColumns: [lessonPlanVersions.id, lessonPlanVersions.lessonPlanId],
  name: 'lesson_plan_validations_version_same_plan_fk',
})])
