import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

const state = vi.hoisted(() => ({
  selectRows: [] as any[],
  syncProjectToSQLite: vi.fn(async () => true),
  syncChapterFromSQLite: vi.fn(async () => true),
  refreshProjectCurrentWords: vi.fn(async () => undefined),
  execute: vi.fn(async () => ({ content: '生成正文', wordCount: 4, issues: [] })),
}))

vi.mock('../src/db/connection.ts', () => ({
  getDb: () => ({
    select() {
      return {
        from() { return this },
        innerJoin() { return this },
        where() { return this },
        limit: async () => state.selectRows.shift(),
      }
    },
    insert() {
      return {
        values: async () => undefined,
      }
    },
    update() {
      return {
        set() {
          return {
            where: async () => undefined,
          }
        },
      }
    },
  }),
}))

vi.mock('../src/services/project-sqlite-sync.ts', () => ({
  syncProjectToSQLite: state.syncProjectToSQLite,
  syncChapterFromSQLite: state.syncChapterFromSQLite,
}))

vi.mock('../src/services/project-stats.ts', () => ({
  refreshProjectCurrentWords: state.refreshProjectCurrentWords,
}))

vi.mock('../src/services/ai/service.ts', () => ({
  AIService: class AIService {
    constructor(_opts: unknown) {}
  },
}))

vi.mock('../src/services/agent-orchestrator.ts', () => ({
  AgentOrchestrator: class AgentOrchestrator {
    constructor(_opts: unknown) {}
    execute(mode: string) {
      return state.execute(mode)
    }
  },
}))

async function buildApp() {
  const app = Fastify()
  app.addHook('preHandler', async (request) => {
    ;(request as any).userId = 'user-1'
  })
  const { registerChapterAIRoutes } = await import('../src/routes/chapter-ai')
  registerChapterAIRoutes(app)
  await app.ready()
  return app
}

describe('chapter AI agent SQLite sync', () => {
  beforeEach(() => {
    state.selectRows = []
    state.syncProjectToSQLite.mockClear()
    state.syncChapterFromSQLite.mockClear()
    state.refreshProjectCurrentWords.mockClear()
    state.execute.mockClear()
  })

  it('refreshes SQLite before Agent execution and syncs the generated chapter back to PG', async () => {
    state.selectRows = [
      [{ chapters: { id: '33333333-3333-4333-8333-333333333333', projectId: '22222222-2222-4222-8222-222222222222' } }],
      [],
    ]
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/chapters/33333333-3333-4333-8333-333333333333/generate-agent',
      payload: {
        mode: 'generate',
        targetWords: 100,
        idempotencyKey: '44444444-4444-4444-8444-444444444444',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(state.syncProjectToSQLite).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222')
    expect(state.execute).toHaveBeenCalledWith('generate')
    expect(state.syncChapterFromSQLite).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    )
    expect(state.refreshProjectCurrentWords).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222')

    await app.close()
  })
})
