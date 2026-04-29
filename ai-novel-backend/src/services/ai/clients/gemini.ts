import { BaseAIClient } from './base.ts'

export class GeminiClient extends BaseAIClient {
  async chatCompletion(params: {
    messages: Array<{ role: string; content: string }>
    model: string
    temperature?: number
    maxTokens?: number
  }): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
    return this.requestWithRetry(async () => {
      // Convert to Gemini format: contents array + systemInstruction
      const contents: any[] = []
      let systemInstruction: any = undefined

      for (const msg of params.messages) {
        if (msg.role === 'system') {
          systemInstruction = { parts: [{ text: msg.content }] }
        } else {
          const role = msg.role === 'assistant' ? 'model' : 'user'
          contents.push({ role, parts: [{ text: msg.content }] })
        }
      }

      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          temperature: params.temperature ?? 0.8,
          maxOutputTokens: params.maxTokens ?? 4096,
        },
      }
      if (systemInstruction) body.systemInstruction = systemInstruction

      const url = `${this.baseUrl}/v1beta/models/${params.model}:generateContent?key=${this.apiKey}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.http.readTimeout),
      })

      if (!res.ok) {
        const err = await res.text()
        const e: any = new Error(`Gemini error: ${res.status} ${err}`)
        e.status = res.status
        throw e
      }

      const data = await res.json() as any
      const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || ''
      return {
        content: text,
        usage: data.usageMetadata ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
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
    const contents: any[] = []
    let systemInstruction: any = undefined

    for (const msg of params.messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] }
      } else {
        const role = msg.role === 'assistant' ? 'model' : 'user'
        contents.push({ role, parts: [{ text: msg.content }] })
      }
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.8,
        maxOutputTokens: params.maxTokens ?? 4096,
      },
    }
    if (systemInstruction) body.systemInstruction = systemInstruction

    const url = `${this.baseUrl}/v1beta/models/${params.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.http.readTimeout),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Gemini stream error: ${res.status} ${err}`)
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
            const text = parsed.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('')
            if (text) yield text
          } catch {
            // Skip
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
