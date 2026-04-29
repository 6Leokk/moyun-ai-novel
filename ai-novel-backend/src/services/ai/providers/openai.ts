import { BaseAIProvider } from './base.ts'
import { OpenAIClient } from '../clients/openai.ts'

export class OpenAIProvider extends BaseAIProvider {
  constructor(client: OpenAIClient) {
    super(client)
  }

  async generate(params: {
    prompt: string
    model: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
    tools?: any[]
    toolChoice?: string
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
      tools: params.tools,
      toolChoice: params.toolChoice,
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
