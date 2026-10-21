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

export const curriculumDocumentType = pgEnum('curriculum_document_type', [
  'scheme_of_work',
  'learning_outcome',
  'assessment_item',
])

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
    documentId: uuid('document_id')
      .references(() => curriculumDocuments.id)
      .notNull(),
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
