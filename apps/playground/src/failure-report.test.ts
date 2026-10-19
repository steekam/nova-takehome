import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { failureDetails, PlaygroundError, writeCommandFailureReport } from './failure-report.js'

test('classified failures preserve stage, code and retryability in the local report', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nova-command-failure-'))
  const previousDirectory = process.env.PLAYGROUND_FAILURES_DIR
  process.env.PLAYGROUND_FAILURES_DIR = directory
  try {
    const error = new PlaygroundError('EMBEDDING_MODEL_LOAD_FAILED', 'retrieval_embedding', 'Model download timed out.', true)
    const reportPath = await writeCommandFailureReport(error, 'generate', 'a'.repeat(32))
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as Record<string, unknown>

    assert.equal(report.errorCode, 'EMBEDDING_MODEL_LOAD_FAILED')
    assert.equal(report.stage, 'retrieval_embedding')
    assert.equal(report.retryable, true)
    assert.equal(report.command, 'generate')
    assert.equal(report.traceId, 'a'.repeat(32))
  } finally {
    if (previousDirectory === undefined) delete process.env.PLAYGROUND_FAILURES_DIR
    else process.env.PLAYGROUND_FAILURES_DIR = previousDirectory
    await rm(directory, { recursive: true, force: true })
  }
})

test('unknown failures receive a stable fallback classification', () => {
  assert.deepEqual(failureDetails(new Error('unexpected')), {
    stage: 'command',
    errorCode: 'PLAYGROUND_UNEXPECTED_ERROR',
    message: 'unexpected',
    retryable: false,
  })
})
