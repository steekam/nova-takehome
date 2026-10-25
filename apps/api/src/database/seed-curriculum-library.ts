import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Pool, PoolClient } from 'pg'
import {
  createEmbeddingEncoder,
  EMBEDDING_PIPELINE_VERSION,
  type EmbeddingSettings,
} from '../embeddings/embedding.adapter'
import { parseMarkdownSource } from '../curriculum-library/source-ingestion'

const officialOutcomeSourceKey = 'ke-kicd-junior-g8-integrated-science-2024-07-official-outcomes'
const expectedOutcomeCounts: Record<string, number> = {
  '1.1': 5,
  '1.2': 5,
  '1.3': 4,
  '2.1': 5,
  '2.2': 4,
  '2.3': 6,
  '3.1': 5,
  '3.2': 3,
}

type ParsedSource = ReturnType<typeof parseMarkdownSource>
type PreparedSource = {
  parsed: ParsedSource
  contentHash: string
  pipelineFingerprint: string
  embeddings: number[][] | undefined
  revisionId: string | undefined
  unchanged: boolean
}
type Outcome = {
  code: string
  statement: string
  strandCode: string
  strandLabel: string
  subStrandCode: string
  subStrandLabel: string
  printedPageStart: number
  printedPageEnd: number
  pdfPageStart: number
  pdfPageEnd: number
}

export async function seedCurriculumLibrary(pool: Pool, creatorId: string) {
  const corpusDirectory = resolve(
    process.cwd(),
    '../../corpus/grade-8-integrated-science',
  )
  const files = await markdownFiles(corpusDirectory)
  const parsedSources = await Promise.all(
    files.map(async (path) => parseMarkdownSource(await readFile(path, 'utf8'))),
  )
  const sourceKeys = parsedSources.map((source) => source.sourceKey)
  if (new Set(sourceKeys).size !== sourceKeys.length) throw new Error('Corpus source keys must be unique.')
  const officialSource = parsedSources.find((source) => source.sourceKey === officialOutcomeSourceKey)
  if (!officialSource) throw new Error(`Missing official curriculum source: ${officialOutcomeSourceKey}`)
  const outcomes = officialOutcomes(officialSource)
  const expectedCodes = expectedOutcomeCodes()
  const outcomeCodes = outcomes.map((outcome) => outcome.code).sort()
  if (outcomeCodes.length !== new Set(outcomeCodes).size || outcomeCodes.join() !== expectedCodes.join())
    throw new Error('The official Grade 8 Integrated Science source must contain the complete 37-outcome set.')

  const settings = embeddingSettings()
  const embeddingModel = [
    settings.provider,
    settings.model,
    settings.revision,
    settings.dimensions,
    EMBEDDING_PIPELINE_VERSION,
  ].join(':')
  const staged = parsedSources.map((parsed) => prepareSource(parsed, embeddingModel))
  const existing = await latestRevisions(pool, staged)
  const encode = createEmbeddingEncoder(settings)
  for (const source of staged) {
    const previous = existing.get(source.parsed.sourceKey)
    source.revisionId = previous?.id
    source.unchanged = previous?.pipelineFingerprint === source.pipelineFingerprint
    if (!source.unchanged)
      source.embeddings = await Promise.all(
        source.parsed.chunks.map((chunk) => encode('document', chunk.content)),
      )
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const offeringId = await ensureOffering(client)
    const official = staged.find((source) => source.parsed.sourceKey === officialOutcomeSourceKey)!
    const officialRevisionId = await ensureResourceRevision(client, official, creatorId, embeddingModel)
    const designVersionId = await ensureDesign(client, offeringId, officialRevisionId)
    const targetIds = await ensureTargets(client, designVersionId, outcomes)
    await retireSupersededDesigns(client, offeringId, designVersionId)
    await retireUnseededTargets(client, designVersionId, [...targetIds.values()])
    await reconcileSourceLinks(client, officialRevisionId, 'defines_target', [...targetIds.values()])

    const resourceRevisionIds = new Map<string, string>([[officialOutcomeSourceKey, officialRevisionId]])
    for (const source of staged) {
      if (source.parsed.sourceKey === officialOutcomeSourceKey) continue
      resourceRevisionIds.set(
        source.parsed.sourceKey,
        await ensureResourceRevision(client, source, creatorId, embeddingModel),
      )
    }

    for (const outcome of outcomes) {
      const targetId = targetIds.get(outcome.code)
      if (!targetId) throw new Error(`Missing seeded curriculum target ${outcome.code}`)
      await ensurePublishedLink(client, targetId, officialRevisionId, 'defines_target', creatorId)
      await client.query(
        `update curriculum_source_links
         set status = 'retired'
         where target_revision_id = $1 and role = 'defines_target'
           and resource_revision_id <> $2 and status = 'published'`,
        [targetId, officialRevisionId],
      )
    }

    for (const source of staged) {
      if (source.parsed.sourceKey === officialOutcomeSourceKey) continue
      const revisionId = resourceRevisionIds.get(source.parsed.sourceKey)
      if (!revisionId) throw new Error(`Missing source revision ${source.parsed.sourceKey}`)
      const targetCodes = new Set(
        source.parsed.chunks.flatMap((chunk) => chunk.metadata.outcomeCodes ?? []),
      )
      const linkedTargetIds = [...targetCodes]
        .map((code) => targetIds.get(code))
        .filter((targetId): targetId is string => targetId !== undefined)
      await reconcileSourceLinks(client, revisionId, source.parsed.role, linkedTargetIds)
      for (const code of targetCodes) {
        const targetId = targetIds.get(code)
        if (targetId)
          await ensurePublishedLink(client, targetId, revisionId, source.parsed.role, creatorId)
      }
    }

    await client.query('COMMIT')
    return { documents: staged.length, outcomes: outcomes.length }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

function officialOutcomes(source: ParsedSource): Outcome[] {
  return source.chunks
    .filter((chunk) => chunk.metadata.kind === 'outcome')
    .map((chunk) => {
      const code = chunk.metadata.outcomeCodes?.[0]
      if (!code || chunk.metadata.outcomeCodes?.length !== 1)
        throw new Error('Each official curriculum chunk must define exactly one outcome code.')
      const path = chunk.metadata.headingPath ?? []
      const strand = path.find((heading) => /^Strand \d+/.test(heading))
      const subStrand = path.find((heading) => /^Sub-strand \d+\.\d+/.test(heading))
      const line = chunk.content
        .split('\n')
        .find((candidate) => candidate.trimStart().startsWith(`- ${code} `))
      if (!strand || !subStrand || !line)
        throw new Error(`Could not read hierarchy or statement for ${code}.`)
      const statement = line
        .trim()
        .replace(new RegExp(`^-\\s*${escapeRegExp(code)}\\s+`), '')
        .replace(/\s+\[KICD source:.*\]\s*$/, '')
        .trim()
      const pages = chunk.metadata
      if (
        !pages.printedPageStart ||
        !pages.printedPageEnd ||
        !pages.pdfPageStart ||
        !pages.pdfPageEnd
      )
        throw new Error(`Missing exact KICD page locators for ${code}.`)
      const strandMatch = strand.match(/^Strand (\d+)\s*[—–-]\s*(.+)$/)
      const subStrandMatch = subStrand.match(/^Sub-strand (\d+\.\d+)\s*[—–-]\s*(.+)$/)
      if (!strandMatch || !subStrandMatch)
        throw new Error(`Invalid KICD hierarchy headings for ${code}.`)
      return {
        code,
        statement,
        strandCode: strandMatch[1],
        strandLabel: strandMatch[2],
        subStrandCode: subStrandMatch[1],
        subStrandLabel: subStrandMatch[2],
        printedPageStart: pages.printedPageStart,
        printedPageEnd: pages.printedPageEnd,
        pdfPageStart: pages.pdfPageStart,
        pdfPageEnd: pages.pdfPageEnd,
      }
    })
}

function prepareSource(parsed: ParsedSource, embeddingModel: string): PreparedSource {
  const chunks = parsed.chunks.map((chunk) => ({
    content: chunk.content.trim(),
    locator: chunk.locator || '',
    metadata: chunk.metadata,
  }))
  const fingerprintPayload = {
    title: parsed.title,
    resourceType: parsed.resourceType,
    authority: parsed.authority,
    editionLabel: parsed.editionLabel ?? null,
    sourceUrl: parsed.sourceUrl ?? null,
    sourceLocator: parsed.locator ?? null,
    resourceMetadata: parsed.resourceMetadata,
    role: parsed.role,
    sourceFormat: parsed.sourceFormat,
    parserVersion: parsed.parserVersion,
    chunkerVersion: parsed.chunkerVersion,
    embeddingModel,
    content: parsed.content,
    chunks,
  }
  return {
    parsed,
    contentHash: createHash('sha256').update(parsed.content).digest('hex'),
    pipelineFingerprint: createHash('sha256')
      .update(JSON.stringify(stableValue(fingerprintPayload)))
      .digest('hex'),
    embeddings: undefined,
    revisionId: undefined,
    unchanged: false,
  }
}

async function latestRevisions(pool: Pool, sources: PreparedSource[]) {
  const result = new Map<string, { id: string; pipelineFingerprint: string }>()
  for (const source of sources) {
    const rows = await pool.query<{ id: string; pipeline_fingerprint: string }>(
      `select rr.id, rr.pipeline_fingerprint
       from library_resources r
       join library_resource_revisions rr on rr.resource_id = r.id
       where r.source_key = $1
       order by rr.revision_number desc
       limit 1`,
      [source.parsed.sourceKey],
    )
    if (rows.rows[0])
      result.set(source.parsed.sourceKey, {
        id: rows.rows[0].id,
        pipelineFingerprint: rows.rows[0].pipeline_fingerprint,
      })
  }
  return result
}

async function ensureOffering(client: PoolClient) {
  const framework = await upsertReturning<{ id: string }>(
    client,
    `insert into curriculum_frameworks (code, name, authority)
     values ('KE-KICD', 'Kenya Competency-Based Curriculum', 'Kenya Institute of Curriculum Development')
     on conflict (code) do update set name = excluded.name, authority = excluded.authority
     returning id`,
  )
  const programme = await upsertReturning<{ id: string }>(
    client,
    `insert into curriculum_programmes (framework_id, code, name, sort_order)
     values ($1, 'JUNIOR-SCHOOL', 'Junior School', 1)
     on conflict (framework_id, code) do update set name = excluded.name
     returning id`,
    [framework.id],
  )
  const level = await upsertReturning<{ id: string }>(
    client,
    `insert into curriculum_levels (programme_id, kind, code, label, sort_order)
     values ($1, 'grade', '8', 'Grade 8', 8)
     on conflict (programme_id, code) do update set kind = excluded.kind, label = excluded.label
     returning id`,
    [programme.id],
  )
  const subject = await upsertReturning<{ id: string }>(
    client,
    `insert into curriculum_subjects (framework_id, code, name)
     values ($1, 'INTEGRATED-SCIENCE', 'Integrated Science')
     on conflict (framework_id, code) do update set name = excluded.name
     returning id`,
    [framework.id],
  )
  const offering = await upsertReturning<{ id: string }>(
    client,
    `insert into curriculum_offerings (programme_id, level_id, subject_id)
     values ($1, $2, $3)
     on conflict (programme_id, level_id, subject_id) do update set subject_id = excluded.subject_id
     returning id`,
    [programme.id, level.id, subject.id],
  )
  return offering.id
}

async function ensureDesign(client: PoolClient, offeringId: string, sourceRevisionId: string) {
  const row = await upsertReturning<{ id: string }>(
    client,
    `insert into curriculum_design_versions
       (offering_id, source_resource_revision_id, edition_label, revision_number, origin, status, published_at)
     values ($1, $2, 'July 2024 · Revision 1', 1, 'official_import', 'published', now())
     on conflict (offering_id, edition_label, revision_number) do update
       set source_resource_revision_id = excluded.source_resource_revision_id,
           origin = 'official_import', status = 'published',
           published_at = coalesce(curriculum_design_versions.published_at, excluded.published_at)
     returning id`,
    [offeringId, sourceRevisionId],
  )
  return row.id
}

async function retireSupersededDesigns(client: PoolClient, offeringId: string, designVersionId: string) {
  const retired = await client.query<{ id: string }>(
    `update curriculum_design_versions
     set status = 'retired'
     where offering_id = $1 and id <> $2
       and edition_label like 'July 2024%' and status = 'published'
     returning id`,
    [offeringId, designVersionId],
  )
  if (!retired.rowCount) return
  await client.query(
    `update curriculum_source_links l
     set status = 'retired'
     from curriculum_target_revisions t
     where l.target_revision_id = t.id and t.design_version_id = any($1::uuid[])
       and l.status = 'published'`,
    [retired.rows.map((design) => design.id)],
  )
}

async function retireUnseededTargets(
  client: PoolClient,
  designVersionId: string,
  seededTargetIds: string[],
) {
  const staleTargets = await client.query<{ id: string; referencedByPlan: boolean }>(
    `select t.id,
       exists (select 1 from lesson_plan_versions v where v.target_revision_id = t.id) as "referencedByPlan"
     from curriculum_target_revisions t
     where t.design_version_id = $1 and t.id <> all($2::uuid[])`,
    [designVersionId, seededTargetIds],
  )
  const unreferencedTargetIds = staleTargets.rows
    .filter((target) => !target.referencedByPlan)
    .map((target) => target.id)
  if (unreferencedTargetIds.length) {
    await client.query(
      'delete from curriculum_source_links where target_revision_id = any($1::uuid[])',
      [unreferencedTargetIds],
    )
    await client.query(
      'delete from curriculum_target_revisions where id = any($1::uuid[])',
      [unreferencedTargetIds],
    )
  }
  await client.query(
    `update curriculum_source_links
     set status = 'retired'
     where status = 'published'
       and target_revision_id in (
         select id from curriculum_target_revisions
         where design_version_id = $1 and id <> all($2::uuid[])
       )`,
    [designVersionId, seededTargetIds],
  )
}

async function ensureTargets(client: PoolClient, designVersionId: string, outcomes: Outcome[]) {
  const targetIds = new Map<string, string>()
  const strandIds = new Map<string, string>()
  const subStrandIds = new Map<string, string>()
  const strands = uniqueBy(outcomes, (outcome) => outcome.strandCode)
  for (const [index, strand] of strands.entries()) {
    const row = await upsertReturning<{ id: string }>(
      client,
      `insert into curriculum_nodes
         (design_version_id, kind, code, label, source_locator, sort_order)
       values ($1, 'strand', $2, $3, $4, $5)
       on conflict (design_version_id, source_locator) do update
         set kind = excluded.kind, code = excluded.code, label = excluded.label, sort_order = excluded.sort_order
       returning id`,
      [designVersionId, strand.strandCode, strand.strandLabel, `Strand ${strand.strandCode}`, index + 1],
    )
    strandIds.set(strand.strandCode, row.id)
  }
  const subStrands = uniqueBy(outcomes, (outcome) => outcome.subStrandCode)
  for (const [index, subStrand] of subStrands.entries()) {
    const row = await upsertReturning<{ id: string }>(
      client,
      `insert into curriculum_nodes
         (design_version_id, parent_node_id, kind, code, label, source_locator, sort_order)
       values ($1, $2, 'sub_strand', $3, $4, $5, $6)
       on conflict (design_version_id, source_locator) do update
         set parent_node_id = excluded.parent_node_id, kind = excluded.kind,
             code = excluded.code, label = excluded.label, sort_order = excluded.sort_order
       returning id`,
      [
        designVersionId,
        strandIds.get(subStrand.strandCode),
        subStrand.subStrandCode,
        subStrand.subStrandLabel,
        `Sub-strand ${subStrand.subStrandCode}`,
        index + 1,
      ],
    )
    subStrandIds.set(subStrand.subStrandCode, row.id)
  }
  for (const [index, outcome] of outcomes.entries()) {
    const row = await upsertReturning<{ id: string }>(
      client,
      `insert into curriculum_target_revisions
         (design_version_id, node_id, kind, code, source_locator, title, statement, sort_order)
       values ($1, $2, 'specific_learning_outcome', $3, $3, $4, $5, $6)
       on conflict (design_version_id, source_locator) do update
         set node_id = excluded.node_id, kind = excluded.kind, code = excluded.code,
             title = excluded.title, statement = excluded.statement, sort_order = excluded.sort_order
       returning id`,
      [
        designVersionId,
        subStrandIds.get(outcome.subStrandCode),
        outcome.code,
        capitalize(outcome.statement),
        outcome.statement,
        index + 1,
      ],
    )
    targetIds.set(outcome.code, row.id)
  }
  return targetIds
}

async function ensureResourceRevision(
  client: PoolClient,
  source: PreparedSource,
  creatorId: string,
  embeddingModel: string,
) {
  const parsed = source.parsed
  let resource = await client.query<{ id: string; resource_type: string; authority: string }>(
    'select id, resource_type, authority from library_resources where source_key = $1 for update',
    [parsed.sourceKey],
  )
  if (!resource.rows[0])
    resource = await client.query<{ id: string; resource_type: string; authority: string }>(
      `insert into library_resources (source_key, resource_type, title, authority)
       values ($1, $2, $3, $4) returning id, resource_type, authority`,
      [parsed.sourceKey, parsed.resourceType, parsed.title, parsed.authority],
    )
  const currentResource = resource.rows[0]
  if (!currentResource) throw new Error(`Could not create source ${parsed.sourceKey}.`)
  if (currentResource.resource_type !== parsed.resourceType || currentResource.authority !== parsed.authority)
    throw new Error(`Source identity changed for ${parsed.sourceKey}.`)
  await client.query('update library_resources set title = $2 where id = $1', [currentResource.id, parsed.title])

  const latest = await client.query<{
    id: string
    revision_number: number
    pipeline_fingerprint: string
    status: string
  }>(
    `select id, revision_number, pipeline_fingerprint, status from library_resource_revisions
     where resource_id = $1 order by revision_number desc limit 1 for update`,
    [currentResource.id],
  )
  if (latest.rows[0]?.pipeline_fingerprint === source.pipelineFingerprint) {
    if (latest.rows[0].status !== 'published')
      await client.query(
        `update library_resource_revisions
         set status = 'published', published_at = coalesce(published_at, now()) where id = $1`,
        [latest.rows[0].id],
      )
    return latest.rows[0].id
  }
  if (!source.embeddings || source.embeddings.length !== parsed.chunks.length)
    throw new Error(`Missing embeddings for changed source ${parsed.sourceKey}.`)

  const revision = await upsertReturning<{ id: string }>(
    client,
    `insert into library_resource_revisions
       (resource_id, revision_number, edition_label, source_url, source_locator, resource_metadata,
        content_hash, pipeline_fingerprint, content, source_format, parser_version, chunker_version,
        embedding_model, status, created_by, published_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, 'published', $14, now())
     returning id`,
    [
      currentResource.id,
      (latest.rows[0]?.revision_number ?? 0) + 1,
      parsed.editionLabel ?? null,
      parsed.sourceUrl ?? null,
      parsed.locator ?? null,
      JSON.stringify(parsed.resourceMetadata),
      source.contentHash,
      source.pipelineFingerprint,
      parsed.content,
      parsed.sourceFormat,
      parsed.parserVersion,
      parsed.chunkerVersion,
      embeddingModel,
      creatorId,
    ],
  )
  for (const [ordinal, chunk] of parsed.chunks.entries()) {
    const metadata = JSON.stringify(chunk.metadata)
    const vector = `[${source.embeddings[ordinal].join(',')}]`
    await client.query(
      `insert into library_resource_chunks
         (resource_revision_id, ordinal, locator, metadata, content, embedding)
       values ($1, $2, $3, $4::jsonb, $5, $6::vector)`,
      [revision.id, ordinal, chunk.locator, metadata, chunk.content, vector],
    )
  }
  return revision.id
}

async function ensurePublishedLink(
  client: PoolClient,
  targetId: string,
  revisionId: string,
  role: string,
  creatorId: string,
) {
  await client.query(
    `update curriculum_source_links old_link
     set status = 'retired'
     from library_resource_revisions old_revision
     join library_resource_revisions new_revision
       on new_revision.resource_id = old_revision.resource_id
     where old_link.resource_revision_id = old_revision.id
       and new_revision.id = $2
       and old_revision.id <> new_revision.id
       and old_link.target_revision_id = $1
       and old_link.role = $3
       and old_link.status = 'published'`,
    [targetId, revisionId, role],
  )
  await client.query(
    `insert into curriculum_source_links
       (target_revision_id, resource_revision_id, role, status, added_by, published_by, published_at)
     values ($1, $2, $3, 'published', $4, $4, now())
     on conflict (target_revision_id, resource_revision_id, role) do update
       set status = 'published', published_by = excluded.published_by,
           published_at = coalesce(curriculum_source_links.published_at, excluded.published_at)`,
    [targetId, revisionId, role, creatorId],
  )
}

async function reconcileSourceLinks(
  client: PoolClient,
  revisionId: string,
  role: string,
  targetIds: string[],
) {
  await client.query(
    `update curriculum_source_links old_link
     set status = 'retired'
     from library_resource_revisions old_revision
     join library_resource_revisions current_revision
       on current_revision.resource_id = old_revision.resource_id
     where old_link.resource_revision_id = old_revision.id
       and current_revision.id = $1
       and old_link.role = $2 and old_link.status = 'published'
       and not (old_link.target_revision_id = any($3::uuid[]))`,
    [revisionId, role, targetIds],
  )
}

async function upsertReturning<T extends { id: string }>(
  client: PoolClient,
  query: string,
  values: unknown[] = [],
) {
  const result = await client.query<T>(query, values)
  const row = result.rows[0]
  if (!row) throw new Error('A curriculum seed insert did not return a row.')
  return row
}

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name)
      return entry.isDirectory()
        ? markdownFiles(path)
        : entry.isFile() && entry.name.endsWith('.md')
          ? [path]
          : []
    }),
  )
  return paths.flat().sort()
}

function embeddingSettings(): EmbeddingSettings {
  return {
    provider: process.env.EMBEDDING_PROVIDER === 'mock' ? 'mock' : 'local',
    model: process.env.EMBEDDING_MODEL ?? 'Xenova/bge-small-en-v1.5',
    revision: process.env.EMBEDDING_MODEL_REVISION ?? 'main',
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 384),
    cacheEnabled: process.env.EMBEDDING_CACHE_ENABLED !== 'false',
    vectorCacheDir: process.env.EMBEDDING_CACHE_DIR ?? '.cache/embeddings',
    modelCacheDir: process.env.TRANSFORMERS_CACHE_DIR ?? '.cache/transformers',
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    )
  return value
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  return [...new Map(values.map((value) => [key(value), value])).values()]
}

function capitalize(value: string) {
  return value[0].toUpperCase() + value.slice(1)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function expectedOutcomeCodes() {
  return Object.entries(expectedOutcomeCounts)
    .flatMap(([subStrand, count]) =>
      Array.from({ length: count }, (_, index) => `${subStrand}(${String.fromCharCode(97 + index)})`),
    )
    .sort()
}
