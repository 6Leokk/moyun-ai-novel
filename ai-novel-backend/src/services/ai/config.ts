export interface AIClientConfig {
  http: {
    connectTimeout: number
    readTimeout: number
  }
  retry: {
    maxRetries: number
    baseDelay: number
    maxDelay: number
  }
  rateLimit: {
    maxConcurrentRequests: number
    requestDelay: number
  }
}

export const defaultConfig: AIClientConfig = {
  http: {
    connectTimeout: 30000,
    readTimeout: 300000, // 5 min for long generations
  },
  retry: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
  },
  rateLimit: {
    maxConcurrentRequests: 5,
    requestDelay: 200,
  },
}

export const AI_ERROR_CATEGORIES = [
  'rate_limited', 'content_filtered', 'context_overflow',
  'auth_error', 'network_error', 'provider_internal', 'timeout', 'unknown',
] as const

export type AIErrorCategory = typeof AI_ERROR_CATEGORIES[number]

export class AIError extends Error {
  constructor(
    public category: AIErrorCategory,
    message: string,
    public provider?: string,
    public statusCode?: number,
  ) {
    super(message)
    this.name = 'AIError'
  }
}

export const COST_PER_1K_TOKENS: Record<string, { prompt: number; completion: number }> = {
  'gpt-4o': { prompt: 0.0025, completion: 0.01 },
  'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
  'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
  'claude-3-5-sonnet-20241022': { prompt: 0.003, completion: 0.015 },
  'claude-3-haiku-20241022': { prompt: 0.00025, completion: 0.00125 },
  'gemini-2.0-flash': { prompt: 0.00015, completion: 0.0006 },
  'gemini-2.0-pro': { prompt: 0.00125, completion: 0.005 },
}
