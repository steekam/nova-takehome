import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LangfuseClient } from '@langfuse/client'

export interface LangfusePromptReference {
  name: string
  version: number
  isFallback: boolean
}

export interface ManagedPrompt {
  text: string
  model?: string
  reference?: LangfusePromptReference
}

@Injectable()
export class LangfusePrompts {
  private readonly client?: LangfuseClient
  private readonly label: string

  constructor(config: ConfigService) {
    this.label = config.get<string>('LANGFUSE_PROMPT_LABEL') ?? 'production'
    if (
      config.get<string>('LANGFUSE_USE_MANAGED_PROMPTS') === 'true' &&
      config.get<string>('LANGFUSE_PUBLIC_KEY') &&
      config.get<string>('LANGFUSE_SECRET_KEY')
    ) {
      this.client = new LangfuseClient({
        publicKey: config.get<string>('LANGFUSE_PUBLIC_KEY'),
        secretKey: config.get<string>('LANGFUSE_SECRET_KEY'),
        baseUrl: config.get<string>('LANGFUSE_BASE_URL') ?? config.get<string>('LANGFUSE_HOST'),
      })
    }
  }

  async get(
    name: string,
    fallback: string,
    variables: Record<string, string> = {},
  ): Promise<ManagedPrompt> {
    if (!this.client) return { text: fallback }
    const prompt = await this.client.prompt.get(name, {
      type: 'text',
      label: this.label,
      cacheTtlSeconds: 60,
      fallback,
    })
    const variablesAligned = hasPromptVariables(prompt.prompt, variables)
    const promptConfig = prompt.config
    const model =
      typeof promptConfig === 'object' &&
      promptConfig !== null &&
      'model' in promptConfig &&
      typeof promptConfig.model === 'string'
        ? promptConfig.model
        : undefined
    return {
      text: variablesAligned ? prompt.compile(variables) : fallback,
      model,
      reference: {
        name: prompt.name,
        version: prompt.version,
        isFallback: (prompt.isFallback ?? false) || !variablesAligned,
      },
    }
  }
}

export function hasPromptVariables(template: string, variables: Record<string, string>): boolean {
  return Object.keys(variables).every((name) => template.includes(`{{${name}}}`))
}
