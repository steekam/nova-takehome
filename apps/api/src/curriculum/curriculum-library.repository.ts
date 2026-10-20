import { Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { DatabaseService } from '../database/database.service'
import type { DbExecutor } from '../database/executor'
import {
  curriculumDesignVersions,
  curriculumFrameworks,
  curriculumLevels,
  curriculumNodes,
  curriculumOfferings,
  curriculumProgrammes,
  curriculumSourceLinks,
  curriculumSubjects,
  curriculumTargetRevisions,
  curriculumChunks,
  curriculumDocuments,
  libraryResourceChunks,
  libraryResourceRevisions,
  libraryResources,
} from '../database/schema'

@Injectable()
export class CurriculumLibraryRepository {
  constructor(private readonly database: DatabaseService) {}

  async catalogue(includeDraft: boolean) {
    const offerings = await this.database.db.select({
      id: curriculumOfferings.id,
      frameworkId: curriculumFrameworks.id,
      framework: curriculumFrameworks.name,
      programmeId: curriculumProgrammes.id,
      programme: curriculumProgrammes.name,
      levelId: curriculumLevels.id,
      level: curriculumLevels.label,
      subjectId: curriculumSubjects.id,
      subject: curriculumSubjects.name,
      externalCode: curriculumOfferings.externalCode,
    }).from(curriculumOfferings)
      .innerJoin(curriculumProgrammes, eq(curriculumOfferings.programmeId, curriculumProgrammes.id))
      .innerJoin(curriculumFrameworks, eq(curriculumProgrammes.frameworkId, curriculumFrameworks.id))
      .leftJoin(curriculumLevels, eq(curriculumOfferings.levelId, curriculumLevels.id))
      .innerJoin(curriculumSubjects, eq(curriculumOfferings.subjectId, curriculumSubjects.id))

    const designs = await this.database.db.select().from(curriculumDesignVersions)
      .where(includeDraft ? undefined : eq(curriculumDesignVersions.status, 'published'))
    const designIds = designs.map((design) => design.id)
    const nodes = designIds.length
      ? await this.database.db.select().from(curriculumNodes).where(inArray(curriculumNodes.designVersionId, designIds))
      : []
    const targets = designIds.length
      ? await this.database.db.select().from(curriculumTargetRevisions).where(inArray(curriculumTargetRevisions.designVersionId, designIds))
      : []
    const targetIds = targets.map((target) => target.id)
    const sources = targetIds.length ? await this.sourceRows(targetIds, includeDraft) : []

    return {
      offerings,
      designs,
      nodes,
      targets,
      sources,
    }
  }

  sourceRows(targetIds: string[], includeDraft: boolean, executor: DbExecutor = this.database.db) {
    return executor.select({
      linkId: curriculumSourceLinks.id,
      targetRevisionId: curriculumSourceLinks.targetRevisionId,
      role: curriculumSourceLinks.role,
      linkStatus: curriculumSourceLinks.status,
      documentId: libraryResources.id,
      resourceRevisionId: libraryResourceRevisions.id,
      revisionNumber: libraryResourceRevisions.revisionNumber,
      chunkId: libraryResourceChunks.id,
      resourceType: libraryResources.resourceType,
      title: libraryResources.title,
      authority: libraryResources.authority,
      editionLabel: libraryResourceRevisions.editionLabel,
      sourceUrl: libraryResourceRevisions.sourceUrl,
      subject: curriculumSubjects.name,
      grade: curriculumLevels.label,
      locator: libraryResourceChunks.locator,
      content: libraryResourceChunks.content,
      revisionStatus: libraryResourceRevisions.status,
    }).from(curriculumSourceLinks)
      .innerJoin(libraryResourceRevisions, eq(curriculumSourceLinks.resourceRevisionId, libraryResourceRevisions.id))
      .innerJoin(libraryResources, eq(libraryResourceRevisions.resourceId, libraryResources.id))
      .innerJoin(curriculumTargetRevisions, eq(curriculumSourceLinks.targetRevisionId, curriculumTargetRevisions.id))
      .innerJoin(curriculumDesignVersions, eq(curriculumTargetRevisions.designVersionId, curriculumDesignVersions.id))
      .innerJoin(curriculumOfferings, eq(curriculumDesignVersions.offeringId, curriculumOfferings.id))
      .innerJoin(curriculumProgrammes, eq(curriculumOfferings.programmeId, curriculumProgrammes.id))
      .innerJoin(curriculumSubjects, eq(curriculumOfferings.subjectId, curriculumSubjects.id))
      .leftJoin(curriculumLevels, eq(curriculumOfferings.levelId, curriculumLevels.id))
      .innerJoin(libraryResourceChunks, eq(libraryResourceChunks.resourceRevisionId, libraryResourceRevisions.id))
      .where(and(
        inArray(curriculumSourceLinks.targetRevisionId, targetIds),
        includeDraft ? undefined : eq(curriculumSourceLinks.status, 'published'),
        includeDraft ? undefined : eq(libraryResourceRevisions.status, 'published'),
      ))
  }

  legacySources() {
    return this.database.db.select({
      documentId: curriculumDocuments.id,
      chunkId: curriculumChunks.id,
      documentType: curriculumDocuments.documentType,
      title: curriculumDocuments.title,
      subject: curriculumDocuments.subject,
      grade: curriculumDocuments.grade,
      content: curriculumChunks.content,
    }).from(curriculumChunks)
      .innerJoin(curriculumDocuments, eq(curriculumChunks.documentId, curriculumDocuments.id))
  }

  sourceChunksForTarget(targetRevisionId: string, embedding: number[], limit: number) {
    const vectorText = `[${embedding.join(',')}]`
    const distance = sql<number>`${libraryResourceChunks.embedding} <=> ${vectorText}::vector`
    return this.database.db.select({
      linkId: curriculumSourceLinks.id,
      documentId: libraryResources.id,
      resourceRevisionId: libraryResourceRevisions.id,
      revisionNumber: libraryResourceRevisions.revisionNumber,
      chunkId: libraryResourceChunks.id,
      resourceType: libraryResources.resourceType,
      title: libraryResources.title,
      authority: libraryResources.authority,
      editionLabel: libraryResourceRevisions.editionLabel,
      sourceUrl: libraryResourceRevisions.sourceUrl,
      locator: libraryResourceChunks.locator,
      content: libraryResourceChunks.content,
      role: curriculumSourceLinks.role,
      linkStatus: curriculumSourceLinks.status,
      revisionStatus: libraryResourceRevisions.status,
    }).from(curriculumSourceLinks)
      .innerJoin(libraryResourceRevisions, eq(curriculumSourceLinks.resourceRevisionId, libraryResourceRevisions.id))
      .innerJoin(libraryResources, eq(libraryResourceRevisions.resourceId, libraryResources.id))
      .innerJoin(libraryResourceChunks, eq(libraryResourceChunks.resourceRevisionId, libraryResourceRevisions.id))
      .where(and(
        eq(curriculumSourceLinks.targetRevisionId, targetRevisionId),
        eq(curriculumSourceLinks.status, 'published'),
        eq(libraryResourceRevisions.status, 'published'),
      ))
      .orderBy(distance, asc(curriculumSourceLinks.role), asc(curriculumSourceLinks.id))
      .limit(limit)
  }

  targetDefinitionChunks(targetRevisionId: string) {
    return this.database.db.select({
      linkId: curriculumSourceLinks.id,
      documentId: libraryResources.id,
      resourceRevisionId: libraryResourceRevisions.id,
      revisionNumber: libraryResourceRevisions.revisionNumber,
      chunkId: libraryResourceChunks.id,
      resourceType: libraryResources.resourceType,
      title: libraryResources.title,
      authority: libraryResources.authority,
      editionLabel: libraryResourceRevisions.editionLabel,
      sourceUrl: libraryResourceRevisions.sourceUrl,
      locator: libraryResourceChunks.locator,
      content: libraryResourceChunks.content,
      role: curriculumSourceLinks.role,
      linkStatus: curriculumSourceLinks.status,
      revisionStatus: libraryResourceRevisions.status,
    }).from(curriculumSourceLinks)
      .innerJoin(libraryResourceRevisions, eq(curriculumSourceLinks.resourceRevisionId, libraryResourceRevisions.id))
      .innerJoin(libraryResources, eq(libraryResourceRevisions.resourceId, libraryResources.id))
      .innerJoin(libraryResourceChunks, eq(libraryResourceChunks.resourceRevisionId, libraryResourceRevisions.id))
      .where(and(
        eq(curriculumSourceLinks.targetRevisionId, targetRevisionId),
        eq(curriculumSourceLinks.role, 'defines_target'),
        eq(libraryResources.resourceType, 'curriculum_design'),
        eq(libraryResources.authority, 'official'),
        eq(curriculumSourceLinks.status, 'published'),
        eq(libraryResourceRevisions.status, 'published'),
      ))
  }
}
