import { Injectable } from '@nestjs/common'
import { and, asc, count, countDistinct, desc, eq, inArray, sql } from 'drizzle-orm'
import { DatabaseService } from '../database/database.service'
import type { DbExecutor } from '../database/executor'
import {
  curriculumFrameworks,
  curriculumLevels,
  curriculumOfferings,
  curriculumProgrammes,
  curriculumSubjects,
  curriculumDesignVersions,
  curriculumSourceLinks,
  curriculumTargetRevisions,
  libraryResourceChunks,
  libraryResourceRevisions,
  libraryResources,
} from '../database/schema'

@Injectable()
export class CurriculumLibraryRepository {
  constructor(private readonly database: DatabaseService) {}

  async catalogueSummary(includeDraft: boolean) {
    const rows = await this.database.db.query.curriculumOfferings.findMany({
      columns: { id: true, externalCode: true },
      with: {
        programme: {
          columns: { id: true, code: true, name: true },
          with: {
            framework: { columns: { id: true, code: true, name: true } },
          },
        },
        level: { columns: { id: true, kind: true, code: true, label: true } },
        subject: { columns: { id: true, code: true, name: true } },
        designs: {
          ...(!includeDraft ? { where: { status: 'published' as const } } : {}),
          columns: {
            id: true,
            editionLabel: true,
            revisionNumber: true,
            publishedAt: true,
            origin: true,
            status: true,
          },
        },
      },
    })
    const targetCounts = await this.database.db
      .select({ designVersionId: curriculumTargetRevisions.designVersionId, count: count() })
      .from(curriculumTargetRevisions)
      .groupBy(curriculumTargetRevisions.designVersionId)
    const readyTargetCounts = await this.database.db
      .select({
        designVersionId: curriculumTargetRevisions.designVersionId,
        count: countDistinct(curriculumTargetRevisions.id),
      })
      .from(curriculumTargetRevisions)
      .innerJoin(
        curriculumDesignVersions,
        eq(curriculumTargetRevisions.designVersionId, curriculumDesignVersions.id),
      )
      .innerJoin(
        curriculumSourceLinks,
        and(
          eq(curriculumTargetRevisions.id, curriculumSourceLinks.targetRevisionId),
          eq(curriculumSourceLinks.role, 'defines_target'),
          eq(curriculumSourceLinks.status, 'published'),
        ),
      )
      .innerJoin(
        libraryResourceRevisions,
        and(
          eq(curriculumSourceLinks.resourceRevisionId, libraryResourceRevisions.id),
          eq(libraryResourceRevisions.status, 'published'),
        ),
      )
      .innerJoin(
        libraryResources,
        and(
          eq(libraryResourceRevisions.resourceId, libraryResources.id),
          eq(libraryResources.resourceType, 'curriculum_design'),
          eq(libraryResources.authority, 'official'),
        ),
      )
      .where(eq(curriculumDesignVersions.status, 'published'))
      .groupBy(curriculumTargetRevisions.designVersionId)
    const targetCountByDesign = new Map(
      targetCounts.map(({ designVersionId, count: targetCount }) => [designVersionId, targetCount]),
    )
    const readyTargetCountByDesign = new Map(
      readyTargetCounts.map(({ designVersionId, count: readyTargetCount }) => [
        designVersionId,
        readyTargetCount,
      ]),
    )

    return rows.map((offering) => ({
      id: offering.id,
      frameworkId: offering.programme.framework.id,
      frameworkCode: offering.programme.framework.code,
      framework: offering.programme.framework.name,
      programmeId: offering.programme.id,
      programmeCode: offering.programme.code,
      programme: offering.programme.name,
      levelId: offering.level?.id ?? null,
      levelKind: offering.level?.kind ?? null,
      levelCode: offering.level?.code ?? null,
      level: offering.level?.label ?? 'All levels',
      subjectId: offering.subject.id,
      subjectCode: offering.subject.code,
      subject: offering.subject.name,
      externalCode: offering.externalCode,
      designs: offering.designs.map((design) => ({
        id: design.id,
        editionLabel: design.editionLabel,
        revisionNumber: design.revisionNumber,
        publishedAt: design.publishedAt?.toISOString() ?? null,
        origin: design.origin,
        status: design.status,
        targetCount: targetCountByDesign.get(design.id) ?? 0,
        generationReadyCount: readyTargetCountByDesign.get(design.id) ?? 0,
      })),
    }))
  }

  async catalogue(
    includeDraft: boolean,
    offeringId?: string,
    designVersionId?: string,
    targetRevisionId?: string,
  ) {
    const rows = await this.database.db.query.curriculumOfferings.findMany({
      ...(offeringId ? { where: { id: offeringId } } : {}),
      with: {
        programme: { with: { framework: true } },
        level: true,
        subject: true,
        designs: {
          ...(!includeDraft || designVersionId
            ? {
                where: {
                  ...(!includeDraft ? { status: 'published' as const } : {}),
                  ...(designVersionId ? { id: designVersionId } : {}),
                },
              }
            : {}),
          with: {
            nodes: true,
            targets: targetRevisionId ? { where: { id: targetRevisionId } } : true,
          },
        },
      },
    })

    const offerings = rows.map((offering) => ({
      id: offering.id,
      frameworkId: offering.programme.framework.id,
      frameworkCode: offering.programme.framework.code,
      framework: offering.programme.framework.name,
      programmeId: offering.programme.id,
      programmeCode: offering.programme.code,
      programme: offering.programme.name,
      levelId: offering.level?.id ?? null,
      levelKind: offering.level?.kind ?? null,
      levelCode: offering.level?.code ?? null,
      level: offering.level?.label ?? null,
      subjectId: offering.subject.id,
      subjectCode: offering.subject.code,
      subject: offering.subject.name,
      externalCode: offering.externalCode,
    }))
    const designs = rows.flatMap((offering) => offering.designs)
    const nodes = designs.flatMap((design) => design.nodes)
    const targets = designs.flatMap((design) => design.targets)
    const sources = targets.length
      ? await this.sourceRows(
          targets.map((target) => target.id),
          includeDraft,
        )
      : []

    return {
      offerings,
      designs,
      nodes,
      targets,
      sources,
    }
  }

  targetDesign(targetRevisionId: string, executor: DbExecutor = this.database.db) {
    return executor
      .select({ designVersionId: curriculumTargetRevisions.designVersionId })
      .from(curriculumTargetRevisions)
      .where(eq(curriculumTargetRevisions.id, targetRevisionId))
      .limit(1)
  }

  targetContexts(targetRevisionIds: string[]) {
    if (targetRevisionIds.length === 0) return Promise.resolve([])
    return this.database.db
      .select({
        targetRevisionId: curriculumTargetRevisions.id,
        targetTitle: curriculumTargetRevisions.title,
        locator: curriculumTargetRevisions.sourceLocator,
        releaseLabel: curriculumDesignVersions.editionLabel,
        grade: curriculumLevels.label,
        subject: curriculumSubjects.name,
        programme: curriculumProgrammes.name,
        framework: curriculumFrameworks.name,
      })
      .from(curriculumTargetRevisions)
      .innerJoin(
        curriculumDesignVersions,
        eq(curriculumTargetRevisions.designVersionId, curriculumDesignVersions.id),
      )
      .innerJoin(
        curriculumOfferings,
        eq(curriculumDesignVersions.offeringId, curriculumOfferings.id),
      )
      .innerJoin(curriculumProgrammes, eq(curriculumOfferings.programmeId, curriculumProgrammes.id))
      .innerJoin(
        curriculumFrameworks,
        eq(curriculumProgrammes.frameworkId, curriculumFrameworks.id),
      )
      .leftJoin(curriculumLevels, eq(curriculumOfferings.levelId, curriculumLevels.id))
      .innerJoin(curriculumSubjects, eq(curriculumOfferings.subjectId, curriculumSubjects.id))
      .where(inArray(curriculumTargetRevisions.id, targetRevisionIds))
  }

  design(id: string, executor: DbExecutor = this.database.db) {
    return executor
      .select()
      .from(curriculumDesignVersions)
      .where(eq(curriculumDesignVersions.id, id))
      .limit(1)
  }

  resourceForUpdate(id: string, executor: DbExecutor = this.database.db) {
    return executor
      .select()
      .from(libraryResources)
      .where(eq(libraryResources.id, id))
      .for('update')
      .limit(1)
  }

  latestResourceRevision(resourceId: string, executor: DbExecutor = this.database.db) {
    return executor
      .select()
      .from(libraryResourceRevisions)
      .where(eq(libraryResourceRevisions.resourceId, resourceId))
      .orderBy(desc(libraryResourceRevisions.revisionNumber))
      .limit(1)
  }

  createResource(
    values: {
      resourceType: typeof libraryResources.$inferInsert.resourceType
      title: string
      authority: typeof libraryResources.$inferInsert.authority
    },
    executor: DbExecutor = this.database.db,
  ) {
    return executor.insert(libraryResources).values(values).returning()
  }

  createResourceRevision(
    values: typeof libraryResourceRevisions.$inferInsert,
    executor: DbExecutor = this.database.db,
  ) {
    return executor.insert(libraryResourceRevisions).values(values).returning()
  }

  createChunks(
    values: (typeof libraryResourceChunks.$inferInsert)[],
    executor: DbExecutor = this.database.db,
  ) {
    return executor.insert(libraryResourceChunks).values(values).returning()
  }

  createSourceLink(
    values: typeof curriculumSourceLinks.$inferInsert,
    executor: DbExecutor = this.database.db,
  ) {
    return executor.insert(curriculumSourceLinks).values(values).returning()
  }

  sourceLinkForUpdate(id: string, executor: DbExecutor = this.database.db) {
    return executor
      .select()
      .from(curriculumSourceLinks)
      .where(eq(curriculumSourceLinks.id, id))
      .for('update')
      .limit(1)
  }

  resourceRevisionForUpdate(id: string, executor: DbExecutor = this.database.db) {
    return executor
      .select()
      .from(libraryResourceRevisions)
      .where(eq(libraryResourceRevisions.id, id))
      .for('update')
      .limit(1)
  }

  resource(id: string, executor: DbExecutor = this.database.db) {
    return executor.select().from(libraryResources).where(eq(libraryResources.id, id)).limit(1)
  }

  firstChunkForRevision(revisionId: string, executor: DbExecutor = this.database.db) {
    return executor
      .select()
      .from(libraryResourceChunks)
      .where(eq(libraryResourceChunks.resourceRevisionId, revisionId))
      .limit(1)
  }

  publishResourceRevision(id: string, publishedAt: Date, executor: DbExecutor = this.database.db) {
    return executor
      .update(libraryResourceRevisions)
      .set({ status: 'published', publishedAt })
      .where(eq(libraryResourceRevisions.id, id))
  }

  publishSourceLink(
    id: string,
    publishedBy: string,
    publishedAt: Date,
    executor: DbExecutor = this.database.db,
  ) {
    return executor
      .update(curriculumSourceLinks)
      .set({ status: 'published', publishedBy, publishedAt })
      .where(eq(curriculumSourceLinks.id, id))
  }

  async sourceRows(
    targetIds: string[],
    includeDraft: boolean,
    executor: DbExecutor = this.database.db,
  ) {
    if (!targetIds.length) return []

    const links = await executor.query.curriculumSourceLinks.findMany({
      columns: { id: true, targetRevisionId: true, role: true, status: true },
      where: {
        targetRevisionId: { in: targetIds },
        ...(!includeDraft
          ? { status: 'published', resourceRevision: { status: 'published' } }
          : {}),
      },
      with: {
        targetRevision: {
          columns: { id: true },
          with: {
            designVersion: {
              columns: { offeringId: true },
              with: {
                offering: {
                  columns: { id: true },
                  with: {
                    subject: { columns: { name: true } },
                    level: { columns: { label: true } },
                  },
                },
              },
            },
          },
        },
        resourceRevision: {
          columns: {
            id: true,
            revisionNumber: true,
            editionLabel: true,
            sourceUrl: true,
            status: true,
          },
          with: {
            resource: { columns: { id: true, resourceType: true, title: true, authority: true } },
            chunks: { columns: { id: true, locator: true, content: true } },
          },
        },
      },
    })

    return links.flatMap((link) =>
      link.resourceRevision.chunks.map((chunk) => ({
        linkId: link.id,
        targetRevisionId: link.targetRevisionId,
        role: link.role,
        linkStatus: link.status,
        documentId: link.resourceRevision.resource.id,
        resourceRevisionId: link.resourceRevision.id,
        revisionNumber: link.resourceRevision.revisionNumber,
        chunkId: chunk.id,
        resourceType: link.resourceRevision.resource.resourceType,
        title: link.resourceRevision.resource.title,
        authority: link.resourceRevision.resource.authority,
        editionLabel: link.resourceRevision.editionLabel,
        sourceUrl: link.resourceRevision.sourceUrl,
        subject: link.targetRevision.designVersion.offering.subject.name,
        grade: link.targetRevision.designVersion.offering.level?.label ?? null,
        locator: chunk.locator,
        content: chunk.content,
        revisionStatus: link.resourceRevision.status,
      })),
    )
  }

  sourceChunksForTarget(targetRevisionId: string, embedding: number[], limit: number) {
    const vectorText = `[${embedding.join(',')}]`
    const distance = sql<number>`${libraryResourceChunks.embedding} <=> ${vectorText}::vector`
    return this.database.db
      .select({
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
      })
      .from(curriculumSourceLinks)
      .innerJoin(
        libraryResourceRevisions,
        eq(curriculumSourceLinks.resourceRevisionId, libraryResourceRevisions.id),
      )
      .innerJoin(libraryResources, eq(libraryResourceRevisions.resourceId, libraryResources.id))
      .innerJoin(
        libraryResourceChunks,
        eq(libraryResourceChunks.resourceRevisionId, libraryResourceRevisions.id),
      )
      .where(
        and(
          eq(curriculumSourceLinks.targetRevisionId, targetRevisionId),
          eq(curriculumSourceLinks.status, 'published'),
          eq(libraryResourceRevisions.status, 'published'),
        ),
      )
      .orderBy(distance, asc(curriculumSourceLinks.role), asc(curriculumSourceLinks.id))
      .limit(limit)
  }

  async targetDefinitionChunks(targetRevisionId: string) {
    const sources = await this.sourceRows([targetRevisionId], false)
    return sources
      .filter(
        (source) =>
          source.role === 'defines_target' &&
          source.resourceType === 'curriculum_design' &&
          source.authority === 'official',
      )
      .map(
        ({
          linkId,
          documentId,
          resourceRevisionId,
          revisionNumber,
          chunkId,
          resourceType,
          title,
          authority,
          editionLabel,
          sourceUrl,
          locator,
          content,
          role,
          linkStatus,
          revisionStatus,
        }) => ({
          linkId,
          documentId,
          resourceRevisionId,
          revisionNumber,
          chunkId,
          resourceType,
          title,
          authority,
          editionLabel,
          sourceUrl,
          locator,
          content,
          role,
          linkStatus,
          revisionStatus,
        }),
      )
  }
}
