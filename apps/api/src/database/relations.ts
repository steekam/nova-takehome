import { defineRelations } from 'drizzle-orm'
import * as schema from './schema'

export const relations = defineRelations(schema, (r) => ({
  curriculumFrameworks: {
    programmes: r.many.curriculumProgrammes(),
    subjects: r.many.curriculumSubjects(),
  },
  curriculumProgrammes: {
    framework: r.one.curriculumFrameworks({
      from: r.curriculumProgrammes.frameworkId,
      to: r.curriculumFrameworks.id,
      optional: false,
    }),
    levels: r.many.curriculumLevels(),
    offerings: r.many.curriculumOfferings(),
  },
  curriculumLevels: {
    programme: r.one.curriculumProgrammes({
      from: r.curriculumLevels.programmeId,
      to: r.curriculumProgrammes.id,
      optional: false,
    }),
    offerings: r.many.curriculumOfferings(),
  },
  curriculumSubjects: {
    framework: r.one.curriculumFrameworks({
      from: r.curriculumSubjects.frameworkId,
      to: r.curriculumFrameworks.id,
      optional: false,
    }),
    offerings: r.many.curriculumOfferings(),
  },
  curriculumOfferings: {
    programme: r.one.curriculumProgrammes({
      from: r.curriculumOfferings.programmeId,
      to: r.curriculumProgrammes.id,
      optional: false,
    }),
    level: r.one.curriculumLevels({
      from: r.curriculumOfferings.levelId,
      to: r.curriculumLevels.id,
    }),
    subject: r.one.curriculumSubjects({
      from: r.curriculumOfferings.subjectId,
      to: r.curriculumSubjects.id,
      optional: false,
    }),
    designs: r.many.curriculumDesignVersions(),
  },
  curriculumDesignVersions: {
    offering: r.one.curriculumOfferings({
      from: r.curriculumDesignVersions.offeringId,
      to: r.curriculumOfferings.id,
      optional: false,
    }),
    sourceResourceRevision: r.one.libraryResourceRevisions({
      from: r.curriculumDesignVersions.sourceResourceRevisionId,
      to: r.libraryResourceRevisions.id,
    }),
    supersedes: r.one.curriculumDesignVersions({
      from: r.curriculumDesignVersions.supersedesId,
      to: r.curriculumDesignVersions.id,
      alias: 'designVersionSupersession',
    }),
    supersededBy: r.many.curriculumDesignVersions({ alias: 'designVersionSupersession' }),
    nodes: r.many.curriculumNodes(),
    targets: r.many.curriculumTargetRevisions(),
  },
  curriculumNodes: {
    designVersion: r.one.curriculumDesignVersions({
      from: r.curriculumNodes.designVersionId,
      to: r.curriculumDesignVersions.id,
      optional: false,
    }),
    parent: r.one.curriculumNodes({
      from: [r.curriculumNodes.parentNodeId, r.curriculumNodes.designVersionId],
      to: [r.curriculumNodes.id, r.curriculumNodes.designVersionId],
      alias: 'curriculumNodeHierarchy',
    }),
    children: r.many.curriculumNodes({ alias: 'curriculumNodeHierarchy' }),
    targets: r.many.curriculumTargetRevisions(),
  },
  curriculumTargetRevisions: {
    designVersion: r.one.curriculumDesignVersions({
      from: r.curriculumTargetRevisions.designVersionId,
      to: r.curriculumDesignVersions.id,
      optional: false,
    }),
    node: r.one.curriculumNodes({
      from: [r.curriculumTargetRevisions.nodeId, r.curriculumTargetRevisions.designVersionId],
      to: [r.curriculumNodes.id, r.curriculumNodes.designVersionId],
      optional: false,
    }),
    sourceLinks: r.many.curriculumSourceLinks(),
    lessonPlanVersions: r.many.lessonPlanVersions(),
  },
  curriculumSourceLinks: {
    targetRevision: r.one.curriculumTargetRevisions({
      from: r.curriculumSourceLinks.targetRevisionId,
      to: r.curriculumTargetRevisions.id,
      optional: false,
    }),
    resourceRevision: r.one.libraryResourceRevisions({
      from: r.curriculumSourceLinks.resourceRevisionId,
      to: r.libraryResourceRevisions.id,
      optional: false,
    }),
    addedByUser: r.one.users({
      from: r.curriculumSourceLinks.addedBy,
      to: r.users.id,
      alias: 'curriculumSourceLinkAddedBy',
      optional: false,
    }),
    publishedByUser: r.one.users({
      from: r.curriculumSourceLinks.publishedBy,
      to: r.users.id,
      alias: 'curriculumSourceLinkPublishedBy',
    }),
  },
  libraryResources: {
    revisions: r.many.libraryResourceRevisions(),
  },
  libraryResourceRevisions: {
    resource: r.one.libraryResources({
      from: r.libraryResourceRevisions.resourceId,
      to: r.libraryResources.id,
      optional: false,
    }),
    createdByUser: r.one.users({
      from: r.libraryResourceRevisions.createdBy,
      to: r.users.id,
      alias: 'libraryResourceRevisionCreatedBy',
    }),
    chunks: r.many.libraryResourceChunks(),
    sourceLinks: r.many.curriculumSourceLinks(),
    designVersions: r.many.curriculumDesignVersions(),
  },
  libraryResourceChunks: {
    resourceRevision: r.one.libraryResourceRevisions({
      from: r.libraryResourceChunks.resourceRevisionId,
      to: r.libraryResourceRevisions.id,
      optional: false,
    }),
    versionSources: r.many.lessonPlanVersionSources(),
    retrievalCandidates: r.many.lessonPlanRetrievalCandidates(),
  },
  users: {
    lessonPlans: r.many.lessonPlans(),
    createdPlanVersions: r.many.lessonPlanVersions({ alias: 'lessonPlanVersionCreatedBy' }),
    curriculumLeadReviews: r.many.planReviews({ alias: 'planReviewCurriculumLead' }),
    createdResourceRevisions: r.many.libraryResourceRevisions({
      alias: 'libraryResourceRevisionCreatedBy',
    }),
    addedCurriculumSourceLinks: r.many.curriculumSourceLinks({
      alias: 'curriculumSourceLinkAddedBy',
    }),
    publishedCurriculumSourceLinks: r.many.curriculumSourceLinks({
      alias: 'curriculumSourceLinkPublishedBy',
    }),
  },
  lessonPlans: {
    teacher: r.one.users({ from: r.lessonPlans.teacherId, to: r.users.id, optional: false }),
    versions: r.many.lessonPlanVersions(),
    retrievalCandidates: r.many.lessonPlanRetrievalCandidates(),
    reviews: r.many.planReviews(),
    validations: r.many.lessonPlanValidations(),
  },
  lessonPlanVersions: {
    lessonPlan: r.one.lessonPlans({
      from: r.lessonPlanVersions.lessonPlanId,
      to: r.lessonPlans.id,
      optional: false,
    }),
    targetRevision: r.one.curriculumTargetRevisions({
      from: r.lessonPlanVersions.targetRevisionId,
      to: r.curriculumTargetRevisions.id,
    }),
    createdByUser: r.one.users({
      from: r.lessonPlanVersions.createdBy,
      to: r.users.id,
      alias: 'lessonPlanVersionCreatedBy',
      optional: false,
    }),
    sources: r.many.lessonPlanVersionSources(),
    reviews: r.many.planReviews({ alias: 'planReviewVersion' }),
    validations: r.many.lessonPlanValidations({ alias: 'lessonPlanValidationVersion' }),
  },
  lessonPlanVersionSources: {
    lessonPlanVersion: r.one.lessonPlanVersions({
      from: r.lessonPlanVersionSources.lessonPlanVersionId,
      to: r.lessonPlanVersions.id,
      optional: false,
    }),
    resourceChunk: r.one.libraryResourceChunks({
      from: r.lessonPlanVersionSources.resourceChunkId,
      to: r.libraryResourceChunks.id,
      optional: false,
    }),
  },
  lessonPlanRetrievalCandidates: {
    lessonPlan: r.one.lessonPlans({
      from: r.lessonPlanRetrievalCandidates.lessonPlanId,
      to: r.lessonPlans.id,
      optional: false,
    }),
    resourceChunk: r.one.libraryResourceChunks({
      from: r.lessonPlanRetrievalCandidates.resourceChunkId,
      to: r.libraryResourceChunks.id,
      optional: false,
    }),
  },
  planReviews: {
    lessonPlan: r.one.lessonPlans({
      from: r.planReviews.lessonPlanId,
      to: r.lessonPlans.id,
      optional: false,
    }),
    lessonPlanVersion: r.one.lessonPlanVersions({
      from: [r.planReviews.lessonPlanVersionId, r.planReviews.lessonPlanId],
      to: [r.lessonPlanVersions.id, r.lessonPlanVersions.lessonPlanId],
      alias: 'planReviewVersion',
      optional: false,
    }),
    curriculumLead: r.one.users({
      from: r.planReviews.curriculumLeadId,
      to: r.users.id,
      alias: 'planReviewCurriculumLead',
      optional: false,
    }),
  },
  lessonPlanValidations: {
    lessonPlan: r.one.lessonPlans({
      from: r.lessonPlanValidations.lessonPlanId,
      to: r.lessonPlans.id,
      optional: false,
    }),
    lessonPlanVersion: r.one.lessonPlanVersions({
      from: [r.lessonPlanValidations.lessonPlanVersionId, r.lessonPlanValidations.lessonPlanId],
      to: [r.lessonPlanVersions.id, r.lessonPlanVersions.lessonPlanId],
      alias: 'lessonPlanValidationVersion',
      optional: false,
    }),
  },
}))
