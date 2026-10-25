import {
  CurriculumChunkMetadataSchema,
  CurriculumLibraryResourceTypeSchema,
  CurriculumSourceMetadataSchema,
  type CurriculumChunkMetadata,
  type CurriculumLibraryResourceType,
} from '@nova/shared'
import { z } from 'zod'

export const MARKDOWN_PARSER_VERSION = 'markdown-blocks-v1'
export const PLAIN_TEXT_PARSER_VERSION = 'plain-text-v1'
export const NORMALIZED_CHUNKER_VERSION = 'normalized-chunks-v1'
export const NORMALIZED_PARSER_VERSION = 'normalized-adapter-v1'
const MAX_CHUNK_CHARACTERS = 1600

const markdownChunkerByType: Record<CurriculumLibraryResourceType, string> = {
  curriculum_design: 'curriculum-structure-v1',
  scheme_of_work: 'weekly-plan-v1',
  assessment_items: 'assessment-item-v1',
  teaching_note: 'markdown-section-v1',
  lead_guidance: 'markdown-section-v1',
  exemplar: 'markdown-section-v1',
}

export function markdownChunkerVersion(resourceType: CurriculumLibraryResourceType) {
  return markdownChunkerByType[resourceType]
}

const corpusManifestSchema = z.object({
  corpusId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  resourceType: CurriculumLibraryResourceTypeSchema,
  authority: z.enum(['official', 'school', 'internal', 'synthetic']),
  role: z.enum([
    'defines_target',
    'teaching_support',
    'assessment_support',
    'guidance',
    'exemplar',
  ]),
  editionLabel: z.string().trim().max(120).optional(),
  sourceUrl: z.string().url().optional(),
  sourceLocator: z.string().trim().max(200).optional(),
  framework: z.string().trim().min(1).max(120).optional(),
  programme: z.string().trim().min(1).max(120).optional(),
  grade: z.string().trim().min(1).max(80).optional(),
  subject: z.string().trim().min(1).max(120).optional(),
  sourceAuthority: z.string().trim().min(1).max(200).optional(),
})

type MarkdownSection = {
  level: number
  heading: string
  headingLine: number
  endLine: number
  body: Array<{ line: number; text: string }>
  children: MarkdownSection[]
  parent?: MarkdownSection
}

type SourceChunk = {
  content: string
  locator: string
  metadata: CurriculumChunkMetadata
}

export function parseMarkdownSource(markdown: string) {
  const { frontmatter, body, bodyLineOffset } = splitFrontmatter(markdown)
  const manifest = parseManifest(frontmatter)
  const chunks = chunkMarkdownContent(body, manifest.resourceType, bodyLineOffset)

  if (!chunks.length) throw new Error('Markdown source contains no readable content.')

  return {
    manifest,
    content: body.trim(),
    chunks,
    sourceFormat: 'markdown' as const,
    parserVersion: MARKDOWN_PARSER_VERSION,
    chunkerVersion: markdownChunkerVersion(manifest.resourceType),
    sourceKey: manifest.corpusId,
    title: manifest.title,
    resourceType: manifest.resourceType,
    authority: manifest.authority,
    role: manifest.role,
    editionLabel: manifest.editionLabel,
    sourceUrl: manifest.sourceUrl,
    locator: manifest.sourceLocator,
    resourceMetadata: CurriculumSourceMetadataSchema.parse(
      Object.fromEntries(
        Object.entries({
          framework: manifest.framework,
          programme: manifest.programme,
          grade: manifest.grade,
          subject: manifest.subject,
          sourceAuthority: manifest.sourceAuthority,
        }).filter(([, value]) => value !== undefined),
      ),
    ),
  }
}

export function chunkMarkdownContent(
  content: string,
  resourceType: CurriculumLibraryResourceType,
  lineOffset = 0,
) {
  return chunkMarkdown(buildSections(content, lineOffset), resourceType)
}

export function chunkPlainText(content: string) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const chunks: SourceChunk[] = []
  let start = 0

  for (const [index, line] of lines.entries()) {
    if (line.trim()) continue
    const text = lines.slice(start, index).join('\n').trim()
    if (text) chunks.push(...plainTextParts(text, start + 1))
    start = index + 1
  }
  const tail = lines.slice(start).join('\n').trim()
  if (tail) chunks.push(...plainTextParts(tail, start + 1))

  return chunks
}

function splitFrontmatter(markdown: string) {
  const normalized = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (!normalized.startsWith('---\n')) throw new Error('Markdown source needs YAML frontmatter.')
  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) throw new Error('Markdown frontmatter is not closed.')
  return {
    frontmatter: normalized.slice(4, end),
    body: normalized.slice(end + 5),
    bodyLineOffset: normalized.slice(0, end + 5).split('\n').length - 1,
  }
}

function parseManifest(frontmatter: string) {
  const values: Record<string, string> = {}
  for (const line of frontmatter.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const separator = line.indexOf(':')
    if (separator < 1) throw new Error(`Invalid frontmatter line: ${line}`)
    const key = line.slice(0, separator).trim()
    const rawValue = line.slice(separator + 1).trim()
    if (rawValue.startsWith('[') || rawValue.startsWith('{'))
      throw new Error(`Frontmatter value for ${key} must be a scalar.`)
    values[key] = unquote(rawValue)
  }

  const parsed = corpusManifestSchema.safeParse({
    corpusId: values.corpus_id,
    title: values.title,
    resourceType: values.resource_type,
    authority: values.authority,
    role: values.role,
    editionLabel: values.edition_label,
    sourceUrl: values.source_url,
    sourceLocator: values.source_locator,
    framework: values.framework,
    programme: values.programme,
    grade: values.grade,
    subject: values.subject,
    sourceAuthority: values.source_authority,
  })
  if (!parsed.success)
    throw new Error(
      `Invalid Markdown source manifest: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
    )
  return parsed.data
}

function unquote(value: string) {
  if (value.length < 2) return value
  const quote = value[0]
  return (quote === '"' || quote === "'") && value.at(-1) === quote ? value.slice(1, -1) : value
}

function buildSections(content: string, lineOffset: number) {
  const root: MarkdownSection = {
    level: 0,
    heading: '',
    headingLine: 1,
    endLine: lineOffset + 1,
    body: [],
    children: [],
  }
  const stack = [root]
  const lines = content.split('\n')
  let fence: string | undefined

  for (const [index, text] of lines.entries()) {
    const trimmed = text.trimStart()
    const fenceMatch = trimmed.match(/^(```+|~~~+)/)
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0]
      else if (fence === fenceMatch[1][0]) fence = undefined
      stack.at(-1)?.body.push({ line: index + 1 + lineOffset, text })
      continue
    }
    const heading = fence ? null : text.match(/^(#{1,6})\s+(.+?)\s*#*$/)
    if (heading) {
      const level = heading[1].length
      while (stack.length > 1 && stack.at(-1)!.level >= level) {
        stack.at(-1)!.endLine = index + lineOffset
        stack.pop()
      }
      const parent = stack.at(-1)!
      const section: MarkdownSection = {
        level,
        heading: heading[2].trim(),
        headingLine: index + 1 + lineOffset,
        endLine: lines.length + lineOffset,
        body: [],
        children: [],
        parent,
      }
      parent.children.push(section)
      stack.push(section)
      continue
    }
    stack.at(-1)?.body.push({ line: index + 1 + lineOffset, text })
  }
  while (stack.length > 1) stack.pop()!.endLine = lines.length + lineOffset
  root.endLine = lines.length + lineOffset
  return { root, lines }
}

function chunkMarkdown(
  tree: ReturnType<typeof buildSections>,
  resourceType: CurriculumLibraryResourceType,
) {
  const { root } = tree
  const sections = descendants(root)
  const chunks: SourceChunk[] = []
  const handled = new Set<MarkdownSection>()

  if (resourceType === 'assessment_items') {
    for (const section of sections) {
      const item = section.heading.match(/^([A-Z]\d+)\b[.):-]?/i)
      if (!item) continue
      const sharedContext = assessmentContext(section)
      const text = [sharedContext.content, renderSection(section)].filter(Boolean).join('\n\n')
      const marks = section.heading.match(/(\d+(?:\.\d+)?)\s*marks?/i)
      chunks.push(
        makeSectionChunk(section, text, 'assessment_item', {
          itemId: item[1].toUpperCase(),
          instrument: headingPath(section.parent)
            .at(-1)
            ?.match(/Instrument\s+([A-Z])/i)?.[1],
          marks: marks ? Number(marks[1]) : undefined,
          ...(sharedContext.sourceLineStart !== undefined
            ? { sourceLineStart: Math.min(section.headingLine, sharedContext.sourceLineStart) }
            : {}),
          ...(sharedContext.sourceLineEnd !== undefined
            ? { sourceLineEnd: Math.max(section.endLine, sharedContext.sourceLineEnd) }
            : {}),
        }),
      )
      handled.add(section)
    }
  } else if (resourceType === 'scheme_of_work') {
    for (const section of sections) {
      const week = section.heading.match(/\bWeek\s+(\d+)\b/i)
      if (!week) continue
      const schedule = section.heading.match(/Term\s+periods?\s+(\d+)\s*[–-]\s*(\d+)/i)
      const term = titleAndHeadings(root).match(/\bTerm\s+(\d+)\b/i)?.[1]
      chunks.push(
        makeSectionChunk(section, renderSection(section), 'week_plan', {
          term: term ? Number(term) : undefined,
          week: Number(week[1]),
          periodStart: schedule ? Number(schedule[1]) : undefined,
          periodEnd: schedule ? Number(schedule[2]) : undefined,
        }),
      )
      handled.add(section)
    }
  }

  const handledWithAncestors = new Set<MarkdownSection>()
  for (const section of handled) {
    let parent = section.parent
    while (parent && parent !== root) {
      handledWithAncestors.add(parent)
      parent = parent.parent
    }
  }

  for (const section of sections) {
    if (handled.has(section)) continue
    if (handledWithAncestors.has(section) && !hasOwnContent(section)) continue
    const blocks = parseBlocks(section.body)
    let sectionPageMetadata: Partial<CurriculumChunkMetadata> = {}
    for (const block of blocks) {
      const pageMetadata = extractPageMetadata(block.text)
      if (Object.keys(pageMetadata).length) sectionPageMetadata = pageMetadata
      const hasOutcomeList =
        resourceType === 'curriculum_design' &&
        block.kind === 'list' &&
        outcomeCodes(block.text).length > 0
      const items = resourceType === 'curriculum_design' ? splitOutcomeListBlock(block) : [block]
      for (const item of items) {
        let kind = 'section'
        let extra: Partial<CurriculumChunkMetadata> = {}
        if (resourceType === 'curriculum_design')
          kind =
            item.kind === 'table' ? 'table' : outcomeCodes(item.text).length ? 'outcome' : 'section'
        else if (resourceType === 'assessment_items') {
          const isSharedStimulus = /stimulus|passage|data set|source text/i.test(section.heading)
          const relatedItemIds = assessmentItemIds(section).length
            ? assessmentItemIds(section)
            : isSharedStimulus
              ? followingAssessmentItemIds(section)
              : []
          if (isSharedStimulus) kind = 'shared_stimulus'
          if (relatedItemIds.length) extra = { relatedItemIds }
        } else if (section.heading.match(/^References$|^Curriculum reference$/i)) kind = 'reference'
        if (hasOutcomeList)
          extra = { ...sectionPageMetadata, ...extractPageMetadata(item.text), ...extra }
        chunks.push(makeBlockChunk(section, item, kind, extra))
      }
      if (hasOutcomeList) sectionPageMetadata = {}
    }
  }

  for (const block of parseBlocks(root.body))
    chunks.push(
      makeRootBlockChunk(
        block,
        resourceType === 'curriculum_design' ? 'section' : 'document_context',
      ),
    )

  return chunks
    .flatMap(splitOversizedChunk)
    .sort((a, b) => (a.metadata.sourceLineStart ?? 0) - (b.metadata.sourceLineStart ?? 0))
}

function descendants(section: MarkdownSection): MarkdownSection[] {
  return section.children.flatMap((child) => [child, ...descendants(child)])
}

function headingPath(section?: MarkdownSection) {
  const path: string[] = []
  let current = section
  while (current && current.level > 0) {
    path.unshift(current.heading)
    current = current.parent
  }
  return path
}

function titleAndHeadings(root: MarkdownSection) {
  return descendants(root)
    .map((section) => section.heading)
    .join(' ')
}

function assessmentContext(section: MarkdownSection) {
  const context: string[] = []
  const contextRanges: Array<[number, number]> = []
  let parent = section.parent
  while (parent && parent.level > 1) {
    if (hasOwnContent(parent) && assessmentItemIds(parent).length > 1) {
      context.unshift(renderOwnSection(parent))
      contextRanges.push([
        parent.headingLine,
        Math.max(parent.headingLine, ...parent.body.map((line) => line.line)),
      ])
    }
    parent = parent.parent
  }
  const siblings = section.parent?.children ?? []
  const index = siblings.indexOf(section)
  const stimulus = siblings
    .slice(0, index)
    .reverse()
    .find((sibling) => /stimulus|passage|data set|source text/i.test(sibling.heading))
  if (stimulus) {
    context.push(renderSection(stimulus))
    contextRanges.push([stimulus.headingLine, stimulus.endLine])
  }
  return {
    content: context.join('\n\n'),
    sourceLineStart: contextRanges.length
      ? Math.min(...contextRanges.map(([start]) => start))
      : undefined,
    sourceLineEnd: contextRanges.length
      ? Math.max(...contextRanges.map(([, end]) => end))
      : undefined,
  }
}

function renderOwnSection(section: MarkdownSection) {
  const body = section.body
    .map((line) => line.text)
    .join('\n')
    .trim()
  return [`${'#'.repeat(section.level)} ${section.heading}`, body].filter(Boolean).join('\n\n')
}

function assessmentItemIds(section: MarkdownSection) {
  return descendants(section)
    .map((candidate) => candidate.heading.match(/^([A-Z]\d+)\b[.):-]?/i)?.[1]?.toUpperCase())
    .filter((itemId): itemId is string => itemId !== undefined)
}

function followingAssessmentItemIds(section: MarkdownSection) {
  const siblings = section.parent?.children ?? []
  const index = siblings.indexOf(section)
  return siblings
    .slice(index + 1)
    .filter((sibling) => /^([A-Z]\d+)\b[.):-]?/i.test(sibling.heading))
    .map((sibling) => sibling.heading.match(/^([A-Z]\d+)\b[.):-]?/i)![1].toUpperCase())
}

function hasOwnContent(section: MarkdownSection) {
  return section.body.some((line) => line.text.trim())
}

function renderSection(section: MarkdownSection): string {
  const own = section.body
    .map((line) => line.text)
    .join('\n')
    .trim()
  const children = section.children.map(renderSection).filter(Boolean).join('\n\n')
  return [`${'#'.repeat(section.level)} ${section.heading}`, own, children]
    .filter(Boolean)
    .join('\n\n')
}

function splitOutcomeListBlock(block: { text: string; start: number; end: number; kind: string }) {
  if (block.kind !== 'list') return [block]
  const items: Array<{ text: string; start: number; end: number; kind: string }> = []
  for (const [index, line] of block.text.split('\n').entries()) {
    if (/^\s*[-*+]\s+/.test(line) && outcomeCodes(line).length) {
      items.push({ text: line, start: block.start + index, end: block.start + index, kind: 'list' })
    } else if (items.length) {
      const last = items.at(-1)!
      last.text += `\n${line}`
      last.end = block.start + index
    } else return [block]
  }
  return items.length > 1 ? items : [block]
}

function parseBlocks(lines: MarkdownSection['body']) {
  const blocks: Array<{
    text: string
    start: number
    end: number
    kind: 'paragraph' | 'table' | 'code' | 'list'
  }> = []
  let current: (typeof blocks)[number] | undefined
  let inFence = false

  for (const line of lines) {
    const text = line.text
    const trimmed = text.trim()
    if (!trimmed && !inFence) {
      if (current) blocks.push(current)
      current = undefined
      continue
    }
    const isFence = /^(```+|~~~+)/.test(trimmed)
    const kind =
      inFence || isFence
        ? 'code'
        : trimmed.startsWith('|')
          ? 'table'
          : /^([-*+]\s|\d+[.)]\s)/.test(trimmed)
            ? 'list'
            : 'paragraph'
    if (isFence) inFence = !inFence
    if (!current || current.kind !== kind) {
      if (current) blocks.push(current)
      current = { text, start: line.line, end: line.line, kind }
    } else {
      current.text += `\n${text}`
      current.end = line.line
    }
  }
  if (current) blocks.push(current)
  return blocks
}

function makeSectionChunk(
  section: MarkdownSection,
  content: string,
  kind: string,
  extra: Partial<CurriculumChunkMetadata> = {},
) {
  const path = headingPath(section)
  const parentContext = path.length > 1 ? `${path.slice(0, -1).join(' › ')}\n\n` : ''
  return makeChunk(
    `${parentContext}${content}`,
    section.headingLine,
    section.endLine,
    path,
    kind,
    extra,
  )
}

function makeBlockChunk(
  section: MarkdownSection,
  block: { text: string; start: number; end: number; kind: string },
  kind: string,
  extra: Partial<CurriculumChunkMetadata> = {},
) {
  const path = headingPath(section)
  const context = path.length ? `${path.join(' › ')}\n\n` : ''
  return makeChunk(`${context}${block.text}`, block.start, block.end, path, kind, extra)
}

function makeRootBlockChunk(
  block: { text: string; start: number; end: number; kind: string },
  kind: string,
) {
  return makeChunk(block.text, block.start, block.end, [], kind)
}

function plainTextParts(content: string, startLine: number) {
  const parts = splitAtWords(content, MAX_CHUNK_CHARACTERS)
  let cursor = 0
  return parts.map((text, index) => {
    const before = content.indexOf(text, cursor)
    cursor = before + text.length
    const lineStart = startLine + (content.slice(0, before).match(/\n/g)?.length ?? 0)
    const lineEnd = lineStart + (text.match(/\n/g)?.length ?? 0)
    const extra: Partial<CurriculumChunkMetadata> =
      parts.length > 1 ? { attributes: { partIndex: index + 1, partCount: parts.length } } : {}
    const chunk = makeChunk(text, lineStart, lineEnd, [], 'paragraph', extra)
    return parts.length > 1
      ? { ...chunk, locator: `${chunk.locator} · part ${index + 1}/${parts.length}`.slice(0, 200) }
      : chunk
  })
}

function makeChunk(
  content: string,
  sourceLineStart: number,
  sourceLineEnd: number,
  headingPathValue: string[],
  kind: string,
  extra: Partial<CurriculumChunkMetadata> = {},
): SourceChunk {
  const metadata = CurriculumChunkMetadataSchema.parse({
    kind,
    ...(headingPathValue.length ? { headingPath: headingPathValue.slice(-16) } : {}),
    sourceLineStart,
    sourceLineEnd: Math.max(sourceLineStart, sourceLineEnd),
    ...extractOutcomeAndPageMetadata(content),
    ...extra,
  })
  return {
    content: content.trim(),
    locator: displayLocator(metadata),
    metadata,
  }
}

function splitOversizedChunk(chunk: SourceChunk): SourceChunk[] {
  const headingContext = chunk.metadata.headingPath?.join(' › ').slice(0, 500)
  const prefix = headingContext ? `${headingContext}\n\n` : ''
  const body =
    prefix && chunk.content.startsWith(prefix) ? chunk.content.slice(prefix.length) : chunk.content
  const parts = splitAtWords(body, Math.max(250, MAX_CHUNK_CHARACTERS - prefix.length))
  if (parts.length <= 1) return [chunk]
  return parts.map((part, index) => {
    const metadata = CurriculumChunkMetadataSchema.parse({
      ...chunk.metadata,
      attributes: {
        ...chunk.metadata.attributes,
        partIndex: index + 1,
        partCount: parts.length,
      },
    })
    return {
      content: `${prefix}${part}`.trim(),
      locator: `${chunk.locator} · part ${index + 1}/${parts.length}`.slice(0, 200),
      metadata,
    }
  })
}

function splitAtWords(content: string, maxLength: number) {
  const parts: string[] = []
  let remaining = content.trim()
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(' ', maxLength)
    const sentenceBoundary = Math.max(
      remaining.lastIndexOf('. ', maxLength),
      remaining.lastIndexOf('? ', maxLength),
      remaining.lastIndexOf('! ', maxLength),
      remaining.lastIndexOf('; ', maxLength),
    )
    if (sentenceBoundary >= maxLength * 0.55) splitAt = sentenceBoundary + 1
    if (splitAt < maxLength * 0.4) splitAt = maxLength
    parts.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).trim()
  }
  if (remaining) parts.push(remaining)
  return parts
}

function extractOutcomeAndPageMetadata(content: string): Partial<CurriculumChunkMetadata> {
  const codes = outcomeCodes(content)
  return {
    ...(codes.length ? { outcomeCodes: codes } : {}),
    ...extractPageMetadata(content),
  }
}

function extractPageMetadata(content: string): Partial<CurriculumChunkMetadata> {
  const pages = [
    ...content.matchAll(
      /printed(?:\s+(?:pp?\.?|pages?))?\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*\/\s*PDF(?:\s+(?:pp?\.?|pages?))?\s*(\d+)(?:\s*[–-]\s*(\d+))?/gi,
    ),
  ]
  const metadata: Partial<CurriculumChunkMetadata> = {}
  if (pages.length) {
    metadata.printedPageStart = Math.min(...pages.map((match) => Number(match[1])))
    metadata.printedPageEnd = Math.max(...pages.map((match) => Number(match[2] ?? match[1])))
    metadata.pdfPageStart = Math.min(...pages.map((match) => Number(match[3])))
    metadata.pdfPageEnd = Math.max(...pages.map((match) => Number(match[4] ?? match[3])))
  }
  return metadata
}

function outcomeCodes(content: string) {
  const matches = [...content.matchAll(/\b(\d+\.\d+\([a-z](?:\s*[–-]\s*[a-z])?\))/gi)]
  return [...new Set(matches.flatMap((match) => expandOutcomeCode(match[1])))]
}

function expandOutcomeCode(value: string) {
  const match = value.match(/^(\d+\.\d+)\(([a-z])\s*[–-]\s*([a-z])\)$/i)
  if (!match) return [value.replace(/\s+/g, '').toLowerCase()]
  const result: string[] = []
  for (
    let code = match[2].toLowerCase().charCodeAt(0);
    code <= match[3].toLowerCase().charCodeAt(0);
    code += 1
  )
    result.push(`${match[1]}(${String.fromCharCode(code)})`)
  return result
}

export function displayLocator(metadata: CurriculumChunkMetadata) {
  const identity = metadata.itemId
    ? [metadata.instrument ? `Instrument ${metadata.instrument}` : '', metadata.itemId]
        .filter(Boolean)
        .join(' · ')
    : metadata.week
      ? [`Term ${metadata.term ?? '?'}`, `Week ${metadata.week}`].join(' · ')
      : metadata.outcomeCodes?.join(', ')
  if (identity) {
    const page = printedPageLocator(metadata)
    return page ? `${identity} · ${page}` : identity
  }
  if (metadata.headingPath?.length) {
    const heading = metadata.headingPath.join(' › ').slice(0, 150)
    const page = printedPageLocator(metadata)
    return page ? `${heading} · ${page}`.slice(0, 200) : heading
  }
  if (metadata.printedPageStart) {
    const page = printedPageLocator(metadata)
    if (page) return page
  }
  return `Lines ${metadata.sourceLineStart}–${metadata.sourceLineEnd}`
}

function printedPageLocator(metadata: CurriculumChunkMetadata) {
  if (metadata.printedPageStart) {
    const pages =
      metadata.printedPageEnd && metadata.printedPageEnd !== metadata.printedPageStart
        ? `${metadata.printedPageStart}–${metadata.printedPageEnd}`
        : `${metadata.printedPageStart}`
    const pdfPages =
      metadata.pdfPageStart && metadata.pdfPageEnd && metadata.pdfPageEnd !== metadata.pdfPageStart
        ? `${metadata.pdfPageStart}–${metadata.pdfPageEnd}`
        : metadata.pdfPageStart
    return `Printed p. ${pages}${pdfPages ? ` / PDF p. ${pdfPages}` : ''}`
  }
  return undefined
}
