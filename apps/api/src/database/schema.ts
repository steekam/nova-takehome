import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
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
    version: integer('version').notNull(),
    content: jsonb('content').$type<LessonPlanContent>().notNull(),
    createdBy: uuid('created_by').references(() => users.id).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('lesson_plan_versions_plan_version_idx').on(table.lessonPlanId, table.version)],
)

export const planReviews = pgTable('plan_reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonPlanId: uuid('lesson_plan_id').references(() => lessonPlans.id).notNull(),
  curriculumLeadId: uuid('curriculum_lead_id').references(() => users.id).notNull(),
  decision: reviewDecision('decision').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
})
