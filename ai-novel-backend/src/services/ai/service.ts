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

const LLM_LOG_PHASE_MAX_LENGTH = 20

export function toLlmLogPhase(genType: string): string {
  return genType.slice(0, LLM_LOG_PHASE_MAX_LENGTH)
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
          phase: toLlmLogPhase(params.genType),
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
        // Native function calling loop
        const messages: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }> = []
        if (params.systemPrompt) messages.push({ role: 'system', content: params.systemPrompt })
        messages.push({ role: 'user', content: params.prompt })

        const openaiTools = params.tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: {
              type: 'object',
              properties: t.input_schema?.properties || {},
              required: t.input_schema?.required || [],
            },
          },
        }))

        // Use OpenAI client directly for native function calling
        const openaiClient = (provider as any).client as OpenAIClient
        if (!openaiClient?.chatCompletion) {
          // Fallback: plain stream for non-OpenAI providers
          for await (const chunk of provider.generateStream({ prompt: params.prompt, model: params.model || this.model, temperature: params.temperature, maxTokens: params.maxTokens, systemPrompt: params.systemPrompt })) {
            totalText += chunk; yield { type: 'chunk', text: chunk }
          }
          return
        }

        // Attempt native function calling; fall back to plain stream on first failure
        let useFallback = false

        let maxIterations = 10

        while (maxIterations-- > 0) {
          const result = await openaiClient.chatCompletion({
            messages,
            model: params.model || this.model,
            temperature: params.temperature ?? this.temperature,
            maxTokens: params.maxTokens ?? this.maxTokens,
            tools: openaiTools,
            toolChoice: 'auto',
          })

          const text = result.content || ''
          const toolCalls = result.toolCalls

          if (toolCalls?.length) {
            messages.push({ role: 'assistant', content: text || null, tool_calls: toolCalls } as any)

            for (const tc of toolCalls) {
              const fn = tc.function
              let args = {}
              try { args = JSON.parse(fn.arguments || '{}') } catch {}
              yield { type: 'tool_call', tool: fn.name, args }

              try {
                const toolResult = await params.onToolCall(fn.name, args)
                yield { type: 'tool_result', tool: fn.name, result: toolResult }
                messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResult) } as any)
              } catch (e: any) {
                messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: e.message }) } as any)
              }
            }
            continue
          }

          if (text) {
            totalText = text
            yield { type: 'chunk', text }
            break
          }
          // If first iteration produced nothing (no content, no tool calls), fall back to plain stream
          if (maxIterations === 9) { useFallback = true; break }
          break
        }

        if (useFallback) {
          for await (const chunk of provider.generateStream({ prompt: params.prompt, model: params.model || this.model, temperature: params.temperature, maxTokens: params.maxTokens, systemPrompt: params.systemPrompt })) {
            totalText += chunk; yield { type: 'chunk', text: chunk }
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
