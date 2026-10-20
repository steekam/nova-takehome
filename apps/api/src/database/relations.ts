import { relations } from 'drizzle-orm'
import { curriculumChunks, curriculumDocuments } from './schema/curriculum-documents.schema'
import {
  curriculumDesignVersions,
  curriculumFrameworks,
  curriculumLevels,
  curriculumNodes,
  curriculumOfferings,
  curriculumProgrammes,
  curriculumSubjects,
  curriculumTargetRevisions,
} from './schema/curriculum-catalogue.schema'
import { curriculumSourceLinks } from './schema/curriculum-source-links.schema'
import { users } from './schema/identity.schema'
import {
  lessonPlanRetrievalCandidates,
  lessonPlanValidations,
  lessonPlanVersionSources,
  lessonPlanVersions,
  lessonPlans,
  planReviews,
} from './schema/lesson-planning.schema'
import { libraryResourceChunks, libraryResourceRevisions, libraryResources } from './schema/library.schema'

export const curriculumDocumentsRelations = relations(curriculumDocuments, ({ many }) => ({
  chunks: many(curriculumChunks),
}))

export const curriculumChunksRelations = relations(curriculumChunks, ({ one }) => ({
  document: one(curriculumDocuments, { fields: [curriculumChunks.documentId], references: [curriculumDocuments.id] }),
}))

export const curriculumFrameworksRelations = relations(curriculumFrameworks, ({ many }) => ({
  programmes: many(curriculumProgrammes),
  subjects: many(curriculumSubjects),
}))

export const curriculumProgrammesRelations = relations(curriculumProgrammes, ({ one, many }) => ({
  framework: one(curriculumFrameworks, { fields: [curriculumProgrammes.frameworkId], references: [curriculumFrameworks.id] }),
  levels: many(curriculumLevels),
  offerings: many(curriculumOfferings),
}))

export const curriculumLevelsRelations = relations(curriculumLevels, ({ one, many }) => ({
  programme: one(curriculumProgrammes, { fields: [curriculumLevels.programmeId], references: [curriculumProgrammes.id] }),
  offerings: many(curriculumOfferings),
}))

export const curriculumSubjectsRelations = relations(curriculumSubjects, ({ one, many }) => ({
  framework: one(curriculumFrameworks, { fields: [curriculumSubjects.frameworkId], references: [curriculumFrameworks.id] }),
  offerings: many(curriculumOfferings),
}))

export const curriculumOfferingsRelations = relations(curriculumOfferings, ({ one, many }) => ({
  programme: one(curriculumProgrammes, { fields: [curriculumOfferings.programmeId], references: [curriculumProgrammes.id] }),
  level: one(curriculumLevels, { fields: [curriculumOfferings.levelId], references: [curriculumLevels.id] }),
  subject: one(curriculumSubjects, { fields: [curriculumOfferings.subjectId], references: [curriculumSubjects.id] }),
  designs: many(curriculumDesignVersions),
}))

export const curriculumDesignVersionsRelations = relations(curriculumDesignVersions, ({ one, many }) => ({
  offering: one(curriculumOfferings, { fields: [curriculumDesignVersions.offeringId], references: [curriculumOfferings.id] }),
  sourceResourceRevision: one(libraryResourceRevisions, { fields: [curriculumDesignVersions.sourceResourceRevisionId], references: [libraryResourceRevisions.id] }),
  supersedes: one(curriculumDesignVersions, {
    fields: [curriculumDesignVersions.supersedesId],
    references: [curriculumDesignVersions.id],
    relationName: 'designVersionSupersession',
  }),
  supersededBy: many(curriculumDesignVersions, { relationName: 'designVersionSupersession' }),
  nodes: many(curriculumNodes),
  targets: many(curriculumTargetRevisions),
}))

export const curriculumNodesRelations = relations(curriculumNodes, ({ one, many }) => ({
  designVersion: one(curriculumDesignVersions, { fields: [curriculumNodes.designVersionId], references: [curriculumDesignVersions.id] }),
  parent: one(curriculumNodes, {
    fields: [curriculumNodes.parentNodeId, curriculumNodes.designVersionId],
    references: [curriculumNodes.id, curriculumNodes.designVersionId],
    relationName: 'curriculumNodeHierarchy',
  }),
  children: many(curriculumNodes, { relationName: 'curriculumNodeHierarchy' }),
  targets: many(curriculumTargetRevisions),
}))

export const curriculumTargetRevisionsRelations = relations(curriculumTargetRevisions, ({ one, many }) => ({
  designVersion: one(curriculumDesignVersions, { fields: [curriculumTargetRevisions.designVersionId], references: [curriculumDesignVersions.id] }),
  node: one(curriculumNodes, {
    fields: [curriculumTargetRevisions.nodeId, curriculumTargetRevisions.designVersionId],
    references: [curriculumNodes.id, curriculumNodes.designVersionId],
  }),
  sourceLinks: many(curriculumSourceLinks),
  lessonPlanVersions: many(lessonPlanVersions),
}))

export const curriculumSourceLinksRelations = relations(curriculumSourceLinks, ({ one }) => ({
  targetRevision: one(curriculumTargetRevisions, { fields: [curriculumSourceLinks.targetRevisionId], references: [curriculumTargetRevisions.id] }),
  resourceRevision: one(libraryResourceRevisions, { fields: [curriculumSourceLinks.resourceRevisionId], references: [libraryResourceRevisions.id] }),
  addedBy: one(users, { fields: [curriculumSourceLinks.addedBy], references: [users.id], relationName: 'curriculumSourceLinkAddedBy' }),
  publishedBy: one(users, { fields: [curriculumSourceLinks.publishedBy], references: [users.id], relationName: 'curriculumSourceLinkPublishedBy' }),
}))

export const libraryResourcesRelations = relations(libraryResources, ({ many }) => ({
  revisions: many(libraryResourceRevisions),
}))

export const libraryResourceRevisionsRelations = relations(libraryResourceRevisions, ({ one, many }) => ({
  resource: one(libraryResources, { fields: [libraryResourceRevisions.resourceId], references: [libraryResources.id] }),
  createdBy: one(users, { fields: [libraryResourceRevisions.createdBy], references: [users.id], relationName: 'libraryResourceRevisionCreatedBy' }),
  chunks: many(libraryResourceChunks),
  sourceLinks: many(curriculumSourceLinks),
  designVersions: many(curriculumDesignVersions),
}))

export const libraryResourceChunksRelations = relations(libraryResourceChunks, ({ one, many }) => ({
  resourceRevision: one(libraryResourceRevisions, { fields: [libraryResourceChunks.resourceRevisionId], references: [libraryResourceRevisions.id] }),
  versionSources: many(lessonPlanVersionSources),
  retrievalCandidates: many(lessonPlanRetrievalCandidates),
}))

export const usersRelations = relations(users, ({ many }) => ({
  lessonPlans: many(lessonPlans),
  createdPlanVersions: many(lessonPlanVersions, { relationName: 'lessonPlanVersionCreatedBy' }),
  curriculumLeadReviews: many(planReviews, { relationName: 'planReviewCurriculumLead' }),
  createdResourceRevisions: many(libraryResourceRevisions, { relationName: 'libraryResourceRevisionCreatedBy' }),
  addedCurriculumSourceLinks: many(curriculumSourceLinks, { relationName: 'curriculumSourceLinkAddedBy' }),
  publishedCurriculumSourceLinks: many(curriculumSourceLinks, { relationName: 'curriculumSourceLinkPublishedBy' }),
}))

export const lessonPlansRelations = relations(lessonPlans, ({ one, many }) => ({
  teacher: one(users, { fields: [lessonPlans.teacherId], references: [users.id] }),
  versions: many(lessonPlanVersions),
  retrievalCandidates: many(lessonPlanRetrievalCandidates),
  reviews: many(planReviews),
  validations: many(lessonPlanValidations),
}))

export const lessonPlanVersionsRelations = relations(lessonPlanVersions, ({ one, many }) => ({
  lessonPlan: one(lessonPlans, { fields: [lessonPlanVersions.lessonPlanId], references: [lessonPlans.id] }),
  targetRevision: one(curriculumTargetRevisions, { fields: [lessonPlanVersions.targetRevisionId], references: [curriculumTargetRevisions.id] }),
  createdBy: one(users, { fields: [lessonPlanVersions.createdBy], references: [users.id], relationName: 'lessonPlanVersionCreatedBy' }),
  sources: many(lessonPlanVersionSources),
  reviews: many(planReviews, { relationName: 'planReviewVersion' }),
  validations: many(lessonPlanValidations, { relationName: 'lessonPlanValidationVersion' }),
}))

export const lessonPlanVersionSourcesRelations = relations(lessonPlanVersionSources, ({ one }) => ({
  lessonPlanVersion: one(lessonPlanVersions, { fields: [lessonPlanVersionSources.lessonPlanVersionId], references: [lessonPlanVersions.id] }),
  resourceChunk: one(libraryResourceChunks, { fields: [lessonPlanVersionSources.resourceChunkId], references: [libraryResourceChunks.id] }),
}))

export const lessonPlanRetrievalCandidatesRelations = relations(lessonPlanRetrievalCandidates, ({ one }) => ({
  lessonPlan: one(lessonPlans, { fields: [lessonPlanRetrievalCandidates.lessonPlanId], references: [lessonPlans.id] }),
  resourceChunk: one(libraryResourceChunks, { fields: [lessonPlanRetrievalCandidates.resourceChunkId], references: [libraryResourceChunks.id] }),
}))

export const planReviewsRelations = relations(planReviews, ({ one }) => ({
  lessonPlan: one(lessonPlans, { fields: [planReviews.lessonPlanId], references: [lessonPlans.id] }),
  lessonPlanVersion: one(lessonPlanVersions, {
    fields: [planReviews.lessonPlanVersionId, planReviews.lessonPlanId],
    references: [lessonPlanVersions.id, lessonPlanVersions.lessonPlanId],
    relationName: 'planReviewVersion',
  }),
  curriculumLead: one(users, { fields: [planReviews.curriculumLeadId], references: [users.id], relationName: 'planReviewCurriculumLead' }),
}))

export const lessonPlanValidationsRelations = relations(lessonPlanValidations, ({ one }) => ({
  lessonPlan: one(lessonPlans, { fields: [lessonPlanValidations.lessonPlanId], references: [lessonPlans.id] }),
  lessonPlanVersion: one(lessonPlanVersions, {
    fields: [lessonPlanValidations.lessonPlanVersionId, lessonPlanValidations.lessonPlanId],
    references: [lessonPlanVersions.id, lessonPlanVersions.lessonPlanId],
    relationName: 'lessonPlanValidationVersion',
  }),
}))
