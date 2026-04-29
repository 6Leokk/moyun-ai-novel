import { BaseAIProvider } from './base.ts'
import { AnthropicClient } from '../clients/anthropic.ts'

export class AnthropicProvider extends BaseAIProvider {
  constructor(client: AnthropicClient) {
    super(client)
  }

  async generate(params: {
    prompt: string
    model: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
  }): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
    const messages: Array<{ role: string; content: string }> = []
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt })
    }
    messages.push({ role: 'user', content: params.prompt })

    return this.client.chatCompletion({
      messages,
      model: params.model,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
    })
  }

  async *generateStream(params: {
    prompt: string
    model: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
  }): AsyncGenerator<string> {
    const messages: Array<{ role: string; content: string }> = []
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt })
    }
    messages.push({ role: 'user', content: params.prompt })

    yield* this.client.chatCompletionStream({
      messages,
      model: params.model,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
    })
  }
}
