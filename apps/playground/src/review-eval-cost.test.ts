import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reviewEvaluationCostTotals } from './review-eval.js'

test('review evaluation totals use reported cost per case and estimate only when reported cost is missing', () => {
  const candidate = { id: 'deepseek', provider: 'baseten' as const, connectionId: 'direct' as const, model: 'deepseek-ai/DeepSeek-V4.1-Flash', displayName: 'DeepSeek' }
  const result = reviewEvaluationCostTotals([
    { review: { candidate, attempts: [
      { number: 1, prompt: 'x', usage: { promptTokens: 1000, completionTokens: 1000 }, reportedCostUsd: 0.04, elapsedMs: 1 },
      { number: 2, prompt: 'x', usage: { promptTokens: 1000, completionTokens: 1000 }, elapsedMs: 1 },
    ] } },
  ])

  assert.deepEqual(result, {
    reportedCostUsd: 0.04,
    estimatedCostUsd: 0.003,
    totalCostUsd: 0.0415,
    costSource: 'mixed',
    missingCostCount: 0,
  })
})

test('review evaluation labels a partial total when an attempt has no usable cost', () => {
  const candidate = { id: 'deepseek', provider: 'baseten' as const, connectionId: 'direct' as const, model: 'deepseek-ai/DeepSeek-V4.1-Flash', displayName: 'DeepSeek' }
  const result = reviewEvaluationCostTotals([
    { review: { candidate, attempts: [
      { number: 1, prompt: 'x', reportedCostUsd: 0.04, elapsedMs: 1 },
      { number: 2, prompt: 'x', elapsedMs: 1 },
    ] } },
  ])

  assert.equal(result.totalCostUsd, 0.04)
  assert.equal(result.costSource, 'partial')
  assert.equal(result.missingCostCount, 1)
})
