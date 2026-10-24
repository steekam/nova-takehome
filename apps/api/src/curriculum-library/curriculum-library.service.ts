import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { createHash } from 'node:crypto'
import {
  CurriculumLibraryOfferingDtoSchema,
  CurriculumLibraryResponseSchema,
  CurriculumLibraryTargetDtoSchema,
  CurriculumOutcomeDtoSchema,
  CurriculumSourceDtoSchema,
  type ApiPrincipal,
  type CurriculumHierarchyNodeDto,
  type CurriculumLibraryTargetDto,
  type CurriculumLibrarySourceInput,
  type CurriculumOutcomeDto,
  type CurriculumSourceDto,
} from '@nova/shared'
import { DatabaseService } from '../database/database.service'
import type { DbExecutor } from '../database/executor'
import { EmbeddingAdapter } from '../embeddings/embedding.service'
import { EmbeddingError } from '../embeddings/embedding.adapter'
import { CurriculumLibraryRepository } from './curriculum-library.repository'
import { authorize } from '../common/auth/policy'
import { CurriculumSourcePolicy } from '../common/auth/policies'

type SourceRow = Awaited<ReturnType<CurriculumLibraryRepository['catalogue']>>['sources'][number]

@Injectable()
export class CurriculumLibraryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: CurriculumLibraryRepository,
    private readonly embeddings: EmbeddingAdapter,
  ) {}

  async catalogue(principal: ApiPrincipal) {
    const offerings = await this.repository.catalogueSummary(
      new CurriculumSourcePolicy().viewDraft(principal),
    )
    return CurriculumLibraryResponseSchema.parse({ offerings })
  }

  async allSources(principal: ApiPrincipal) {
    const catalogue = await this.catalogueForVisibility(
      new CurriculumSourcePolicy().viewDraft(principal),
    )
    const unique = new Map<string, CurriculumSourceDto>()
    for (const target of catalogue.offerings.flatMap((offering) =>
      offering.designs.flatMap((design) => design.targets),
    )) {
      for (const source of target.sources)
        unique.set(`${source.documentId}:${source.chunkId}`, source)
    }
    return [...unique.values()]
  }

  private async catalogueForVisibility(
    includeDraft: boolean,
    offeringId?: string,
    designVersionId?: string,
    targetRevisionId?: string,
  ) {
    const data = await this.repository.catalogue(
      includeDraft,
      offeringId,
      designVersionId,
      targetRevisionId,
    )
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
      const linkedDefinitions = sourceRows.some(
        (source) =>
          source.role === 'defines_target' &&
          source.resourceType === 'curriculum_design' &&
          source.authority === 'official' &&
          source.linkStatus === 'published' &&
          source.revisionStatus === 'published',
      )
      const hierarchy: CurriculumHierarchyNodeDto[] = []
      let node = nodesById.get(target.nodeId)
      while (node) {
        hierarchy.unshift({
          id: node.id,
          kind: node.kind,
          code: node.code,
          label: node.label,
          sortOrder: node.sortOrder,
        })
        node = node.parentNodeId ? nodesById.get(node.parentNodeId) : undefined
      }
      targetDtos.set(
        target.id,
        CurriculumLibraryTargetDtoSchema.parse({
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
          sortOrder: target.sortOrder,
          hierarchy,
          sourceCount: new Set(sourceRows.map((source) => source.resourceRevisionId)).size,
          generationReady: design.status === 'published' && linkedDefinitions,
          sources: targetSources,
        }),
      )
    }

    const offerings = data.offerings.map((offering) =>
      CurriculumLibraryOfferingDtoSchema.parse({
        id: offering.id,
        frameworkId: offering.frameworkId,
        frameworkCode: offering.frameworkCode,
        framework: offering.framework,
        programmeId: offering.programmeId,
        programmeCode: offering.programmeCode,
        programme: offering.programme,
        levelId: offering.levelId,
        levelKind: offering.levelKind,
        levelCode: offering.levelCode,
        level: offering.level ?? 'All levels',
        subjectId: offering.subjectId,
        subjectCode: offering.subjectCode,
        subject: offering.subject,
        externalCode: offering.externalCode,
        designs: data.designs
          .filter((design) => design.offeringId === offering.id)
          .map((design) => ({
            id: design.id,
            editionLabel: design.editionLabel,
            revisionNumber: design.revisionNumber,
            publishedAt: design.publishedAt?.toISOString() ?? null,
            origin: design.origin,
            status: design.status,
            nodes: data.nodes
              .filter((node) => node.designVersionId === design.id)
              .map((node) => ({
                id: node.id,
                parentNodeId: node.parentNodeId,
                kind: node.kind,
                code: node.code,
                label: node.label,
                sortOrder: node.sortOrder,
              })),
            targets: data.targets
              .filter((target) => target.designVersionId === design.id)
              .flatMap((target) => targetDtos.get(target.id) ?? []),
          })),
      }),
    )

    return { offerings }
  }

  async target(targetRevisionId: string, principal: ApiPrincipal) {
    const includeDraft = new CurriculumSourcePolicy().viewDraft(principal)
    const [targetDesign] = await this.repository.targetDesign(targetRevisionId)
    if (!targetDesign) throw new NotFoundException('Curriculum target not found')
    const [design] = await this.repository.design(targetDesign.designVersionId)
    if (!design || (!includeDraft && design.status !== 'published'))
      throw new NotFoundException('Curriculum target not found')
    const catalogue = await this.catalogueForVisibility(
      includeDraft,
      design.offeringId,
      design.id,
      targetRevisionId,
    )
    const target = catalogue.offerings
      .flatMap((offering) => offering.designs.flatMap((design) => design.targets))
      .find((item) => item.id === targetRevisionId)
    if (!target) throw new NotFoundException('Curriculum target not found')
    return target
  }

  async design(designVersionId: string, principal: ApiPrincipal) {
    const includeDraft = new CurriculumSourcePolicy().viewDraft(principal)
    const [design] = await this.repository.design(designVersionId)
    if (!design || (!includeDraft && design.status !== 'published'))
      throw new NotFoundException('Curriculum edition not found')
    const catalogue = await this.catalogueForVisibility(includeDraft, design.offeringId, design.id)
    const offering = catalogue.offerings[0]
    if (!offering?.designs.length) throw new NotFoundException('Curriculum edition not found')
    return CurriculumLibraryOfferingDtoSchema.parse(offering)
  }

  async outcomes(): Promise<CurriculumOutcomeDto[]> {
    const catalogue = await this.catalogueForVisibility(false)
    return catalogue.offerings
      .flatMap((offering) => offering.designs.flatMap((design) => design.targets))
      .filter((target) => target.generationReady)
      .map(toCurriculumOutcome)
  }

  async outcomeForGeneration(targetRevisionId: string): Promise<CurriculumOutcomeDto> {
    const [targetDesign] = await this.repository.targetDesign(targetRevisionId)
    if (!targetDesign) throw new NotFoundException('Curriculum target not found')
    const [design] = await this.repository.design(targetDesign.designVersionId)
    if (!design || design.status !== 'published')
      throw new NotFoundException('Curriculum target not found')
    const catalogue = await this.catalogueForVisibility(
      false,
      design.offeringId,
      design.id,
      targetRevisionId,
    )
    const target = catalogue.offerings[0]?.designs[0]?.targets[0]
    if (!target) throw new NotFoundException('Curriculum target not found')
    if (!target.generationReady)
      throw new BadRequestException({
        code: 'CURRICULUM_SOURCES_MISSING',
        message:
          'This curriculum target has no published source that defines it. Choose a source-backed target or ask a curriculum lead to add sources.',
      })
    return toCurriculumOutcome(target)
  }

  targetContexts(targetRevisionIds: string[]) {
    return this.repository.targetContexts(targetRevisionIds)
  }

  async sourceChunksForGeneration(
    targetRevisionId: string,
    embedding: number[],
    subject: string,
    grade: string,
  ) {
    const [candidates, targetDefinitions] = await Promise.all([
      this.repository.sourceChunksForTarget(targetRevisionId, embedding, 20),
      this.repository.targetDefinitionChunks(targetRevisionId),
    ])
    if (!targetDefinitions.length)
      throw new BadRequestException({
        code: 'CURRICULUM_SOURCES_MISSING',
        message:
          'The selected target needs a published official curriculum design excerpt that defines it.',
      })
    const selected = new Map<string, (typeof targetDefinitions)[number]>()
    for (const source of targetDefinitions) selected.set(source.chunkId, source)
    let supportingCount = 0
    for (const source of candidates) {
      if (selected.has(source.chunkId)) continue
      if (supportingCount === 6) break
      selected.set(source.chunkId, source)
      supportingCount += 1
    }
    return [...selected.values()].map((source) =>
      CurriculumSourceDtoSchema.parse({
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
      }),
    )
  }

  async sourceDetailsForTargets(
    targetRevisionIds: string[],
    includeDraft: boolean,
    executor: DbExecutor = this.database.db,
  ) {
    if (targetRevisionIds.length === 0) return []
    const rows = await this.repository.sourceRows(targetRevisionIds, includeDraft, executor)
    return rows.map((source) => CurriculumSourceDtoSchema.parse(toSourceDto(source)))
  }

  async sourceDetailsForTarget(targetRevisionId: string, executor: DbExecutor = this.database.db) {
    return this.sourceDetailsForTargets([targetRevisionId], true, executor)
  }

  async addSource(
    targetRevisionId: string,
    input: CurriculumLibrarySourceInput,
    principal: ApiPrincipal,
  ) {
    const [target] = await this.repository.targetDesign(targetRevisionId)
    if (!target) throw new NotFoundException('Curriculum target not found')
    await authorize(principal, new CurriculumSourcePolicy(), 'add')
    const [design] = await this.repository.design(target.designVersionId)
    if (!design || design.status !== 'published')
      throw new BadRequestException({
        code: 'CURRICULUM_DESIGN_NOT_PUBLISHED',
        message: 'Sources can only be linked to a published curriculum design.',
      })

    const chunks = splitContent(input.content)
    const vectors = await Promise.all(chunks.map((chunk) => this.embedDocument(chunk.content)))
    const contentHash = createHash('sha256').update(input.content).digest('hex')
    const [created] = await this.database.db.transaction(async (tx) => {
      let resourceId = input.resourceId
      let revisionNumber = 1
      if (resourceId) {
        const [resource] = await this.repository.resourceForUpdate(resourceId, tx)
        if (!resource) throw new NotFoundException('Source resource not found')
        if (
          resource.resourceType !== input.resourceType ||
          resource.title !== input.title ||
          resource.authority !== input.authority
        ) {
          throw new BadRequestException({
            code: 'SOURCE_RESOURCE_IDENTITY_IMMUTABLE',
            message: 'A source revision must keep the resource title, type, and authority.',
          })
        }
        const [latestRevision] = await this.repository.latestResourceRevision(resourceId, tx)
        revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1
      } else {
        const [resource] = await this.repository.createResource(
          {
            resourceType: input.resourceType,
            title: input.title,
            authority: input.authority,
          },
          tx,
        )
        resourceId = resource.id
      }
      const [revision] = await this.repository.createResourceRevision(
        {
          resourceId,
          revisionNumber,
          editionLabel: input.editionLabel,
          sourceUrl: input.sourceUrl,
          contentHash,
          content: input.content,
          status: 'draft',
          createdBy: principal.subject,
        },
        tx,
      )
      await this.repository.createChunks(
        chunks.map((chunk, index) => ({
          resourceRevisionId: revision.id,
          ordinal: index,
          locator: input.locator ?? `Text ${index + 1}`,
          content: chunk.content,
          embedding: vectors[index],
        })),
        tx,
      )
      const [link] = await this.repository.createSourceLink(
        {
          targetRevisionId,
          resourceRevisionId: revision.id,
          role: input.role,
          status: 'draft',
          addedBy: principal.subject,
        },
        tx,
      )
      return [link]
    })
    return { linkId: created.id, targetRevisionId, status: created.status }
  }

  async publishSource(linkId: string, principal: ApiPrincipal) {
    return this.database.db.transaction(async (tx) => {
      const [link] = await this.repository.sourceLinkForUpdate(linkId, tx)
      if (!link) throw new NotFoundException('Source link not found')
      await authorize(principal, new CurriculumSourcePolicy(), 'publish')
      if (link.status !== 'draft')
        throw new ConflictException({
          code: 'SOURCE_LINK_TRANSITION_INVALID',
          message: 'Only a draft source link can be published.',
        })
      const [revision] = await this.repository.resourceRevisionForUpdate(
        link.resourceRevisionId,
        tx,
      )
      if (!revision) throw new NotFoundException('Source revision not found')
      const [resource] = await this.repository.resource(revision.resourceId, tx)
      if (!resource) throw new NotFoundException('Source resource not found')
      const [chunk] = await this.repository.firstChunkForRevision(revision.id, tx)
      if (!chunk)
        throw new BadRequestException({
          code: 'SOURCE_HAS_NO_CHUNKS',
          message: 'Add readable source text before publishing this source.',
        })
      if (
        link.role === 'defines_target' &&
        (resource.resourceType !== 'curriculum_design' ||
          resource.authority !== 'official' ||
          !revision.editionLabel ||
          !revision.sourceUrl ||
          !chunk.locator)
      ) {
        throw new BadRequestException({
          code: 'TARGET_SOURCE_PROVENANCE_REQUIRED',
          message:
            'A target-defining source needs official curriculum-design metadata, edition, URL, and source locator before publishing.',
        })
      }

      const publishedAt = new Date()
      await this.repository.publishResourceRevision(revision.id, publishedAt, tx)
      await this.repository.publishSourceLink(link.id, principal.subject, publishedAt, tx)
      return {
        linkId: link.id,
        targetRevisionId: link.targetRevisionId,
        status: 'published' as const,
      }
    })
  }

  private async embedDocument(content: string) {
    try {
      return await this.embeddings.embedDocument(content)
    } catch (error) {
      if (error instanceof EmbeddingError)
        throw new ServiceUnavailableException({ code: error.code, message: error.message })
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
    status:
      source.linkStatus === 'retired' || source.revisionStatus === 'retired'
        ? 'retired'
        : source.linkStatus === 'published' && source.revisionStatus === 'published'
          ? 'published'
          : 'draft',
  }
}

function toCurriculumOutcome(target: CurriculumLibraryTargetDto): CurriculumOutcomeDto {
  return CurriculumOutcomeDtoSchema.parse({
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
  })
}

function splitContent(content: string) {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
  const chunks: Array<{ content: string }> = []
  for (const paragraph of paragraphs) {
    for (let start = 0; start < paragraph.length; start += 1200)
      chunks.push({ content: paragraph.slice(start, start + 1200) })
  }
  return chunks
}
