import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Candidate } from './domain.js'
import type { JsonSchemaNode } from './prompt.js'
import { lessonTiming } from './prompt.js'

const execFileAsync = promisify(execFile)

export class ProviderError extends Error {
  constructor(readonly code: string, message: string, readonly retryable = false) {
    super(message)
  }
}

export type ProviderResponse = {
  content: string
  responseModel?: string
  finishReason?: string
  usage?: { promptTokens?: number; cachedPromptTokens?: number; completionTokens?: number; totalTokens?: number }
  reportedCostUsd?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function generate(
  candidate: Candidate,
  prompt: string,
  allowedChunkIds: string[] = [],
  structuredOutput?: { name: string; schema: JsonSchemaNode; mockContent?: string; durationMinutes?: number },
): Promise<ProviderResponse> {
  if (candidate.provider === 'mock') return { content: structuredOutput?.mockContent ?? mockOutput(candidate.model, allowedChunkIds, structuredOutput?.durationMinutes) }
  if (candidate.provider === 'baseten') return generateBaseten(candidate, prompt, structuredOutput)
  if (candidate.provider === 'litellm') return generateLiteLLM(candidate, prompt, structuredOutput)
  return generateOpenCode(candidate, prompt)
}

async function generateBaseten(candidate: Candidate, prompt: string, structuredOutput?: { name: string; schema: JsonSchemaNode; mockContent?: string }): Promise<ProviderResponse> {
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY ?? process.env.BASETEN_API_KEY
  if (!apiKey) throw new ProviderError('PROVIDER_AUTH_ERROR', 'OPENAI_COMPATIBLE_API_KEY or BASETEN_API_KEY is missing.')
  const baseUrl = (process.env.OPENAI_COMPATIBLE_BASE_URL ?? process.env.BASETEN_BASE_URL ?? 'https://inference.baseten.co/v1').replace(/\/$/, '')
  return generateOpenAICompatible('Baseten', baseUrl, apiKey, candidate, prompt, structuredOutput)
}

async function generateLiteLLM(candidate: Candidate, prompt: string, structuredOutput?: { name: string; schema: JsonSchemaNode; mockContent?: string }): Promise<ProviderResponse> {
  const apiKey = process.env.LITELLM_API_KEY
  if (!apiKey) throw new ProviderError('PROVIDER_AUTH_ERROR', 'LITELLM_API_KEY is missing. Run pnpm litellm:key after starting the local proxy.')
  const baseUrl = (process.env.LITELLM_BASE_URL ?? 'http://localhost:4000/v1').replace(/\/$/, '')
  return generateOpenAICompatible('LiteLLM', baseUrl, apiKey, candidate, prompt, structuredOutput)
}

async function generateOpenAICompatible(
  providerName: string,
  baseUrl: string,
  apiKey: string,
  candidate: Candidate,
  prompt: string,
  structuredOutput?: { name: string; schema: JsonSchemaNode; mockContent?: string },
): Promise<ProviderResponse> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: candidate.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 2200,
        response_format: structuredOutput
          ? { type: 'json_schema', json_schema: { name: structuredOutput.name, strict: true, schema: structuredOutput.schema } }
          : { type: 'json_object' },
        chat_template_kwargs: { thinking: false },
      }),
      signal: AbortSignal.timeout(90_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw new ProviderError('PROVIDER_TIMEOUT', `${providerName} request timed out.`, true)
    throw new ProviderError('PROVIDER_UNAVAILABLE', `Could not connect to ${providerName}.`, true)
  }
  if (!response.ok) {
    let message = ''
    try {
      message = (await response.text()).slice(0, 500)
    } catch {
      message = 'Response body could not be read.'
    }
    const retryable = response.status === 429 || response.status >= 500
    const code = response.status === 401 || response.status === 403 ? 'PROVIDER_AUTH_ERROR'
      : response.status === 429 ? 'PROVIDER_RATE_LIMITED'
        : response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_REQUEST_REJECTED'
    throw new ProviderError(code, `${providerName} returned HTTP ${response.status}: ${message}`, retryable)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new ProviderError('PROVIDER_TIMEOUT', `${providerName} response timed out.`, true)
    throw new ProviderError('PROVIDER_INVALID_RESPONSE', `${providerName} returned an invalid JSON response.`, true)
  }
  if (!isRecord(body) || !Array.isArray(body.choices) || !isRecord(body.choices[0])) {
    throw new ProviderError('PROVIDER_INVALID_RESPONSE', `${providerName} returned an invalid response envelope.`, true)
  }
  const choice = body.choices[0]
  const message = choice.message
  if (!isRecord(message) || typeof message.content !== 'string' || !message.content.trim()) {
    throw new ProviderError('PROVIDER_INVALID_RESPONSE', `${providerName} returned no valid message content.`, true)
  }
  const rawUsage = body.usage
  const usage = isRecord(rawUsage) ? {
    promptTokens: typeof rawUsage.prompt_tokens === 'number' ? rawUsage.prompt_tokens : undefined,
    cachedPromptTokens: isRecord(rawUsage.prompt_tokens_details) && typeof rawUsage.prompt_tokens_details.cached_tokens === 'number' ? rawUsage.prompt_tokens_details.cached_tokens : undefined,
    completionTokens: typeof rawUsage.completion_tokens === 'number' ? rawUsage.completion_tokens : undefined,
    totalTokens: typeof rawUsage.total_tokens === 'number' ? rawUsage.total_tokens : undefined,
  } : undefined
  const costHeader = response.headers.get('x-litellm-response-cost')
  const reportedCostUsd = costHeader === null ? undefined : Number(costHeader)
  return {
    content: message.content,
    responseModel: typeof body.model === 'string' ? body.model : undefined,
    finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : undefined,
    usage,
    reportedCostUsd: reportedCostUsd !== undefined && Number.isFinite(reportedCostUsd) && reportedCostUsd >= 0 ? reportedCostUsd : undefined,
  }
}

async function generateOpenCode(candidate: Candidate, prompt: string): Promise<ProviderResponse> {
  if (!process.env.OPENCODE_API_KEY) throw new ProviderError('PROVIDER_AUTH_ERROR', 'OPENCODE_API_KEY is missing.')
  try {
    const { stdout } = await execFileAsync('opencode', [
      'run', '--format', 'json', '--model', `opencode/${candidate.model}`, prompt,
    ], { timeout: 90_000, maxBuffer: 2_000_000, env: process.env })
    const content = stdout.split('\n').flatMap((line) => {
      try {
        const event = JSON.parse(line) as { type?: string; text?: string; part?: { text?: string } }
        return event.type === 'text' ? [event.part?.text ?? event.text ?? ''] : []
      } catch {
        return []
      }
    }).join('')
    if (!content) throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'OpenCode CLI returned no text output.')
    return { content }
  } catch (error) {
    if (error instanceof ProviderError) throw error
    const processError = isRecord(error) ? error : {}
    const stderr = typeof processError.stderr === 'string' ? processError.stderr : ''
    if (processError.code === 'ENOENT') throw new ProviderError('PROVIDER_UNAVAILABLE', 'OpenCode CLI is not installed or not on PATH.')
    if (processError.killed === true || processError.code === 'ETIMEDOUT') throw new ProviderError('PROVIDER_TIMEOUT', 'OpenCode CLI request timed out.', true)
    if (/expired|unauthorized|forbidden|authentication failed|invalid api key|\b401\b|\b403\b/i.test(stderr)) throw new ProviderError('PROVIDER_AUTH_ERROR', 'OpenCode CLI credentials were rejected.')
    if (/rate limit|too many requests|quota exceeded|\b429\b/i.test(stderr)) throw new ProviderError('PROVIDER_RATE_LIMITED', 'OpenCode free-model request was rate limited.', true)
    throw new ProviderError('PROVIDER_UNAVAILABLE', 'OpenCode CLI request failed.', true)
  }
}

function mockOutput(variant: string, allowedChunkIds: string[], durationMinutes = 40): string {
  if (allowedChunkIds.includes('chunk-target-changes')) return mockChangeOutput(allowedChunkIds, durationMinutes)
  const timing = lessonTiming(durationMinutes)
  const suffix = variant.toLowerCase().includes('glm') ? 'glm' : 'deepseek'
  const objectiveId = 'objective-particles'
  const fallbackSourceId = allowedChunkIds.find((id) => id !== 'chunk-target-particles' && id !== 'chunk-target-changes') ?? allowedChunkIds[0]
  const source = (id: string) => allowedChunkIds.includes(id) ? id : fallbackSourceId
  const sourceIds = (...ids: string[]) => [...new Set(ids.map(source))]
  const target = source('chunk-target-particles')
  const teachingNote = source('chunk-particle-properties')
  const assessment = source('chunk-assessment-evidence')
  const lead = source('chunk-lead-constraint')
  const exemplar = source('chunk-exemplar-pacing')
  const diagnostic = source('chunk-check-prior-knowledge')
  return JSON.stringify({
    title: 'How particles behave in three states',
    durationMinutes,
    lessonObjectives: [{
      id: objectiveId,
      text: 'Compare particle spacing and movement in solids, liquids, and gases, and explain that particle size stays the same across states.',
      sourceChunkIds: sourceIds(target, teachingNote),
    }],
    materials: [{ name: 'Particle diagram cards', notes: 'Shared or displayed cards show same-size dots with spacing and movement marks.' }, { name: 'Counters and individual response sheets', notes: 'Provide tactile counters or spoken descriptions and static cards; give every learner a response sheet or equivalent for the closing check.' }],
    activities: [
      { id: `starter-${suffix}`, kind: 'starter', durationMinutes: timing.starter, teacherActions: 'Show three particle diagrams and ask learners what changes between them before revealing the legend.', learnerActions: 'Think, then share one observation about spacing or movement.', objectiveIds: [objectiveId], sourceChunkIds: sourceIds(diagnostic, target) },
      { id: `model-${suffix}`, kind: 'main', durationMinutes: timing.main, teacherActions: `Pre-distribute prepared cards and counters. Timed substeps: 0-${timing.model} min model one diagram; ${timing.model}-${timing.model + timing.practice} min pairs practise all states; ${timing.model + timing.practice}-${timing.model + timing.practice + timing.compare} min each pair selects two states and compares them; ${timing.model + timing.practice + timing.compare}-${timing.main} min share one comparison. Explain that solid and liquid particles are both close together, gas particles are far apart, and movement differs. Offer spoken descriptions and static cards for learners to use without visual access or body movement.`, learnerActions: 'Use the prepared diagrams, spoken descriptions, static cards, or tactile counters to model all three states. Choose two diagrams, compare their spacing and movement, and state that particle size remains the same.', objectiveIds: [objectiveId], sourceChunkIds: sourceIds(teachingNote, lead, exemplar) },
      { id: `closing-${suffix}`, kind: 'closing', durationMinutes: timing.closing, teacherActions: 'Keep the diagrams displayed and give each learner an individual response sheet or equivalent. Ask for a simultaneous comparison covering state, spacing, movement, and whether particle size changes.', learnerActions: 'Submit a written, recorded, or selectable comparison that names each state, compares spacing, names how movement differs, and states that particle size stays the same.', objectiveIds: [objectiveId], sourceChunkIds: sourceIds(assessment, teachingNote) },
    ],
    checksForUnderstanding: [{ id: `check-${suffix}`, prompt: 'Show all three diagrams, then choose two to compare. For each selected diagram, state its state, spacing, and movement; say whether spacing is similar or different, then name how movement differs between the pair. Choose once whether particle size stays the same, gets larger, or gets smaller across states. Choices: state = solid, liquid, gas; spacing = close together or far apart; movement = vibrate around fixed positions, slide past one another, or move freely; particle size = stays the same, gets larger, or gets smaller.', expectedEvidence: 'Reference answer key: solid = close together and vibrate around fixed positions; liquid = close together and slide past one another; gas = far apart and move freely. Use only the entries matching the learner\'s two selected diagrams. Particle size stays the same across states. Possible misconception: a learner may think each gas particle grows when a gas fills a container. Correction: a gas changing container shape does not mean each particle grows.', scoringCriteria: { perDiagram: { pointsPerCriterion: 1, criteria: ['state', 'spacing', 'movement'] }, particleSizeAcrossPair: { points: 1, expected: 'same' }, spacingComparison: { points: 1, criterion: 'similar_or_different' }, movementComparison: { points: 1, criterion: 'compare_movement' }, totalPoints: 9 }, objectiveIds: [objectiveId], sourceChunkIds: sourceIds(assessment, teachingNote) }],
    differentiation: ['For every diagram task, including closing, provide a distinct nonvisual, non-movement option: two equivalent spoken descriptions and static response cards; learners compare the descriptions and select or state answers without visual access or body movement.'],
    safetyNotes: ['Use cards or counters; no heating demonstration is needed.'],
  })
}

function mockChangeOutput(allowedChunkIds: string[], durationMinutes: number): string {
  const timing = lessonTiming(durationMinutes)
  const sourceIds = (...ids: string[]) => ids.filter((id) => allowedChunkIds.includes(id))
  const objectiveIds = ['objective-changes']
  return JSON.stringify({
    title: 'Physical or chemical: follow the new-substance evidence', durationMinutes,
    lessonObjectives: [{ id: objectiveIds[0], text: 'Distinguish physical and chemical changes using whether a new substance forms in four supplied cases.', sourceChunkIds: sourceIds('chunk-target-changes', 'chunk-change-cases') }],
    materials: [
      { name: 'Four prepared case cards', notes: 'Display melting ice, tearing paper, rusting iron, and cooking an egg as descriptions, with equivalent spoken versions.' },
      { name: 'Individual response sheets or equivalent', notes: 'Give every learner an individual response tool, with written, recorded, or selectable answers.' },
    ],
    activities: [
      { id: 'starter-changes', kind: 'starter', durationMinutes: timing.starter, teacherActions: 'Collect first ideas about melting ice and tearing paper before giving the new-substance rule; offer equivalent spoken descriptions and spoken or static responses without visual access or body movement.', learnerActions: 'Choose an initial classification and explain what the substance is before and after.', objectiveIds, sourceChunkIds: sourceIds('chunk-target-changes', 'chunk-change-sequence', 'chunk-change-lead') },
      { id: 'main-changes', kind: 'main', durationMinutes: timing.main, teacherActions: `Model the new-substance rule for ${timing.model} minutes; pairs practise all four cases for ${timing.practice}, compare evidence for ${timing.compare}, then share a correction for ${timing.share}. Use descriptions only: melting ice and tearing paper are physical with no new substance; rusting iron and cooking an egg are chemical with a new substance.`, learnerActions: 'Classify melting ice, tearing paper, rusting iron, and cooking an egg and state whether a new substance forms in each; explain why difficult-to-reverse tearing paper stays physical. Use equivalent spoken descriptions and spoken or static responses without visual access or body movement.', objectiveIds, sourceChunkIds: sourceIds('chunk-change-cases', 'chunk-change-sequence', 'chunk-change-lead') },
      { id: 'closing-changes', kind: 'closing', durationMinutes: timing.closing, teacherActions: 'Keep the case cards displayed or read aloud and give each learner an individual response sheet or equivalent; collect simultaneous answers for all four cases.', learnerActions: 'Each learner submits classification and new-substance evidence for every case using written, recorded, or selectable answers, with spoken descriptions and responses available without visual access or body movement.', objectiveIds, sourceChunkIds: sourceIds('chunk-change-assessment', 'chunk-change-lead') },
    ],
    checksForUnderstanding: [{
      id: 'check-changes', prompt: 'For each of melting ice, tearing paper, rusting iron, and cooking an egg, select physical or chemical and state whether a new substance forms.',
      expectedEvidence: 'Reference answer key: melting ice is physical because no new substance forms; tearing paper is physical because no new substance forms; rusting iron is chemical because a new substance forms; cooking an egg is chemical because a new substance forms. Possible misconception: every difficult-to-reverse change is chemical. Correction: tearing paper stays paper, so it is physical despite being difficult to reverse.',
      scoringCriteria: { perCase: { pointsPerCriterion: 1, criteria: ['classification', 'new_substance_evidence'], caseCount: 4 }, totalPoints: 8 },
      objectiveIds, sourceChunkIds: sourceIds('chunk-change-cases', 'chunk-change-assessment'),
    }],
    differentiation: ['For every case task, including closing, provide equivalent spoken descriptions and static or spoken responses without visual access or body movement.'],
    safetyNotes: ['Use prepared descriptions only. Do not heat, cook, burn, or handle rusting samples.'],
  })
}
