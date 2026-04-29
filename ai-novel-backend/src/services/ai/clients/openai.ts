import { BaseAIClient } from './base.ts'

export class OpenAIClient extends BaseAIClient {
  async chatCompletion(params: {
    messages: Array<{ role: string; content?: string; tool_calls?: any[]; tool_call_id?: string }>
    model: string
    temperature?: number
    maxTokens?: number
    tools?: any[]
    toolChoice?: string
  }): Promise<{ content: string; toolCalls?: any[]; usage?: { promptTokens: number; completionTokens: number } }> {
    return this.requestWithRetry(async () => {
      const body: Record<string, unknown> = {
        model: params.model,
        messages: params.messages.map(m => {
          const entry: any = { role: m.role }
          if (m.content) entry.content = m.content
          if (m.tool_calls) entry.tool_calls = m.tool_calls
          if (m.tool_call_id) entry.tool_call_id = m.tool_call_id
          return entry
        }),
        temperature: params.temperature ?? 0.8,
        max_tokens: params.maxTokens ?? 4096,
      }
      if (params.tools?.length) {
        body.tools = params.tools
        body.tool_choice = params.toolChoice || 'auto'
      }

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.http.readTimeout),
      })

      if (!res.ok) {
        const err = await res.text()
        const e: any = new Error(`OpenAI error: ${res.status} ${err}`)
        e.status = res.status
        throw e
      }

      const data = await res.json() as any
      const msg = data.choices?.[0]?.message
      return {
        content: msg?.content || msg?.reasoning || '',
        toolCalls: msg?.tool_calls || undefined,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
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
    const body = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.8,
      max_tokens: params.maxTokens ?? 4096,
      stream: true,
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.http.readTimeout),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI stream error: ${res.status} ${err}`)
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
          if (data === '[DONE]') return

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.delta?.reasoning || ''
            if (content) yield content
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
