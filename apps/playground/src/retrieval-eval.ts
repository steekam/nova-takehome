import { chunks } from './corpus.js'
import { EMBEDDING_REPRESENTATIONS, embeddingDocumentText, type EmbeddingRepresentation, EVALUATED_RANKED_CHUNK_LIMITS, rankChunks, selectRankedChunks } from './embedding.js'
import { createHash } from 'node:crypto'

const cutoff = 3
const fusionCandidateLimit = 5

const cases = [
  {
    id: 'particle-model-explanation',
    query: 'What must learners explain when comparing matter in different forms?',
    rationale: 'The target states the required comparison; the teaching note explains spacing and movement; assessment guidance supports checking it.',
    relevance: {
      'chunk-particle-properties': 2,
      'chunk-target-particles': 2,
      'chunk-assessment-evidence': 1,
    },
  },
  {
    id: 'closing-assessment',
    query: 'What should each learner demonstrate at the end of the lesson?',
    rationale: 'Assessment guidance specifies the evidence to elicit; the diagnostic is useful earlier in the lesson.',
    relevance: {
      'chunk-assessment-evidence': 2,
      'chunk-check-prior-knowledge': 1,
      'chunk-particle-properties': 1,
    },
  },
  {
    id: 'elicit-prior-ideas',
    query: 'How can the teacher find out what learners think before introducing the new explanation?',
    rationale: 'The diagnostic chunk explicitly asks learners to compare diagrams before teaching.',
    relevance: {
      'chunk-check-prior-knowledge': 2,
      'chunk-assessment-evidence': 1,
    },
  },
  {
    id: 'learning-sequence',
    query: 'What have learners already covered, and what topic follows this lesson?',
    rationale: 'The scheme note directly states prior learning and the next topic.',
    relevance: {
      'chunk-sequence-particles': 2,
      'chunk-target-particles': 1,
    },
  },
  {
    id: 'lesson-structure',
    query: 'What is a useful flow from the lesson opening through paired practice to an individual closing task?',
    rationale: 'The exemplar describes contrasting diagrams, pair modeling, and an individual explanation.',
    relevance: {
      'chunk-exemplar-pacing': 2,
      'chunk-assessment-evidence': 1,
    },
  },
  {
    id: 'classroom-preparation',
    query: 'What should be prepared and arranged in the classroom before learners begin comparing diagrams?',
    rationale: 'The classroom note lists materials and display setup; lead and accessibility notes add constraints.',
    relevance: {
      'chunk-classroom-setup': 2,
      'chunk-lead-constraint': 1,
      'chunk-accessible-responses': 1,
    },
  },
  {
    id: 'activity-constraints',
    query: 'Which classroom activities can represent particles, and what restrictions must the teacher follow?',
    rationale: 'The synthetic lead note specifies suitable models, prohibited demonstrations, and an alternative to body movement.',
    relevance: {
      'chunk-lead-constraint': 2,
      'chunk-classroom-setup': 1,
      'chunk-accessible-responses': 1,
    },
  },
  {
    id: 'accessible-participation',
    query: 'How can a learner who cannot see the diagrams or join physical activities take part and show understanding at the end?',
    rationale: 'The synthetic accessibility note explicitly covers participation and the closing check without visual access or body movement.',
    relevance: {
      'chunk-accessible-responses': 2,
      'chunk-lead-constraint': 1,
    },
  },
] as const

type EvalCase = (typeof cases)[number]
type PolicyLimit = (typeof EVALUATED_RANKED_CHUNK_LIMITS)[number]
type SelectionPolicy = { selectedChunkIds: string[]; grade2PolicyCoverage: number }
type PolicyKey = `top${PolicyLimit}`
type SelectionPolicies = Record<PolicyKey, SelectionPolicy>

function relevanceFor(testCase: EvalCase, chunkId: string): number {
  return testCase.relevance[chunkId as keyof typeof testCase.relevance] ?? 0
}

function discountedGain(relevance: number, position: number): number {
  return (2 ** relevance - 1) / Math.log2(position + 2)
}

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? []
}

function bm25Rank(query: string): Array<{ chunkId: string; score: number }> {
  const documents = chunks.map((chunk) => ({
    id: chunk.id,
    terms: tokens(chunk.text),
  }))
  const averageLength = documents.reduce((sum, document) => sum + document.terms.length, 0) / documents.length
  const queryTerms = tokens(query)
  const scores = documents.map((document) => {
    let score = 0
    for (const term of queryTerms) {
      const termFrequency = document.terms.filter((candidate) => candidate === term).length
      if (termFrequency === 0) continue
      const documentFrequency = documents.filter(({ terms }) => terms.includes(term)).length
      const inverseDocumentFrequency = Math.log(1 + (documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5))
      const k1 = 1.2
      const b = 0.75
      const normalizedFrequency = (termFrequency * (k1 + 1)) / (termFrequency + k1 * (1 - b + b * document.terms.length / averageLength))
      score += inverseDocumentFrequency * normalizedFrequency
    }
    return { chunkId: document.id, score }
  })
  return scores.sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId))
}

function reciprocalRankFusion(
  dense: Array<{ chunkId: string; score: number }>,
  lexical: Array<{ chunkId: string; score: number }>,
): Array<{ chunkId: string; score: number }> {
  const scores = new Map<string, number>()
  for (const ranking of [dense.slice(0, fusionCandidateLimit), lexical.filter(({ score }) => score > 0).slice(0, fusionCandidateLimit)]) {
    ranking.forEach(({ chunkId }, index) => scores.set(chunkId, (scores.get(chunkId) ?? 0) + 1 / (60 + index + 1)))
  }
  return chunks.map(({ id }) => ({ chunkId: id, score: scores.get(id) ?? 0 }))
    .sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId))
}

function summarizeResults(results: Array<ReturnType<typeof evaluateCase>>) {
  const mean = (metric: 'ndcgAt3' | 'grade2HitAt1' | 'grade2RecallAt3') =>
    Number((results.reduce((sum, result) => sum + result.rankingMetrics[metric], 0) / results.length).toFixed(4))
  return {
    rankingMetrics: {
      meanNdcgAt3: mean('ndcgAt3'),
      meanGrade2HitAt1: mean('grade2HitAt1'),
      meanGrade2RecallAt3: mean('grade2RecallAt3'),
    },
    cases: results,
  }
}

function evaluateCase(testCase: EvalCase, ranked: Array<{ chunkId: string; score: number }>) {
  const relevantIds = Object.keys(testCase.relevance).filter((id) => relevanceFor(testCase, id) === 2)
  const top = ranked.slice(0, cutoff)
  const topGrade2 = top.filter(({ chunkId }) => relevanceFor(testCase, chunkId) === 2)
  const firstGrade2 = ranked.findIndex(({ chunkId }) => relevanceFor(testCase, chunkId) === 2)
  const dcg = top.reduce((sum, { chunkId }, index) => sum + discountedGain(relevanceFor(testCase, chunkId), index), 0)
  const ideal = Object.values(testCase.relevance)
    .sort((left, right) => right - left)
    .slice(0, cutoff)
    .reduce((sum, score, index) => sum + discountedGain(score, index), 0)
  const makeSelectionPolicy = (topK: PolicyLimit): SelectionPolicy => {
    const selectedChunkIds = selectRankedChunks(ranked, topK).map(({ id }) => id)
    const selected = new Set(selectedChunkIds)
    return {
      selectedChunkIds,
      grade2PolicyCoverage: Number((relevantIds.filter((id) => selected.has(id)).length / relevantIds.length).toFixed(4)),
    }
  }
  const selectionPolicies: SelectionPolicies = {
    top6: makeSelectionPolicy(6),
    top8: makeSelectionPolicy(8),
  }

  return {
    id: testCase.id,
    query: testCase.query,
    rationale: testCase.rationale,
    rankingMetrics: {
      ndcgAt3: Number((dcg / ideal).toFixed(4)),
      grade2HitAt1: Number(relevanceFor(testCase, ranked[0]?.chunkId ?? '') === 2),
      grade2RecallAt3: Number((topGrade2.length / relevantIds.length).toFixed(4)),
    },
    selectionPolicies,
    ranked: ranked.map(({ chunkId, score }) => ({
      chunkId,
      title: chunks.find(({ id }) => id === chunkId)?.title,
      relevance: relevanceFor(testCase, chunkId),
      score: Number(score.toFixed(4)),
    })),
    firstGrade2Rank: firstGrade2 < 0 ? null : firstGrade2 + 1,
  }
}

export async function runRetrievalEvaluation(providerOverride?: 'local' | 'mock') {
  const startedAt = performance.now()
  let cacheHits = 0
  let cacheMisses = 0
  let modelLoadMs = 0
  let modelPipelineCacheHits = 0
  let model = ''
  let modelRevision = ''

  const profiles = []
  const rankerResults: Record<'bm25-content' | 'dense-plus-bm25-content-rrf', Array<ReturnType<typeof evaluateCase>>> = {
    'bm25-content': [],
    'dense-plus-bm25-content-rrf': [],
  }
  for (const representation of EMBEDDING_REPRESENTATIONS) {
    const results: Array<ReturnType<typeof evaluateCase>> = []
    for (const testCase of cases) {
      const ranking = await rankChunks(testCase.query, providerOverride, representation)
      model = ranking.model
      modelRevision = ranking.modelRevision
      cacheHits += ranking.cacheHits
      cacheMisses += ranking.cacheMisses
      modelLoadMs += ranking.modelLoadMs
      modelPipelineCacheHits += Number(ranking.modelPipelineCacheHit)
      results.push(evaluateCase(testCase, ranking.ranked))
      if (representation === 'content-only') {
        const lexical = bm25Rank(testCase.query)
        rankerResults['bm25-content'].push(evaluateCase(testCase, lexical))
        rankerResults['dense-plus-bm25-content-rrf'].push(evaluateCase(testCase, reciprocalRankFusion(ranking.ranked, lexical)))
      }
    }

    const meanRankingMetric = (metric: 'ndcgAt3' | 'grade2HitAt1' | 'grade2RecallAt3') =>
      Number((results.reduce((sum, result) => sum + result.rankingMetrics[metric], 0) / results.length).toFixed(4))
    const summarizePolicy = (policyName: PolicyKey) => {
      const selectedChunkCount = results[0]?.selectionPolicies[policyName].selectedChunkIds.length ?? 0
      const meanGrade2PolicyCoverage = Number((results.reduce((sum, result) => sum + result.selectionPolicies[policyName].grade2PolicyCoverage, 0) / results.length).toFixed(4))
      return {
        meanGrade2PolicyCoverage,
        selectedChunkCount,
        selectedCorpusFraction: Number((selectedChunkCount / chunks.length).toFixed(4)),
      }
    }
    profiles.push({
      representation,
      modelRevision,
      embeddingPipeline: `query-prefix-v1:mean-pooling:normalized-v1:${representation}-v1`,
      representationHash: createHash('sha256').update(JSON.stringify(chunks.map((chunk) => ({ id: chunk.id, text: embeddingDocumentText(chunk, representation) })))).digest('hex'),
      rankingMetrics: {
        meanNdcgAt3: meanRankingMetric('ndcgAt3'),
        meanGrade2HitAt1: meanRankingMetric('grade2HitAt1'),
        meanGrade2RecallAt3: meanRankingMetric('grade2RecallAt3'),
      },
      policyComparison: {
        top6: summarizePolicy('top6'),
        top8: summarizePolicy('top8'),
      },
      cases: results,
    })
  }
  const primaryProfile = profiles.find(({ representation }) => representation === 'content-only')!

  return {
    schemaVersion: 'playground-retrieval-eval-v8',
    createdAt: new Date().toISOString(),
    model,
    modelRevision,
    embeddingPipeline: primaryProfile.embeddingPipeline,
    selectionPolicy: 'cbc-target+all-lead-guidance+fixture-teaching-assessment+max-total-6-v1',
    corpusChunkCount: chunks.length,
    corpusHash: createHash('sha256').update(JSON.stringify(chunks)).digest('hex'),
    labelSetHash: createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
    queryCount: cases.length,
    cutoff,
    rankingMetrics: primaryProfile.rankingMetrics,
    policyComparison: primaryProfile.policyComparison,
    cacheHits,
    cacheMisses,
    modelLoadMs: Number(modelLoadMs.toFixed(2)),
    modelPipelineCacheHits,
    elapsedMs: Math.round(performance.now() - startedAt),
    labelNote: 'Hand-assigned relevance judgments over one KICD outcome and eight synthetic CBC sources; review labels before treating scores as a model benchmark.',
    fusionPolicy: `dense-top${fusionCandidateLimit}+positive-bm25-top${fusionCandidateLimit}-rrf-k60`,
    comparison: profiles.map(({ representation, modelRevision: profileModelRevision, embeddingPipeline, representationHash, rankingMetrics, policyComparison }) => ({ representation, modelRevision: profileModelRevision, embeddingPipeline, representationHash, rankingMetrics, policyComparison })),
    profiles,
    rankerComparison: Object.entries(rankerResults).map(([ranker, results]) => ({ ranker, ...summarizeResults(results) })),
  }
}
