import { BaseAIClient } from '../clients/base.ts'

export abstract class BaseAIProvider {
  constructor(protected client: BaseAIClient) {}

  abstract generate(params: {
    prompt: string
    model: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
    tools?: any[]
    toolChoice?: string
  }): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }>

  abstract generateStream(params: {
    prompt: string
    model: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
    tools?: any[]
    toolChoice?: string
  }): AsyncGenerator<string>
}
