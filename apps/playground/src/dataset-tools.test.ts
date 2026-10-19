import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { datasetItemsToJsonl, reviewEvaluationReportsToDatasetItems } from './dataset-tools.js'
import { runReviewEvaluation } from './review-eval.js'

test('review-evaluation dataset export deduplicates frozen cases and keeps the latest observed judge run', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nova-review-dataset-'))
  const previousReportsDirectory = process.env.PLAYGROUND_REPORTS_DIR
  process.env.PLAYGROUND_REPORTS_DIR = path.join(directory, 'runs')

  try {
    const report = await runReviewEvaluation({ live: false, reportDirectory: path.join(directory, 'review-evals') })
    const laterReport = {
      ...report,
      evalRunId: 'later-eval-run',
      createdAt: new Date(Date.parse(report.createdAt) + 60_000).toISOString(),
      cases: report.cases.map((item) => ({
        ...item,
        evalScoreDelivery: { status: 'failed' as const, message: 'latest observation' },
      })),
    }
    const items = reviewEvaluationReportsToDatasetItems([report, laterReport], 'review-evaluation')
    const reversedItems = reviewEvaluationReportsToDatasetItems([laterReport, report], 'review-evaluation')

    assert.equal(items.length, 4)
    assert.equal(new Set(items.map(({ id }) => id)).size, items.length)
    assert.equal(datasetItemsToJsonl(items), datasetItemsToJsonl(reversedItems))
    assert.ok(items.every(({ metadata }) => metadata.evalRunId === 'later-eval-run'))
    assert.ok(items.every(({ metadata }) => typeof metadata.evalScoreDelivery === 'object' && metadata.evalScoreDelivery !== null && 'message' in metadata.evalScoreDelivery && metadata.evalScoreDelivery.message === 'latest observation'))
    const corrupted = items.find(({ metadata }) => metadata.label === 'corrupted')
    const clean = items.find(({ metadata }) => metadata.label === 'clean')
    assert.ok(corrupted && typeof corrupted.expectedOutput === 'object' && corrupted.expectedOutput !== null && 'expectedDefectPresent' in corrupted.expectedOutput)
    assert.ok(clean && typeof clean.expectedOutput === 'object' && clean.expectedOutput !== null && 'expectedDefectPresent' in clean.expectedOutput)
    assert.equal(corrupted.expectedOutput.expectedDefectPresent, true)
    assert.equal(clean.expectedOutput.expectedDefectPresent, false)
    assert.ok(corrupted && !JSON.stringify(corrupted.input).includes('observedFindings'))
    assert.ok(corrupted && 'observedFindings' in corrupted.metadata)
    const observedEvaluation = corrupted?.metadata.observedEvaluation
    assert.ok(typeof observedEvaluation === 'object' && observedEvaluation !== null && 'explanationQuality' in observedEvaluation)
  } finally {
    if (previousReportsDirectory === undefined) delete process.env.PLAYGROUND_REPORTS_DIR
    else process.env.PLAYGROUND_REPORTS_DIR = previousReportsDirectory
    await rm(directory, { recursive: true, force: true })
  }
})
