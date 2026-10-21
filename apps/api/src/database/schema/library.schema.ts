import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'
import { users } from './identity.schema'

export const libraryResourceType = pgEnum('library_resource_type', [
  'curriculum_design',
  'scheme_of_work',
  'assessment_item',
  'teaching_note',
  'lead_guidance',
  'exemplar',
])

export const libraryAuthority = pgEnum('library_authority', [
  'official',
  'school',
  'internal',
  'synthetic',
])

export const libraryRevisionStatus = pgEnum('library_revision_status', [
  'draft',
  'published',
  'retired',
])

export const libraryResources = pgTable('library_resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  resourceType: libraryResourceType('resource_type').notNull(),
  title: text('title').notNull(),
  authority: libraryAuthority('authority').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const libraryResourceRevisions = pgTable(
  'library_resource_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resourceId: uuid('resource_id')
      .references(() => libraryResources.id)
      .notNull(),
    revisionNumber: integer('revision_number').notNull(),
    editionLabel: text('edition_label'),
    sourceUrl: text('source_url'),
    contentHash: text('content_hash').notNull(),
    content: text('content').notNull(),
    status: libraryRevisionStatus('status').default('draft').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('library_resource_revisions_resource_revision_idx').on(
      table.resourceId,
      table.revisionNumber,
    ),
  ],
)

export const libraryResourceChunks = pgTable(
  'library_resource_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resourceRevisionId: uuid('resource_revision_id')
      .references(() => libraryResourceRevisions.id)
      .notNull(),
    ordinal: integer('ordinal').notNull(),
    locator: text('locator'),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 384 }).notNull(),
  },
  (table) => [
    uniqueIndex('library_resource_chunks_revision_ordinal_idx').on(
      table.resourceRevisionId,
      table.ordinal,
    ),
    index('library_resource_chunks_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
)
