import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export class PlaygroundError extends Error {
  constructor(
    readonly code: string,
    readonly stage: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message)
  }
}

export type CommandFailureReport = {
  schemaVersion: 'playground-command-error-v1'
  reportId: string
  createdAt: string
  command: string
  traceId?: string
  stage: string
  errorCode: string
  message: string
  retryable: boolean
}

export function failureDetails(error: unknown): Pick<CommandFailureReport, 'stage' | 'errorCode' | 'message' | 'retryable'> {
  if (error instanceof PlaygroundError) {
    return { stage: error.stage, errorCode: error.code, message: error.message, retryable: error.retryable }
  }
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    const code = error.code
    const stage = 'stage' in error && typeof error.stage === 'string'
      ? error.stage
      : code.startsWith('PROVIDER_') ? 'provider'
        : code.startsWith('EMBEDDING_') ? 'retrieval_embedding'
          : 'command'
    const retryable = 'retryable' in error && typeof error.retryable === 'boolean' ? error.retryable : false
    return { stage, errorCode: code, message: error.message, retryable }
  }
  return {
    stage: 'command',
    errorCode: 'PLAYGROUND_UNEXPECTED_ERROR',
    message: error instanceof Error ? error.message : 'Unknown playground error.',
    retryable: false,
  }
}

export async function writeCommandFailureReport(error: unknown, command: string, traceId?: string): Promise<string> {
  const reportId = randomUUID()
  const report: CommandFailureReport = {
    schemaVersion: 'playground-command-error-v1',
    reportId,
    createdAt: new Date().toISOString(),
    command,
    ...(traceId ? { traceId } : {}),
    ...failureDetails(error),
  }
  const directory = path.resolve(process.env.PLAYGROUND_FAILURES_DIR ?? '.cache/playground/errors')
  await mkdir(directory, { recursive: true })
  const reportPath = path.join(directory, `${reportId}.json`)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  return reportPath
}
