import { createHash } from 'node:crypto'

export type DatasetItem = {
  id: string
  datasetName: string
  input: unknown
  expectedOutput?: unknown
  metadata: Record<string, unknown>
  sourceTraceId?: string
}

type ApiEvaluationReport = {
  schemaVersion: 'api-evaluation-v1'
  evalRunId: string
  createdAt: string
  apiUrl: string
  durationMinutes: number
  target: Record<string, unknown>
  requests: Record<string, string | undefined>
  generation: {
    planId: string
    versionId: string
    qa: unknown
    rubricQa?: { traceId?: string; [key: string]: unknown }
  }
  validation: { traceId?: string; [key: string]: unknown }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.fromEntries(
        Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)),
      )
    }
    return entry
  })
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function apiReportsToDatasetItems(
  reports: readonly unknown[],
  datasetName: string,
): DatasetItem[] {
  if (!datasetName.trim()) throw new Error('A dataset name is required.')
  const unique = new Map<string, DatasetItem>()
  for (const value of reports) {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('schemaVersion' in value) ||
      value.schemaVersion !== 'api-evaluation-v1'
    )
      continue
    const report = value as ApiEvaluationReport
    const id = digest({ datasetName, evalRunId: report.evalRunId })
    const item: DatasetItem = {
      id,
      datasetName,
      input: { target: report.target, durationMinutes: report.durationMinutes },
      expectedOutput: { deterministicQa: report.generation.qa, rubricQa: report.validation },
      metadata: {
        exportVersion: 'api-evaluation-dataset-v1',
        evalRunId: report.evalRunId,
        createdAt: report.createdAt,
        apiUrl: report.apiUrl,
        planId: report.generation.planId,
        versionId: report.generation.versionId,
        generationRubricQa: report.generation.rubricQa ?? null,
        requestIds: report.requests,
        generationTraceId: report.generation.rubricQa?.traceId ?? null,
        validationTraceId: report.validation.traceId ?? null,
      },
      ...(report.validation.traceId ? { sourceTraceId: report.validation.traceId } : {}),
    }
    const previous = unique.get(id)
    if (previous && canonicalJson(previous) !== canonicalJson(item))
      throw new Error(`Conflicting API evaluation snapshots for ${id}.`)
    unique.set(id, item)
  }
  return [...unique.values()].sort((left, right) => left.id.localeCompare(right.id))
}

export function datasetItemsToJsonl(items: readonly DatasetItem[]): string {
  return items.length
    ? `${[...items]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(canonicalJson)
        .join('\n')}\n`
    : ''
}

export async function syncLangfuseDataset(
  items: readonly DatasetItem[],
  options: { datasetName: string; description?: string },
): Promise<{ datasetName: string; syncedItemIds: string[] }> {
  if (
    !options.datasetName.trim() ||
    items.some((item) => item.datasetName !== options.datasetName)
  ) {
    throw new Error('Every item must belong to the requested dataset.')
  }
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!publicKey || !secretKey)
    throw new Error('LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required to sync a dataset.')
  const host = (process.env.LANGFUSE_HOST ?? 'http://localhost:3002').replace(/\/+$/, '')
  const headers = {
    Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
    'Content-Type': 'application/json',
  }
  const request = (endpoint: string, body?: unknown) =>
    fetch(`${host}${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  const endpoint = `/api/public/v2/datasets/${encodeURIComponent(options.datasetName)}`
  const existing = await request(endpoint)
  if (existing.status === 404) {
    const created = await request('/api/public/v2/datasets', {
      name: options.datasetName,
      description: options.description,
    })
    if (!created.ok && (created.status !== 409 || !(await request(endpoint)).ok)) {
      throw new Error(`Langfuse dataset creation returned HTTP ${created.status}.`)
    }
  } else if (!existing.ok) {
    throw new Error(`Langfuse dataset lookup returned HTTP ${existing.status}.`)
  }
  const syncedItemIds: string[] = []
  for (const item of [...items].sort((left, right) => left.id.localeCompare(right.id))) {
    const response = await request('/api/public/dataset-items', item)
    if (!response.ok)
      throw new Error(
        `Langfuse dataset item ${item.id} returned HTTP ${response.status}; rerun to resume with the same item IDs.`,
      )
    syncedItemIds.push(item.id)
  }
  return { datasetName: options.datasetName, syncedItemIds }
}
