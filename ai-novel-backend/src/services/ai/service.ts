import { getDb } from '../../db/connection.ts'
import { userAiKeys, userAiPreferences, projects, generationHistory, llmCallLogs } from '../../db/schema.ts'
import { eq, and } from 'drizzle-orm'
import { decryptApiKey } from '../../utils/crypto.ts'
import { OpenAIClient } from './clients/openai.ts'
import { AnthropicClient } from './clients/anthropic.ts'
import { GeminiClient } from './clients/gemini.ts'
import { OpenAIProvider } from './providers/openai.ts'
import { AnthropicProvider } from './providers/anthropic.ts'
import { GeminiProvider } from './providers/gemini.ts'
import { BaseAIProvider } from './providers/base.ts'
import { AIError, AIErrorCategory, COST_PER_1K_TOKENS, AIClientConfig, defaultConfig } from './config.ts'

interface AIServiceOptions {
  userId: string
  projectId?: string
  config?: AIClientConfig
}

interface GenerateParams {
  prompt: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  model?: string
}

interface GenerateResult {
  content: string
  usage?: { promptTokens: number; completionTokens: number }
}

export class AIService {
  private userId: string
  private projectId?: string
  private config: AIClientConfig
  private provider: string = 'openai'
  private baseUrl: string = 'https://api.openai.com/v1'
  private apiKey: string = ''
  private model: string = 'gpt-4o'
  private temperature: number = 0.8
  private maxTokens: number = 4096
  private initialized = false

  constructor(opts: AIServiceOptions) {
    this.userId = opts.userId
    this.projectId = opts.projectId
    this.config = opts.config || defaultConfig
  }

  private async init(): Promise<void> {
    if (this.initialized) return
    const db = getDb()

    // Resolve provider: project override → user default → env fallback
    if (this.projectId) {
      const proj = await db.select({
        aiKeyId: projects.aiKeyId,
        aiModel: projects.aiModel,
      }).from(projects).where(eq(projects.id, this.projectId)).limit(1)

      if (proj.length > 0 && proj[0].aiKeyId) {
        const key = await db.select()
          .from(userAiKeys)
          .where(and(eq(userAiKeys.id, proj[0].aiKeyId), eq(userAiKeys.userId, this.userId)))
          .limit(1)

        if (key.length > 0) {
          this.provider = key[0].provider
          this.apiKey = decryptApiKey(key[0].apiKeyEnc)
          this.baseUrl = key[0].apiBaseUrl || this.getDefaultBaseUrl(this.provider)
          this.model = proj[0].aiModel || 'gpt-4o'
          this.initialized = true
          return
        }
      }
      if (proj.length > 0 && proj[0].aiModel) {
        this.model = proj[0].aiModel
      }
    }

    // User default
    const prefs = await db.select()
      .from(userAiPreferences)
      .where(eq(userAiPreferences.userId, this.userId))
      .limit(1)

    if (prefs.length > 0) {
      this.provider = prefs[0].defaultProvider
      this.model = prefs[0].defaultModel
      this.temperature = prefs[0].defaultTemp
      this.maxTokens = prefs[0].defaultMaxTokens
    }

    // Get API key for this provider
    const keys = await db.select()
      .from(userAiKeys)
      .where(and(
        eq(userAiKeys.userId, this.userId),
        eq(userAiKeys.provider, this.provider as any),
        eq(userAiKeys.isDefault, true),
      ))
      .limit(1)

    if (keys.length > 0) {
      this.apiKey = decryptApiKey(keys[0].apiKeyEnc)
      this.baseUrl = keys[0].apiBaseUrl || this.getDefaultBaseUrl(this.provider)
    }

    this.initialized = true
  }

  private getDefaultBaseUrl(provider: string): string {
    switch (provider) {
      case 'openai': return 'https://api.openai.com/v1'
      case 'anthropic': return 'https://api.anthropic.com'
      case 'gemini': return 'https://generativelanguage.googleapis.com'
      default: return 'https://api.openai.com/v1'
    }
  }

  private createProvider(): BaseAIProvider {
    switch (this.provider) {
      case 'openai': return new OpenAIProvider(new OpenAIClient(this.apiKey, this.baseUrl, this.config))
      case 'anthropic': return new AnthropicProvider(new AnthropicClient(this.apiKey, this.baseUrl, this.config))
      case 'gemini': return new GeminiProvider(new GeminiClient(this.apiKey, this.baseUrl, this.config))
      default: throw new Error(`Unknown provider: ${this.provider}`)
    }
  }

  private calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const rates = COST_PER_1K_TOKENS[model] || COST_PER_1K_TOKENS['gpt-4o']
    return (promptTokens * rates.prompt + completionTokens * rates.completion) / 1000
  }

  private classifyError(e: any): AIErrorCategory {
    if (e.status === 429) return 'rate_limited'
    if (e.status === 401 || e.status === 403) return 'auth_error'
    if (e.status === 400 && e.message?.includes('context')) return 'context_overflow'
    if (e.status === 400 && (e.message?.includes('content') || e.message?.includes('safety'))) return 'content_filtered'
    if (e.name === 'AbortError' || e.message?.includes('timeout')) return 'timeout'
    if (e.status >= 500) return 'provider_internal'
    if (e.message?.includes('fetch') || e.message?.includes('ECONN')) return 'network_error'
    return 'unknown'
  }

  private async recordHistory(params: {
    genType: string
    projectId?: string
    chapterId?: string
    durationMs: number
    usage?: { promptTokens: number; completionTokens: number }
    status: 'success' | 'error'
    errorCategory?: AIErrorCategory
    errorMsg?: string
  }): Promise<void> {
    try {
      const db = getDb()
      const model = this.model
      const cost = params.usage
        ? this.calculateCost(model, params.usage.promptTokens, params.usage.completionTokens)
        : undefined

      await db.insert(generationHistory).values({
        userId: this.userId,
        projectId: params.projectId || this.projectId || null,
        chapterId: params.chapterId || null,
        genType: params.genType,
        provider: this.provider,
        model,
        promptTokens: params.usage?.promptTokens,
        completionTokens: params.usage?.completionTokens,
        costUsd: cost !== undefined ? String(cost) : null,
        durationMs: params.durationMs,
        errorCategory: params.errorCategory || null,
        status: params.status,
        errorMsg: params.errorMsg || null,
      } as any)

      try {
        await db.insert(llmCallLogs).values({
          projectId: params.projectId || this.projectId || null,
          chapterId: params.chapterId || null,
          phase: params.genType,
          provider: this.provider,
          model,
          requestType: 'chat',
          inputTokens: params.usage?.promptTokens ?? 0,
          outputTokens: params.usage?.completionTokens ?? 0,
          estimatedCost: cost !== undefined ? String(cost) : '0',
          latencyMs: params.durationMs,
          status: params.status,
          errorCode: params.errorCategory || null,
        } as any);
      } catch (e: any) { console.error("llm_call_logs insert failed:", e.message) }
    } catch (e) {
      console.warn('Failed to record generation history:', e)
    }
  }

  async generateText(params: GenerateParams, genType = 'text_generation'): Promise<GenerateResult> {
    await this.init()
    const provider = this.createProvider()
    const start = Date.now()

    try {
      const result = await provider.generate({
        prompt: params.prompt,
        model: params.model || this.model,
        temperature: params.temperature ?? this.temperature,
        maxTokens: params.maxTokens ?? this.maxTokens,
        systemPrompt: params.systemPrompt,
      })

      const duration = Date.now() - start
      this.recordHistory({
        genType,
        durationMs: duration,
        usage: result.usage,
        status: 'success',
      }).catch(() => {})

      return result
    } catch (e: any) {
      const category = this.classifyError(e)
      const duration = Date.now() - start
      this.recordHistory({
        genType,
        durationMs: duration,
        status: 'error',
        errorCategory: category,
        errorMsg: e.message,
      }).catch(() => {})

      throw new AIError(category, e.message, this.provider, e.status)
    }
  }

  async *generateWithTools(params: GenerateParams & { tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>; onToolCall?: (name: string, args: any) => Promise<any> }, genType = 'tool_generation'): AsyncGenerator<{ type: 'chunk' | 'tool_call' | 'tool_result'; text?: string; tool?: string; args?: any; result?: any }> {
    await this.init()
    const provider = this.createProvider()
    const start = Date.now()
    let totalText = ''

    try {
      if (!params.tools || params.tools.length === 0 || !params.onToolCall) {
        // Fallback: plain stream without tools
        for await (const chunk of provider.generateStream({
          prompt: params.prompt,
          model: params.model || this.model,
          temperature: params.temperature ?? this.temperature,
          maxTokens: params.maxTokens ?? this.maxTokens,
          systemPrompt: params.systemPrompt,
        })) {
          totalText += chunk
          yield { type: 'chunk', text: chunk }
        }
      } else {
        // Tool-use loop: prompt-based function calling via JSON
        const toolDefs = params.tools.map(t => `- ${t.name}: ${t.description} (args: ${JSON.stringify(t.input_schema)})`).join('\n')
        const toolPrompt = `${params.prompt}\n\n你可以调用以下工具获取信息。需要调用时，输出JSON格式: {"tool":"工具名","args":{...}}，调用结果会返回给你。\n\n可用工具：\n${toolDefs}`

        let currentPrompt = toolPrompt
        let maxIterations = 10

        while (maxIterations-- > 0) {
          const result = await this.generateText({
            prompt: currentPrompt,
            systemPrompt: params.systemPrompt,
            temperature: params.temperature,
            model: params.model,
            maxTokens: params.maxTokens,
          })

          const text = result.content
          // Check for tool call in response
          const toolMatch = text.match(/\{"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[^}]+\})\s*\}/)

          if (toolMatch) {
            const toolName = toolMatch[1]
            try {
              const args = JSON.parse(toolMatch[2])
              yield { type: 'tool_call', tool: toolName, args }

              const toolResult = await params.onToolCall(toolName, args)
              yield { type: 'tool_result', tool: toolName, result: toolResult }

              // Append result and continue
              currentPrompt = `${params.prompt}\n\n工具调用: ${toolName}\n结果: ${JSON.stringify(toolResult)}\n\n请继续写作。`
            } catch { break }
          } else {
            // No tool call, this is the final text
            totalText = text
            yield { type: 'chunk', text }
            break
          }
        }
      }

      const duration = Date.now() - start
      const estimatedTokens = Math.round(totalText.length / 2)
      this.recordHistory({ genType, durationMs: duration, usage: { promptTokens: 0, completionTokens: estimatedTokens }, status: 'success' }).catch(() => {})
    } catch (e: any) {
      const category = this.classifyError(e)
      const duration = Date.now() - start
      this.recordHistory({ genType, durationMs: duration, status: 'error', errorCategory: category, errorMsg: e.message }).catch(() => {})
      throw e
    }
  }

  async *generateStream(params: GenerateParams, genType = 'stream_generation'): AsyncGenerator<string> {
    await this.init()
    const provider = this.createProvider()
    const start = Date.now()
    let totalText = ''

    try {
      for await (const chunk of provider.generateStream({
        prompt: params.prompt,
        model: params.model || this.model,
        temperature: params.temperature ?? this.temperature,
        maxTokens: params.maxTokens ?? this.maxTokens,
        systemPrompt: params.systemPrompt,
      })) {
        totalText += chunk
        yield chunk
      }

      const duration = Date.now() - start
      const wordCount = totalText.length
      // Rough token estimate: Chinese ~2 chars/token, English ~4 chars/token
      const estimatedTokens = Math.round(wordCount / 2)
      this.recordHistory({
        genType,
        durationMs: duration,
        usage: { promptTokens: 0, completionTokens: estimatedTokens },
        status: 'success',
      }).catch(() => {})
    } catch (e: any) {
      const category = this.classifyError(e)
      const duration = Date.now() - start
      this.recordHistory({
        genType,
        durationMs: duration,
        status: 'error',
        errorCategory: category,
        errorMsg: e.message,
      }).catch(() => {})

      throw new AIError(category, e.message, this.provider, e.status)
    }
  }

  async generateJSON<T>(params: {
    prompt: string
    systemPrompt?: string
    maxRetries?: number
    temperature?: number
  }): Promise<T> {
    const maxRetries = params.maxRetries ?? 3
    let lastResponse = ''

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let currentPrompt = params.prompt
      if (attempt > 1) {
        currentPrompt = `${params.prompt}\n\n⚠️ 第${attempt}次重试，请返回纯JSON，不要用markdown代码块包裹。上次返回内容: ${lastResponse.slice(0, 200)}...`
      }

      const result = await this.generateText({
        prompt: currentPrompt,
        systemPrompt: params.systemPrompt,
        temperature: (params.temperature ?? 0.3) + (attempt - 1) * 0.1,
      }, 'json_generation')

      lastResponse = result.content

      // Clean JSON response
      let cleaned = result.content.trim()
      // Remove markdown code fences
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```$/gm, '')
      cleaned = cleaned.trim()

      try {
        return JSON.parse(cleaned) as T
      } catch (e) {
        if (attempt === maxRetries) {
          throw new AIError('unknown', `JSON解析失败(尝试${attempt}次)`, this.provider)
        }
      }
    }

    throw new AIError('unknown', 'JSON生成失败', this.provider)
  }
}
