import corpusData from './corpus-data.json' with { type: 'json' }
import { z } from 'zod'
import { CorpusChunkSchema } from './domain.js'
import type { CorpusChunk } from './domain.js'

export const FIXTURE_IDS = ['particles', 'changes'] as const
export type FixtureId = (typeof FIXTURE_IDS)[number]

const ScenarioSchema = z.object({
  curriculum: z.string().min(1),
  curriculumRelease: z.string().min(1),
  programme: z.string().min(1),
  grade: z.string().min(1),
  subject: z.string().min(1),
  targetId: z.string().min(1),
  targetLocator: z.string().min(1),
  target: z.string().min(1),
  lessonFocus: z.string().min(1),
  durationMinutes: z.number().int().positive(),
}).strict()

const FixtureSchema = z.object({
  id: z.enum(FIXTURE_IDS),
  scenario: ScenarioSchema,
  chunks: z.array(CorpusChunkSchema).min(1),
  objectiveId: z.string().min(1),
  retrievalQuery: z.string().min(1),
  citationEvidence: z.object({
    lessonFocusChunkId: z.string().min(1),
    mainActivityChunkId: z.string().min(1),
    assessmentChunkId: z.string().min(1),
  }).strict(),
}).strict()

export const CorpusDataSchema = z.object({
  schemaVersion: z.literal('cbc-corpus-v1'),
  fixtures: z.array(FixtureSchema).length(FIXTURE_IDS.length),
}).strict()

type Scenario = z.infer<typeof ScenarioSchema>
export type LessonFixture = z.infer<typeof FixtureSchema>

const parsedCorpus = CorpusDataSchema.parse(corpusData)
const fixtures = Object.fromEntries(parsedCorpus.fixtures.map((fixture) => [fixture.id, fixture])) as Record<FixtureId, LessonFixture>

function validateCorpus(): void {
  const errors: string[] = []
  const allChunks = parsedCorpus.fixtures.flatMap(({ chunks }) => chunks)
  const documentIds = new Set(allChunks.map(({ documentId }) => documentId))
  const chunkIds = new Set(allChunks.map(({ id }) => id))
  const targetIds = new Set(parsedCorpus.fixtures.map(({ scenario }) => scenario.targetId))
  const objectiveIds = new Set(parsedCorpus.fixtures.map(({ objectiveId }) => objectiveId))

  if (parsedCorpus.fixtures.some((fixture) => !FIXTURE_IDS.includes(fixture.id))) errors.push('fixture IDs must match the supported CBC targets')
  if (new Set(parsedCorpus.fixtures.map(({ id }) => id)).size !== FIXTURE_IDS.length) errors.push('fixture IDs must be unique')
  if (chunkIds.size !== allChunks.length) errors.push('chunk IDs must be globally unique')
  if (targetIds.size !== parsedCorpus.fixtures.length) errors.push('curriculum target IDs must be unique')
  if (objectiveIds.size !== parsedCorpus.fixtures.length) errors.push('lesson objective IDs must be unique')
  if (documentIds.size < 8 || documentIds.size > 12) errors.push('the corpus must contain 8–12 source documents')

  for (const fixture of parsedCorpus.fixtures) {
    const targets = fixture.chunks.filter(({ kind }) => kind === 'curriculum_target')
    const ids = new Set(fixture.chunks.map(({ id }) => id))
    if (fixture.scenario.curriculum !== 'Kenya CBC (KICD)') errors.push(`${fixture.id} must target Kenya CBC (KICD)`)
    if (fixture.scenario.programme !== 'Junior School' || fixture.scenario.grade !== 'Grade 8' || fixture.scenario.subject !== 'Integrated Science') {
      errors.push(`${fixture.id} must match the Grade 8 Junior School Integrated Science slice`)
    }
    if (targets.length !== 1 || targets[0]?.targetId !== fixture.scenario.targetId || targets[0]?.text !== fixture.scenario.target) {
      errors.push(`${fixture.id} must contain one curriculum target matching its scenario`)
    }
    const target = targets[0]
    const reference = target?.sourceReference
    const outcomeLocator = fixture.scenario.targetLocator.match(/\(([^)]+)\)$/)?.[1]
    if (target && (!reference
      || target.synthetic
      || reference.sourceId !== target.documentId
      || reference.publisher !== 'Kenya Institute of Curriculum Development'
      || reference.documentTitle !== `${fixture.scenario.subject} ${fixture.scenario.grade}`
      || !reference.edition.includes(fixture.scenario.curriculumRelease.split(', ').at(-1) ?? '')
      || reference.relationship !== 'exact_excerpt'
      || !outcomeLocator
      || !reference.locator.includes(`specific learning outcome (${outcomeLocator})`))) {
      errors.push(`${fixture.id} curriculum target must retain matching KICD source provenance and locator`)
    }
    for (const id of Object.values(fixture.citationEvidence)) {
      if (!ids.has(id)) errors.push(`${fixture.id} references missing citation evidence chunk ${id}`)
    }
    const lessonFocus = fixture.chunks.find(({ id }) => id === fixture.citationEvidence.lessonFocusChunkId)
    const mainActivity = fixture.chunks.find(({ id }) => id === fixture.citationEvidence.mainActivityChunkId)
    const assessment = fixture.chunks.find(({ id }) => id === fixture.citationEvidence.assessmentChunkId)
    if (lessonFocus?.kind !== 'teaching_note') errors.push(`${fixture.id} lesson-focus evidence must reference a teaching note`)
    if (mainActivity?.kind !== 'teaching_note') errors.push(`${fixture.id} main-activity evidence must reference a teaching note`)
    if (assessment?.kind !== 'assessment') errors.push(`${fixture.id} assessment evidence must reference an assessment chunk`)
  }

  if (errors.length) throw new Error(`CBC corpus invariant failed:\n- ${errors.join('\n- ')}`)
}

validateCorpus()

export function getFixture(fixtureId: FixtureId = 'particles'): LessonFixture {
  return fixtures[fixtureId]
}

export function fixtureForSources(sources: CorpusChunk[]): LessonFixture {
  const targetIds = new Set(sources.flatMap((chunk) => chunk.kind === 'curriculum_target' && chunk.targetId ? [chunk.targetId] : []))
  if (targetIds.size !== 1) throw new Error('Sources must contain exactly one recognized CBC fixture target.')
  const targetId = targetIds.values().next().value
  const fixture = Object.values(fixtures).find((item) => item.scenario.targetId === targetId)
  if (!fixture) throw new Error('Sources must contain one recognized CBC fixture target.')
  return fixture
}

export const { scenario, chunks, retrievalQuery } = fixtures.particles
export type { Scenario }
