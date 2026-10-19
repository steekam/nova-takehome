import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commandMetricLabel, reportReviewEvaluationScores } from './telemetry.js'

test('unknown CLI commands share a bounded Prometheus label', () => {
  assert.equal(commandMetricLabel('generate'), 'generate')
  assert.equal(commandMetricLabel('made-up-command'), 'unknown')
  assert.equal(commandMetricLabel('another-typo'), 'unknown')
})

test('review evaluation does not score unexpected findings when the review is invalid', async () => {
  const previousPublicKey = process.env.LANGFUSE_PUBLIC_KEY
  const previousSecretKey = process.env.LANGFUSE_SECRET_KEY
  const previousHost = process.env.LANGFUSE_HOST
  const previousFetch = globalThis.fetch
  let sentScores: Array<{ name: string }> = []
  process.env.LANGFUSE_PUBLIC_KEY = 'test-public'
  process.env.LANGFUSE_SECRET_KEY = 'test-secret'
  process.env.LANGFUSE_HOST = 'http://langfuse.test'
  globalThis.fetch = async (_input, init) => {
    sentScores = JSON.parse(String(init?.body)) as Array<{ name: string }>
    return new Response(null, { status: 200 })
  }

  try {
    const result = await reportReviewEvaluationScores({
      traceId: '1'.repeat(32),
      observationId: '2'.repeat(16),
      evalRunId: 'eval-1',
      caseId: 'particles-corrupted',
      inputHash: 'a'.repeat(64),
      labelSet: 'cbc-review-v3',
      judgeProvider: 'litellm',
      judgeModel: 'lesson-planner',
      route: 'litellm',
      expectedDefect: true,
      expectedDefectDetected: false,
      expectedBehaviorPassed: false,
      noUnexpectedFindings: undefined,
      schemaValid: false,
    })

    assert.equal(result.status, 'sent')
    assert.ok(sentScores.some(({ name }) => name === 'review_eval_schema_valid'))
    assert.ok(!sentScores.some(({ name }) => name === 'review_eval_no_unexpected_findings'))
  } finally {
    globalThis.fetch = previousFetch
    if (previousPublicKey === undefined) delete process.env.LANGFUSE_PUBLIC_KEY
    else process.env.LANGFUSE_PUBLIC_KEY = previousPublicKey
    if (previousSecretKey === undefined) delete process.env.LANGFUSE_SECRET_KEY
    else process.env.LANGFUSE_SECRET_KEY = previousSecretKey
    if (previousHost === undefined) delete process.env.LANGFUSE_HOST
    else process.env.LANGFUSE_HOST = previousHost
  }
})
