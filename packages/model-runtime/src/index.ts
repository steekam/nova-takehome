import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { APICallError, generateText } from 'ai'

export type ModelConnection = {
  id: string
  baseUrl: string
  apiKey?: string
  headers?: Record<string, string>
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type ModelCall = {
  connection: ModelConnection
  model: string
  system?: string
  prompt: string
  output?:
    | { type: 'json-object' }
    | { type: 'json-schema'; name: string; schema: Record<string, unknown> }
  timeoutMs?: number
  temperature?: number
  maxOutputTokens?: number
  disableThinking?: boolean
  reportedCostHeader?: string
}

export type ModelResponse = {
  content: string
  responseModel?: string
  finishReason?: string
  usage?: {
    inputTokens?: number
    cachedInputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
  reportedCostUsd?: number
}

export type ModelErrorCode =
  | 'PROVIDER_AUTH_ERROR'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_REQUEST_REJECTED'
  | 'PROVIDER_INVALID_RESPONSE'
  | 'PROVIDER_TIMEOUT'

export class ModelRuntimeError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'ModelRuntimeError'
  }
}

export async function callModel(call: ModelCall): Promise<ModelResponse> {
  let reportedCostUsd: number | undefined
  const provider = createOpenAICompatible({
    name: call.connection.id,
    baseURL: call.connection.baseUrl.replace(/\/$/, ''),
    ...(call.connection.apiKey ? { apiKey: call.connection.apiKey } : {}),
    ...(call.connection.headers ? { headers: call.connection.headers } : {}),
    includeUsage: true,
    fetch: async (input, init) => {
      const response = await fetch(input, init)
      const cost = call.reportedCostHeader ? response.headers.get(call.reportedCostHeader) : null
      const parsedCost = cost === null ? undefined : Number(cost)
      reportedCostUsd =
        parsedCost !== undefined && Number.isFinite(parsedCost) && parsedCost >= 0
          ? parsedCost
          : undefined
      return response
    },
  })

  try {
    const result = await generateText({
      model: provider.chatModel(call.model),
      ...(call.system ? { system: call.system } : {}),
      prompt: call.prompt,
      maxRetries: 0,
      timeout: { totalMs: call.timeoutMs ?? 90_000 },
      temperature: call.temperature ?? 0.2,
      maxOutputTokens: call.maxOutputTokens ?? 8192,
      providerOptions: {
        [call.connection.id]: {
          response_format:
            call.output?.type === 'json-schema'
              ? {
                  type: 'json_schema',
                  json_schema: {
                    name: call.output.name,
                    strict: true,
                    schema: JSON.parse(JSON.stringify(call.output.schema)) as JsonValue,
                  },
                }
              : { type: 'json_object' },
          ...(call.disableThinking ? { chat_template_kwargs: { thinking: false } } : {}),
        },
      },
    })

    return {
      content: result.text,
      responseModel: result.response.modelId,
      finishReason: result.finishReason,
      usage: {
        inputTokens: result.usage.inputTokens,
        cachedInputTokens: result.usage.inputTokenDetails.cacheReadTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      },
      reportedCostUsd,
    }
  } catch (error) {
    throw classifyModelError(error)
  }
}

function classifyModelError(error: unknown): ModelRuntimeError {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode
    if (
      error.cause instanceof Error &&
      (error.cause.name === 'TimeoutError' || error.cause.name === 'AbortError')
    ) {
      return new ModelRuntimeError('PROVIDER_TIMEOUT', 'The model request timed out.', true)
    }
    const code: ModelErrorCode =
      status === 401 || status === 403
        ? 'PROVIDER_AUTH_ERROR'
        : status === 429
          ? 'PROVIDER_RATE_LIMITED'
          : status === 408 || status === undefined || status >= 500
            ? 'PROVIDER_UNAVAILABLE'
            : status >= 200 && status < 300
              ? 'PROVIDER_INVALID_RESPONSE'
              : 'PROVIDER_REQUEST_REJECTED'
    const retryable =
      code !== 'PROVIDER_AUTH_ERROR' &&
      code !== 'PROVIDER_REQUEST_REJECTED' &&
      (error.isRetryable ||
        status === undefined ||
        status === 408 ||
        status === 429 ||
        status >= 500)
    return new ModelRuntimeError(
      code,
      safeMessage(code),
      retryable,
      parseRetryAfter(error.responseHeaders),
    )
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new ModelRuntimeError('PROVIDER_TIMEOUT', 'The model request timed out.', true)
  }
  if (error instanceof TypeError) {
    return new ModelRuntimeError('PROVIDER_UNAVAILABLE', safeMessage('PROVIDER_UNAVAILABLE'), true)
  }
  return new ModelRuntimeError(
    'PROVIDER_INVALID_RESPONSE',
    safeMessage('PROVIDER_INVALID_RESPONSE'),
    false,
  )
}

function parseRetryAfter(headers: Record<string, string> | undefined): number | undefined {
  const value = Object.entries(headers ?? {})
    .find(([name]) => name.toLowerCase() === 'retry-after')?.[1]
    ?.trim()
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined
}

function safeMessage(code: ModelErrorCode): string {
  const messages: Record<ModelErrorCode, string> = {
    PROVIDER_AUTH_ERROR: 'The model provider rejected its credentials or model access.',
    PROVIDER_RATE_LIMITED: 'The model provider rate limited the request.',
    PROVIDER_UNAVAILABLE: 'The model provider is unavailable.',
    PROVIDER_REQUEST_REJECTED: 'The model provider rejected the request.',
    PROVIDER_INVALID_RESPONSE: 'The model provider returned an invalid response.',
    PROVIDER_TIMEOUT: 'The model request timed out.',
  }
  return messages[code]
}
