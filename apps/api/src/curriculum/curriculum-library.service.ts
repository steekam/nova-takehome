import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import {
  CurriculumLibraryOfferingDtoSchema,
  CurriculumLibraryTargetDtoSchema,
  CurriculumOutcomeDtoSchema,
  CurriculumSourceDtoSchema,
  type ApiPrincipal,
  type CurriculumLibrarySourceInput,
  type CurriculumOutcomeDto,
  type CurriculumSourceDto,
} from '@nova/shared'
import { DatabaseService } from '../database/database.service'
import type { DbExecutor } from '../database/executor'
import {
  curriculumDesignVersions,
  curriculumSourceLinks,
  curriculumTargetRevisions,
  libraryResourceChunks,
  libraryResourceRevisions,
  libraryResources,
} from '../database/schema'
import { EmbeddingAdapter } from './embedding.service'
import { EmbeddingError } from './embedding.adapter'
import { CurriculumLibraryRepository } from './curriculum-library.repository'

type SourceRow = Awaited<ReturnType<CurriculumLibraryRepository['catalogue']>>['sources'][number]

@Injectable()
export class CurriculumLibraryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: CurriculumLibraryRepository,
    private readonly embeddings: EmbeddingAdapter,
  ) {}

  async catalogue(principal: ApiPrincipal) {
    return this.catalogueForVisibility(principal.roles.includes('curriculum_lead'))
  }

  async allSources(principal: ApiPrincipal) {
    const catalogue = await this.catalogue(principal)
    const unique = new Map<string, CurriculumSourceDto>()
    for (const target of catalogue.offerings.flatMap((offering) => offering.designs.flatMap((design) => design.targets))) {
      for (const source of target.sources) unique.set(`${source.documentId}:${source.chunkId}`, source)
    }
    for (const legacy of await this.repository.legacySources()) {
      const source = CurriculumSourceDtoSchema.parse({
        linkId: null,
        documentId: legacy.documentId,
        resourceRevisionId: legacy.documentId,
        revisionNumber: 1,
        chunkId: legacy.chunkId,
        resourceType: legacy.documentType === 'learning_outcome' ? 'curriculum_design' : legacy.documentType,
        title: legacy.title,
        subject: legacy.subject,
        grade: legacy.grade,
        content: legacy.content,
        authority: 'synthetic',
        editionLabel: 'Legacy import',
        sourceUrl: null,
        locator: null,
        synthetic: true,
        role: legacy.documentType === 'learning_outcome' ? 'defines_target' : legacy.documentType === 'assessment_item' ? 'assessment_support' : 'teaching_support',
        status: 'published',
      })
      unique.set(`${source.documentId}:${source.chunkId}`, source)
    }
    return [...unique.values()]
  }

  private async catalogueForVisibility(includeDraft: boolean) {
    const data = await this.repository.catalogue(includeDraft)
    const sourcesByTarget = new Map<string, SourceRow[]>()
    for (const source of data.sources) {
      const sources = sourcesByTarget.get(source.targetRevisionId) ?? []
      sources.push(source)
      sourcesByTarget.set(source.targetRevisionId, sources)
    }
    const nodesById = new Map(data.nodes.map((node) => [node.id, node]))
    const targetDtos = new Map<string, ReturnType<typeof CurriculumLibraryTargetDtoSchema.parse>>()

    for (const target of data.targets) {
      const design = data.designs.find((candidate) => candidate.id === target.designVersionId)
      const offering = data.offerings.find((candidate) => candidate.id === design?.offeringId)
      if (!design || !offering) continue
      const sourceRows = sourcesByTarget.get(target.id) ?? []
      const targetSources = sourceRows.map((source) => toSourceDto(source))
      const linkedDefinitions = sourceRows.some((source) => source.role === 'defines_target' && source.resourceType === 'curriculum_design' && source.authority === 'official' && source.linkStatus === 'published' && source.revisionStatus === 'published')
      const path: string[] = []
      let node = nodesById.get(target.nodeId)
      while (node) {
        path.unshift(node.label)
        node = node.parentNodeId ? nodesById.get(node.parentNodeId) : undefined
      }
      targetDtos.set(target.id, CurriculumLibraryTargetDtoSchema.parse({
        id: target.id,
        designVersionId: target.designVersionId,
        offeringId: offering.id,
        framework: offering.framework,
        programme: offering.programme,
        level: offering.level ?? 'All levels',
        subject: offering.subject,
        editionLabel: design.editionLabel,
        origin: design.origin,
        kind: target.kind,
        title: target.title,
        statement: target.statement,
        locator: target.sourceLocator,
        path,
        sourceCount: new Set(sourceRows.map((source) => source.resourceRevisionId)).size,
        generationReady: design.status === 'published' && linkedDefinitions,
        sources: targetSources,
      }))
    }

    const offerings = data.offerings.map((offering) => CurriculumLibraryOfferingDtoSchema.parse({
      id: offering.id,
      framework: offering.framework,
      programme: offering.programme,
      level: offering.level ?? 'All levels',
      subject: offering.subject,
      externalCode: offering.externalCode,
      designs: data.designs.filter((design) => design.offeringId === offering.id).map((design) => ({
        id: design.id,
        editionLabel: design.editionLabel,
        revisionNumber: design.revisionNumber,
        origin: design.origin,
        status: design.status,
        targets: data.targets.filter((target) => target.designVersionId === design.id)
          .flatMap((target) => targetDtos.get(target.id) ?? []),
      })),
    }))

    return { offerings }
  }

  async target(targetRevisionId: string, principal: ApiPrincipal) {
    const catalogue = await this.catalogue(principal)
    const target = catalogue.offerings.flatMap((offering) => offering.designs.flatMap((design) => design.targets))
      .find((item) => item.id === targetRevisionId)
    if (!target) throw new NotFoundException('Curriculum target not found')
    return target
  }

  async outcomes(): Promise<CurriculumOutcomeDto[]> {
    const catalogue = await this.catalogueForVisibility(false)
    return catalogue.offerings.flatMap((offering) => offering.designs.flatMap((design) => design.targets))
      .filter((target) => target.generationReady)
      .map((target) => CurriculumOutcomeDtoSchema.parse({
        id: target.id,
        designVersionId: target.designVersionId,
        offeringId: target.offeringId,
        kind: target.kind,
        title: target.title,
        subject: target.subject,
        grade: target.level,
        programme: target.programme,
        framework: target.framework,
        editionLabel: target.editionLabel,
        locator: target.locator,
        content: target.statement,
        sourceCount: target.sourceCount,
        generationReady: target.generationReady,
      }))
  }

  async outcomeForGeneration(targetRevisionId: string): Promise<CurriculumOutcomeDto> {
    const outcomes = await this.outcomes()
    const outcome = outcomes.find((item) => item.id === targetRevisionId)
    if (!outcome) {
      const catalogue = await this.catalogueForVisibility(false)
      const exists = catalogue.offerings.flatMap((offering) => offering.designs.flatMap((design) => design.targets))
        .some((target) => target.id === targetRevisionId)
      if (exists) throw new BadRequestException({ code: 'CURRICULUM_SOURCES_MISSING', message: 'This curriculum target has no published source that defines it. Choose a source-backed target or ask a curriculum lead to add sources.' })
      throw new NotFoundException('Curriculum target not found')
    }
    return outcome
  }

  async sourceChunksForGeneration(targetRevisionId: string, embedding: number[], subject: string, grade: string) {
    const [candidates, targetDefinitions] = await Promise.all([
      this.repository.sourceChunksForTarget(targetRevisionId, embedding, 20),
      this.repository.targetDefinitionChunks(targetRevisionId),
    ])
    if (!targetDefinitions.length) throw new BadRequestException({ code: 'CURRICULUM_SOURCES_MISSING', message: 'The selected target needs a published official curriculum design excerpt that defines it.' })
    const selected = new Map<string, (typeof targetDefinitions)[number]>()
    for (const source of targetDefinitions) selected.set(source.chunkId, source)
    let supportingCount = 0
    for (const source of candidates) {
      if (selected.has(source.chunkId)) continue
      if (supportingCount === 6) break
      selected.set(source.chunkId, source)
      supportingCount += 1
    }
    return [...selected.values()].map((source) => CurriculumSourceDtoSchema.parse({
      linkId: source.linkId,
      documentId: source.documentId,
      resourceRevisionId: source.resourceRevisionId,
      revisionNumber: source.revisionNumber,
      chunkId: source.chunkId,
      resourceType: source.resourceType,
      title: source.title,
      subject,
      grade,
      content: source.content,
      authority: source.authority,
      editionLabel: source.editionLabel,
      sourceUrl: source.sourceUrl,
      locator: source.locator,
      synthetic: source.authority === 'synthetic',
      role: source.role,
      status: source.linkStatus,
    }))
  }

  async sourceDetailsForTargets(targetRevisionIds: string[], includeDraft: boolean, executor: DbExecutor = this.database.db) {
    if (targetRevisionIds.length === 0) return []
    const rows = await this.repository.sourceRows(targetRevisionIds, includeDraft, executor)
    return rows.map((source) => CurriculumSourceDtoSchema.parse(toSourceDto(source)))
  }

  async sourceDetailsForTarget(targetRevisionId: string, executor: DbExecutor = this.database.db) {
    return this.sourceDetailsForTargets([targetRevisionId], true, executor)
  }

  async addSource(targetRevisionId: string, input: CurriculumLibrarySourceInput, principal: ApiPrincipal) {
    const [target] = await this.database.db.select({ designVersionId: curriculumTargetRevisions.designVersionId })
      .from(curriculumTargetRevisions).where(eq(curriculumTargetRevisions.id, targetRevisionId)).limit(1)
    if (!target) throw new NotFoundException('Curriculum target not found')
    const [design] = await this.database.db.select().from(curriculumDesignVersions)
      .where(eq(curriculumDesignVersions.id, target.designVersionId)).limit(1)
    if (!design || design.status !== 'published') throw new BadRequestException({ code: 'CURRICULUM_DESIGN_NOT_PUBLISHED', message: 'Sources can only be linked to a published curriculum design.' })

    const chunks = splitContent(input.content)
    const vectors = await Promise.all(chunks.map((chunk) => this.embedDocument(chunk.content)))
    const contentHash = createHash('sha256').update(input.content).digest('hex')
    const [created] = await this.database.db.transaction(async (tx) => {
      let resourceId = input.resourceId
      let revisionNumber = 1
      if (resourceId) {
        const [resource] = await tx.select().from(libraryResources).where(eq(libraryResources.id, resourceId)).for('update').limit(1)
        if (!resource) throw new NotFoundException('Source resource not found')
        if (resource.resourceType !== input.resourceType || resource.title !== input.title || resource.authority !== input.authority) {
          throw new BadRequestException({ code: 'SOURCE_RESOURCE_IDENTITY_IMMUTABLE', message: 'A source revision must keep the resource title, type, and authority.' })
        }
        const [latestRevision] = await tx.select().from(libraryResourceRevisions)
          .where(eq(libraryResourceRevisions.resourceId, resourceId)).orderBy(desc(libraryResourceRevisions.revisionNumber)).limit(1)
        revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1
      } else {
        const [resource] = await tx.insert(libraryResources).values({
          resourceType: input.resourceType,
          title: input.title,
          authority: input.authority,
        }).returning()
        resourceId = resource.id
      }
      const [revision] = await tx.insert(libraryResourceRevisions).values({
        resourceId,
        revisionNumber,
        editionLabel: input.editionLabel,
        sourceUrl: input.sourceUrl,
        contentHash,
        content: input.content,
        status: 'draft',
        createdBy: principal.subject,
      }).returning()
      await tx.insert(libraryResourceChunks).values(chunks.map((chunk, index) => ({
        resourceRevisionId: revision.id,
        ordinal: index,
        locator: input.locator ?? `Text ${index + 1}`,
        content: chunk.content,
        embedding: vectors[index],
      })))
      const [link] = await tx.insert(curriculumSourceLinks).values({
        targetRevisionId,
        resourceRevisionId: revision.id,
        role: input.role,
        status: 'draft',
        addedBy: principal.subject,
      }).returning()
      return [link]
    })
    return { linkId: created.id, targetRevisionId, status: created.status }
  }

  async publishSource(linkId: string, principal: ApiPrincipal) {
    return this.database.db.transaction(async (tx) => {
      const [link] = await tx.select().from(curriculumSourceLinks)
        .where(eq(curriculumSourceLinks.id, linkId)).for('update').limit(1)
      if (!link) throw new NotFoundException('Source link not found')
      if (link.status !== 'draft') throw new ConflictException({ code: 'SOURCE_LINK_TRANSITION_INVALID', message: 'Only a draft source link can be published.' })
      const [revision] = await tx.select().from(libraryResourceRevisions)
        .where(eq(libraryResourceRevisions.id, link.resourceRevisionId)).for('update').limit(1)
      if (!revision) throw new NotFoundException('Source revision not found')
      const [resource] = await tx.select().from(libraryResources).where(eq(libraryResources.id, revision.resourceId)).limit(1)
      if (!resource) throw new NotFoundException('Source resource not found')
      const [chunk] = await tx.select().from(libraryResourceChunks)
        .where(eq(libraryResourceChunks.resourceRevisionId, revision.id)).limit(1)
      if (!chunk) throw new BadRequestException({ code: 'SOURCE_HAS_NO_CHUNKS', message: 'Add readable source text before publishing this source.' })
      if (link.role === 'defines_target' && (resource.resourceType !== 'curriculum_design' || resource.authority !== 'official' || !revision.editionLabel || !revision.sourceUrl || !chunk.locator)) {
        throw new BadRequestException({ code: 'TARGET_SOURCE_PROVENANCE_REQUIRED', message: 'A target-defining source needs official curriculum-design metadata, edition, URL, and source locator before publishing.' })
      }

      const publishedAt = new Date()
      await tx.update(libraryResourceRevisions).set({ status: 'published', publishedAt }).where(eq(libraryResourceRevisions.id, revision.id))
      await tx.update(curriculumSourceLinks).set({ status: 'published', publishedBy: principal.subject, publishedAt })
        .where(eq(curriculumSourceLinks.id, link.id))
      return { linkId: link.id, targetRevisionId: link.targetRevisionId, status: 'published' as const }
    })
  }

  private async embedDocument(content: string) {
    try {
      return await this.embeddings.embedDocument(content)
    } catch (error) {
      if (error instanceof EmbeddingError) throw new ServiceUnavailableException({ code: error.code, message: error.message })
      throw error
    }
  }
}

function toSourceDto(source: SourceRow): CurriculumSourceDto {
  return {
    linkId: source.linkId,
    documentId: source.documentId,
    resourceRevisionId: source.resourceRevisionId,
    revisionNumber: source.revisionNumber,
    chunkId: source.chunkId,
    resourceType: source.resourceType,
    title: source.title,
    subject: source.subject,
    grade: source.grade ?? 'All levels',
    content: source.content,
    authority: source.authority,
    editionLabel: source.editionLabel,
    sourceUrl: source.sourceUrl,
    locator: source.locator,
    synthetic: source.authority === 'synthetic',
    role: source.role,
    status: source.linkStatus === 'retired' || source.revisionStatus === 'retired'
      ? 'retired'
      : source.linkStatus === 'published' && source.revisionStatus === 'published' ? 'published' : 'draft',
  }
}

function splitContent(content: string) {
  const paragraphs = content.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
  const chunks: Array<{ content: string }> = []
  for (const paragraph of paragraphs) {
    for (let start = 0; start < paragraph.length; start += 1200) chunks.push({ content: paragraph.slice(start, start + 1200) })
  }
  return chunks
}
