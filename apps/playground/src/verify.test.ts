import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FIXTURE_IDS, getFixture } from './corpus.js'
import type { Candidate } from './domain.js'
import { generate } from './provider.js'
import { verify } from './verify.js'

const mockCandidate: Candidate = {
  id: 'mock-deepseek',
  provider: 'mock',
  connectionId: 'mock',
  model: 'mock-deepseek',
  displayName: 'Mock DeepSeek',
}

test('JSON CBC fixtures validate target, citation, subject, and 8–12-document invariants', () => {
  const fixtures = FIXTURE_IDS.map((fixtureId) => getFixture(fixtureId))
  const chunks = fixtures.flatMap(({ chunks: fixtureChunks }) => fixtureChunks)
  const documentTypes = new Map<string, Set<string>>()
  for (const chunk of chunks) {
    const types = documentTypes.get(chunk.documentId) ?? new Set<string>()
    types.add(chunk.kind)
    documentTypes.set(chunk.documentId, types)
  }
  const subjects = new Set(fixtures.map(({ scenario }) => scenario.subject))
  const targetReferences = new Set(chunks.filter(({ kind }) => kind === 'curriculum_target').map(({ sourceReference }) => JSON.stringify([
    sourceReference?.sourceId,
    sourceReference?.publisher,
    sourceReference?.documentTitle,
    sourceReference?.edition,
    sourceReference?.url,
  ])))

  assert.equal(new Set(chunks.map(({ id }) => id)).size, chunks.length, 'chunk IDs must be globally unique')
  assert.equal(new Set(fixtures.map(({ scenario }) => scenario.targetId)).size, fixtures.length, 'target IDs must be unique')
  assert.equal(new Set(fixtures.map(({ objectiveId }) => objectiveId)).size, fixtures.length, 'objective IDs must be unique')
  assert.ok(documentTypes.size >= 8 && documentTypes.size <= 12, `expected 8–12 source documents, got ${documentTypes.size}`)
  assert.ok([...documentTypes.values()].every((types) => types.size === 1), 'each source document must have one resource type')
  assert.ok(new Set([...documentTypes.values()].map(([type]) => type)).size >= 2, 'the corpus must contain more than one source-document type')
  assert.equal(subjects.size, 1, 'the corpus must cover one subject')
  assert.equal(targetReferences.size, 1, 'target excerpts from one curriculum document must share canonical source metadata')
  for (const fixture of fixtures) {
    const targetChunks = fixture.chunks.filter(({ kind }) => kind === 'curriculum_target')
    const chunksById = new Map(fixture.chunks.map((chunk) => [chunk.id, chunk]))
    assert.equal(targetChunks.length, 1, `${fixture.id} must have one curriculum target`)
    assert.equal(targetChunks[0]?.targetId, fixture.scenario.targetId, `${fixture.id} target ID must match its scenario`)
    assert.equal(targetChunks[0]?.text, fixture.scenario.target, `${fixture.id} target text must match its scenario`)
    assert.equal(targetChunks[0]?.synthetic, false, `${fixture.id} curriculum target must retain source provenance`)
    assert.equal(targetChunks[0]?.sourceReference?.sourceId, targetChunks[0]?.documentId, `${fixture.id} target source and document IDs must match`)
    assert.ok(Object.values(fixture.citationEvidence).every((id) => chunksById.has(id)), `${fixture.id} evidence references must exist`)
    assert.equal(chunksById.get(fixture.citationEvidence.lessonFocusChunkId)?.kind, 'teaching_note')
    assert.equal(chunksById.get(fixture.citationEvidence.mainActivityChunkId)?.kind, 'teaching_note')
    assert.equal(chunksById.get(fixture.citationEvidence.assessmentChunkId)?.kind, 'assessment')
  }
})

async function validFixtureContent(fixtureId: (typeof FIXTURE_IDS)[number]) {
  const fixture = getFixture(fixtureId)
  const response = await generate(mockCandidate, 'Generate a grounded lesson.', fixture.chunks.map(({ id }) => id))
  const result = verify(JSON.parse(response.content), fixture.chunks)
  assert.ok(result.content, `mock ${fixtureId} lesson should satisfy the content schema`)
  return { fixture, content: result.content }
}

for (const fixtureId of FIXTURE_IDS) {
  test(`${fixtureId} fixture mock lesson passes deterministic verification`, async () => {
    const { fixture, content } = await validFixtureContent(fixtureId)
    const result = verify(content, fixture.chunks)
    assert.equal(result.verification.passed, true, result.verification.checks.filter(({ passed }) => !passed).map(({ code, message }) => `${code}: ${message}`).join('\n'))
  })

  test(`${fixtureId} fixture rejects target-only activity citations`, async () => {
    const { fixture, content } = await validFixtureContent(fixtureId)
    const targetId = fixture.chunks.find(({ kind }) => kind === 'curriculum_target')?.id
    assert.ok(targetId)
    const mutated = structuredClone(content)
    const mainActivity = mutated.activities.find(({ kind }) => kind === 'main')
    assert.ok(mainActivity)
    mainActivity.sourceChunkIds = [targetId]
    const result = verify(mutated, fixture.chunks)
    assert.equal(result.verification.checks.find(({ code }) => code === 'MAIN_ACTIVITY_EVIDENCE_CITED')?.passed, false)
  })

  test(`${fixtureId} fixture rejects target-only citations in starter and closing activities`, async () => {
    const { fixture, content } = await validFixtureContent(fixtureId)
    const targetId = fixture.chunks.find(({ kind }) => kind === 'curriculum_target')?.id
    assert.ok(targetId)
    const mutated = structuredClone(content)
    for (const kind of ['starter', 'closing'] as const) {
      const activity = mutated.activities.find((candidate) => candidate.kind === kind)
      assert.ok(activity)
      activity.sourceChunkIds = [targetId]
    }
    const result = verify(mutated, fixture.chunks)
    assert.equal(result.verification.checks.find(({ code }) => code === 'ACTIVITY_EVIDENCE_CITED')?.passed, false)
  })

  test(`${fixtureId} fixture rejects a mismatched assessment citation`, async () => {
    const { fixture, content } = await validFixtureContent(fixtureId)
    const unrelatedId = fixtureId === 'particles' ? 'chunk-check-prior-knowledge' : 'chunk-change-sequence'
    const mutated = structuredClone(content)
    mutated.checksForUnderstanding[0].sourceChunkIds = [unrelatedId]
    const result = verify(mutated, fixture.chunks)
    assert.equal(result.verification.checks.find(({ code }) => code === 'ASSESSMENT_EVIDENCE_CITED')?.passed, false)
  })
}

test('malformed lesson content returns schema errors instead of throwing', () => {
  const fixture = getFixture('particles')
  const result = verify({ durationMinutes: 'forty' }, fixture.chunks)
  assert.equal(result.content, undefined)
  assert.equal(result.verification.passed, false)
  assert.ok(result.verification.checks.some(({ code }) => code === 'OUTPUT_SCHEMA_INVALID'))
})
