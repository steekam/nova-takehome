import { makePromptTemplate, PROMPT_VERSION, renderPromptTemplate } from './prompt.js'
import type { FixtureId } from './corpus.js'
import type { CorpusChunk } from './domain.js'

export const GENERATION_PROMPT_NAME = 'nova-lesson-generation'
export const GENERATION_PROMPT_LABEL = 'production'
export const GENERATION_PROMPT_FIXTURES = ['particles', 'changes'] as const

export function generationPromptName(fixtureId: FixtureId): string {
  return fixtureId === 'particles' ? GENERATION_PROMPT_NAME : `${GENERATION_PROMPT_NAME}-${fixtureId}`
}

export type ResolvedGenerationPrompt = {
  name: string
  version: string
  source: 'local' | 'langfuse'
  template: string
  fallbackReason?: string
}

function promptAuth(): { headers: Record<string, string>; host: string } | undefined {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!publicKey || !secretKey) return undefined
  return {
    host: (process.env.LANGFUSE_HOST ?? 'http://localhost:3002').replace(/\/$/, ''),
    headers: {
      Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
  }
}

export async function resolveGenerationPrompt(fixtureId: FixtureId = 'particles'): Promise<ResolvedGenerationPrompt> {
  const name = generationPromptName(fixtureId)
  const fallback = { name, version: PROMPT_VERSION, source: 'local' as const, template: makePromptTemplate(fixtureId) }
  if (process.env.LANGFUSE_USE_MANAGED_PROMPTS !== 'true') return fallback

  const auth = promptAuth()
  if (!auth) return { ...fallback, fallbackReason: 'Langfuse credentials are missing.' }

  try {
    const response = await fetch(`${auth.host}/api/public/v2/prompts/${name}?label=${GENERATION_PROMPT_LABEL}`, {
      headers: auth.headers,
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return { ...fallback, fallbackReason: `Langfuse prompt lookup returned HTTP ${response.status}.` }
    const value: unknown = await response.json()
    if (typeof value !== 'object' || value === null || !('prompt' in value) || !('version' in value) || !('type' in value)) {
      return { ...fallback, fallbackReason: 'Langfuse returned an unsupported prompt format.' }
    }
    const prompt = value.prompt
    if (typeof prompt !== 'string' || typeof value.version !== 'number' || value.type !== 'text') {
      return { ...fallback, fallbackReason: 'Langfuse returned an unsupported prompt format.' }
    }
    const variables = ['scenario', 'allowed_source_chunks', 'allowed_source_ids', 'json_schema', 'repair', 'duration_guidance']
    if (variables.some((name) => !prompt.includes(`{{${name}}}`))) {
      return { ...fallback, fallbackReason: 'Langfuse prompt is missing required template variables.' }
    }
    return { name, version: String(value.version), source: 'langfuse', template: prompt }
  } catch {
    return { ...fallback, fallbackReason: 'Langfuse prompt lookup failed.' }
  }
}

export function buildGenerationPrompt(
  resolved: ResolvedGenerationPrompt,
  sources: CorpusChunk[],
  repairErrors: string[] = [],
  durationMinutes?: number,
): string {
  return renderPromptTemplate(resolved.template, sources, repairErrors, durationMinutes)
}

export async function publishGenerationPrompts(): Promise<Array<{ name: string; version: number }>> {
  const auth = promptAuth()
  if (!auth) throw new Error('LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required to publish a prompt.')
  const published: Array<{ name: string; version: number }> = []
  for (const fixtureId of GENERATION_PROMPT_FIXTURES) {
    const name = generationPromptName(fixtureId)
    const response = await fetch(`${auth.host}/api/public/v2/prompts`, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({
        name,
        type: 'text',
        prompt: makePromptTemplate(fixtureId),
        labels: [GENERATION_PROMPT_LABEL],
        config: { localVersion: PROMPT_VERSION },
        commitMessage: `Publish ${PROMPT_VERSION}`,
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`Langfuse prompt publish for ${name} returned HTTP ${response.status}.`)
    const value: unknown = await response.json()
    if (typeof value !== 'object' || value === null || !('version' in value) || typeof value.version !== 'number') {
      throw new Error(`Langfuse returned an invalid prompt publish response for ${name}.`)
    }
    published.push({ name, version: value.version })
  }
  return published
}
