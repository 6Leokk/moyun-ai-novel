import { AIClientConfig, defaultConfig } from '../config.ts'

export abstract class BaseAIClient {
  protected apiKey: string
  protected baseUrl: string
  protected config: AIClientConfig

  constructor(apiKey: string, baseUrl: string, config?: AIClientConfig) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.config = config || defaultConfig
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  protected async requestWithRetry<T>(
    fn: () => Promise<T>,
    stream = false,
  ): Promise<T> {
    const { maxRetries, baseDelay, maxDelay } = this.config.retry

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (e: any) {
        if (attempt === maxRetries) throw e
        // Don't retry auth errors
        if (e.status === 401 || e.status === 403) throw e

        const wait = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
        console.warn(`AI request failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${wait}ms:`, e.message)
        await this.delay(wait)
      }
    }
    throw new Error('Unreachable')
  }

  abstract chatCompletion(params: {
    messages: Array<{ role: string; content: string }>
    model: string
    temperature?: number
    maxTokens?: number
    tools?: any[]
    toolChoice?: string
  }): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }>

  abstract chatCompletionStream(params: {
    messages: Array<{ role: string; content: string }>
    model: string
    temperature?: number
    maxTokens?: number
  }): AsyncGenerator<string>
}
