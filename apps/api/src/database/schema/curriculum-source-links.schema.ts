import { pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { curriculumTargetRevisions } from './curriculum-catalogue.schema'
import { libraryResourceRevisions } from './library.schema'
import { users } from './identity.schema'

export const curriculumSourceRole = pgEnum('curriculum_source_role', ['defines_target', 'teaching_support', 'assessment_support', 'guidance', 'exemplar'])

export const curriculumSourceLinkStatus = pgEnum('curriculum_source_link_status', ['draft', 'published', 'retired'])

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
