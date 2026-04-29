import { BaseAIClient } from './base.ts'

export class AnthropicClient extends BaseAIClient {
  async chatCompletion(params: {
    messages: Array<{ role: string; content: string }>
    model: string
    temperature?: number
    maxTokens?: number
  }): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
    return this.requestWithRetry(async () => {
      // Convert messages to Anthropic format
      const systemMsg = params.messages.find(m => m.role === 'system')
      const userMsgs = params.messages.filter(m => m.role !== 'system')

      const body: Record<string, unknown> = {
        model: params.model,
        messages: userMsgs.map(m => ({ role: m.role, content: m.content })),
        temperature: params.temperature ?? 0.8,
        max_tokens: params.maxTokens ?? 4096,
      }
      if (systemMsg) body.system = systemMsg.content

      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.http.readTimeout),
      })

      if (!res.ok) {
        const err = await res.text()
        const e: any = new Error(`Anthropic error: ${res.status} ${err}`)
        e.status = res.status
        throw e
      }

      const data = await res.json() as any
      const textBlock = data.content?.find((b: any) => b.type === 'text')
      return {
        content: textBlock?.text || '',
        usage: data.usage ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
        } : undefined,
      }
    })
  }

  async *chatCompletionStream(params: {
    messages: Array<{ role: string; content: string }>
    model: string
    temperature?: number
    maxTokens?: number
  }): AsyncGenerator<string> {
    const systemMsg = params.messages.find(m => m.role === 'system')
    const userMsgs = params.messages.filter(m => m.role !== 'system')

    const body: Record<string, unknown> = {
      model: params.model,
      messages: userMsgs.map(m => ({ role: m.role, content: m.content })),
      temperature: params.temperature ?? 0.8,
      max_tokens: params.maxTokens ?? 4096,
      stream: true,
    }
    if (systemMsg) body.system = systemMsg.content

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.http.readTimeout),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Anthropic stream error: ${res.status} ${err}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)

          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
