import type { Candidate, CostEstimate, TokenUsage } from './domain.js'

const basetenEndpoint = 'https://inference.baseten.co/v1'
const pricingSource = 'https://www.baseten.co/pricing/'
const pricingCheckedAt = '2026-10-19'

const ratesByModel: Record<string, Omit<CostEstimate, 'usd' | 'pricingSource' | 'pricingCheckedAt'>> = {
  'deepseek-ai/DeepSeek-V4.1-Flash': {
    inputRateUsdPerMillion: 0.3,
    cachedInputRateUsdPerMillion: 0.007,
    outputRateUsdPerMillion: 1.2,
    pricingModel: 'deepseek-ai/DeepSeek-V4.1-Flash',
  },
  'zai-org/GLM-5.3-Flash': {
    inputRateUsdPerMillion: 0.15,
    cachedInputRateUsdPerMillion: 0.03,
    outputRateUsdPerMillion: 0.5,
    pricingModel: 'zai-org/GLM-5.3-Flash',
  },
}

export function mergeUsage(previous: TokenUsage | undefined, next: TokenUsage | undefined): TokenUsage | undefined {
  if (!previous && !next) return undefined
  const sum = (left: number | undefined, right: number | undefined) => left === undefined && right === undefined
    ? undefined
    : (left ?? 0) + (right ?? 0)
  return {
    promptTokens: sum(previous?.promptTokens, next?.promptTokens),
    cachedPromptTokens: sum(previous?.cachedPromptTokens, next?.cachedPromptTokens),
    completionTokens: sum(previous?.completionTokens, next?.completionTokens),
    totalTokens: sum(previous?.totalTokens, next?.totalTokens),
  }
}

export function estimateCost(candidate: Candidate, usage: TokenUsage | undefined): CostEstimate | undefined {
  if (candidate.provider !== 'baseten' || !usage || usage.promptTokens === undefined || usage.completionTokens === undefined) return undefined
  const endpoint = (process.env.OPENAI_COMPATIBLE_BASE_URL ?? process.env.BASETEN_BASE_URL ?? basetenEndpoint).replace(/\/+$/, '')
  if (endpoint !== basetenEndpoint) return undefined
  const rates = ratesByModel[candidate.model]
  if (!rates) return undefined
  const cachedInputTokens = Math.min(usage.promptTokens, usage.cachedPromptTokens ?? 0)
  const inputTokens = usage.promptTokens - cachedInputTokens
  const usd = (inputTokens * rates.inputRateUsdPerMillion
    + cachedInputTokens * rates.cachedInputRateUsdPerMillion
    + usage.completionTokens * rates.outputRateUsdPerMillion) / 1_000_000
  return {
    ...rates,
    usd: Number(usd.toFixed(8)),
    pricingSource,
    pricingCheckedAt,
  }
}
