import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { generateAgent } from '../src/api/novel.js'
import { useAgentStore } from '../src/stores/agent.js'

function makeSSEStream(messages) {
  const encoder = new TextEncoder()
  const chunks = messages.map(message => encoder.encode(message))

  return {
    getReader() {
      return {
        async read() {
          if (chunks.length === 0) return { done: true }
          return { done: false, value: chunks.shift() }
        },
        releaseLock() {},
      }
    },
  }
}

describe('Agent SSE API', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    globalThis.localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      body: makeSSEStream([
        'event: agent:plan_ready\n',
        'data: {"runId":"run-1","plan":{"chapterGoal":"目标","scenes":[]}}\n\n',
      ]),
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.fetch
    delete globalThis.localStorage
  })

  it('dispatches agent:plan_ready to onPlanReady', async () => {
    const onPlanReady = vi.fn()

    await generateAgent('chapter-1', {
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    }, {
      onChunk: vi.fn(),
      onPhase: vi.fn(),
      onScene: vi.fn(),
      onTool: vi.fn(),
      onIssue: vi.fn(),
      onPlanPatch: vi.fn(),
      onResult: vi.fn(),
      onError: vi.fn(),
      onPlanReady,
    })

    expect(onPlanReady).toHaveBeenCalledWith({
      runId: 'run-1',
      plan: { chapterGoal: '目标', scenes: [] },
    })
  })
})

describe('Agent store', () => {
  it('records the run id and plan when plan_ready arrives', () => {
    const store = useAgentStore()

    store.setPlanReady({
      runId: 'run-1',
      plan: { chapterGoal: '目标', scenes: [] },
    })

    expect(store.currentRunId).toBe('run-1')
    expect(store.currentPlan).toEqual({ chapterGoal: '目标', scenes: [] })
  })

  it('keeps run status when phase events report transient phase status', () => {
    const store = useAgentStore()
    store.setRun('run-1', 'running', 'planning')

    store.updatePhase('writing', 'started')

    expect(store.phase).toBe('writing')
    expect(store.status).toBe('running')
  })
})
