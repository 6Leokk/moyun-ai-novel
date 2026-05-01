import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import fs from 'fs'
import path from 'path'
import { agentRuns, userAiPreferences } from '../src/db/schema'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const RUN_ID = '22222222-2222-4222-8222-222222222222'
const PLAN = { chapterGoal: '原始目标', scenes: [] }
const CONFIRMED_PLAN = { chapterGoal: '用户确认后的目标', scenes: [{ id: 's1', title: '开场' }] }

let selectRows: any[] = []
let updatePayloads: any[] = []
let insertPayloads: any[] = []

function makeSelectChain() {
  return {
    from() { return this },
    innerJoin() { return this },
    where() { return this },
    orderBy() { return this },
    limit: vi.fn(async () => selectRows),
  }
}

function makeUpdateChain() {
  return {
    set(payload: any) {
      updatePayloads.push(payload)
      return {
        where() {
          return {
            returning: vi.fn(async () => [{ id: 'pref-1', userId: USER_ID, ...payload }]),
          }
        },
      }
    },
  }
}

function makeInsertChain() {
  return {
    values(payload: any) {
      insertPayloads.push(payload)
      return {
        returning: vi.fn(async () => [{ id: 'pref-1', ...payload }]),
      }
    },
  }
}

vi.mock('../src/db/connection', () => ({
  getDb: () => ({
    select: vi.fn(() => makeSelectChain()),
    update: vi.fn(() => makeUpdateChain()),
    insert: vi.fn(() => makeInsertChain()),
  }),
}))

async function buildApp() {
  const app = Fastify()
  app.addHook('preHandler', async (request) => {
    ;(request as any).userId = USER_ID
  })
  const { registerAgentRunRoutes } = await import('../src/routes/agent-runs')
  const { registerAISettingsRoutes } = await import('../src/routes/ai-settings')
  registerAgentRunRoutes(app)
  registerAISettingsRoutes(app)
  return app
}

describe('Agent closure schema contract', () => {
  it('stores original and confirmed plans separately', () => {
    expect((agentRuns as any).plan.name).toBe('plan')
    expect((agentRuns as any).confirmedPlan.name).toBe('confirmed_plan')
  })

  it('stores user-level automation preferences', () => {
    expect((userAiPreferences as any).autoPlanApprovalMode.name).toBe('auto_plan_approval_mode')
    expect((userAiPreferences as any).autoResultHandlingMode.name).toBe('auto_result_handling_mode')
  })
})

describe('Agent closure migration contract', () => {
  it('adds the confirmed plan and automation preference columns', () => {
    const migration = fs.readFileSync(path.resolve(process.cwd(), 'src/db/migrations/0002_agent_closure.sql'), 'utf8')

    expect(migration).toContain('ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS confirmed_plan jsonb')
    expect(migration).toContain('ALTER TABLE user_ai_preferences ADD COLUMN IF NOT EXISTS auto_plan_approval_mode')
    expect(migration).toContain("DEFAULT 'manual'")
    expect(migration).toContain('ALTER TABLE user_ai_preferences ADD COLUMN IF NOT EXISTS auto_result_handling_mode')
  })
})

describe('Agent run route contract', () => {
  beforeEach(() => {
    selectRows = []
    updatePayloads = []
    insertPayloads = []
  })

  it('confirm-plan persists confirmedPlan without overwriting the original plan', async () => {
    const app = await buildApp()
    selectRows = [{
      run: { id: RUN_ID, status: 'running', phase: 'planning', plan: PLAN },
      owner: USER_ID,
    }]

    const res = await app.inject({
      method: 'POST',
      url: `/api/agent-runs/${RUN_ID}/confirm-plan`,
      payload: { confirmedPlan: CONFIRMED_PLAN },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'confirmed', confirmedPlan: CONFIRMED_PLAN })
    expect(updatePayloads).toContainEqual({
      confirmedPlan: CONFIRMED_PLAN,
      planStatus: 'confirmed',
    })
    expect(updatePayloads).not.toContainEqual(expect.objectContaining({ plan: expect.anything() }))

    await app.close()
  })
})

describe('AI settings route contract', () => {
  beforeEach(() => {
    selectRows = []
    updatePayloads = []
    insertPayloads = []
  })

  it('returns automation defaults from GET /api/settings', async () => {
    const app = await buildApp()

    const res = await app.inject({ method: 'GET', url: '/api/settings' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      autoPlanApprovalMode: 'manual',
      autoResultHandlingMode: 'manual',
    })

    await app.close()
  })

  it('saves automation preferences through PUT /api/settings', async () => {
    const app = await buildApp()
    selectRows = [{
      id: 'pref-1',
      userId: USER_ID,
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o',
      defaultTemp: 0.8,
      defaultMaxTokens: 4096,
      autoPlanApprovalMode: 'manual',
      autoResultHandlingMode: 'manual',
    }]

    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        autoPlanApprovalMode: 'auto_confirm',
        autoResultHandlingMode: 'auto_accept_safe',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(updatePayloads).toContainEqual({
      autoPlanApprovalMode: 'auto_confirm',
      autoResultHandlingMode: 'auto_accept_safe',
    })
    expect(res.json()).toMatchObject({
      autoPlanApprovalMode: 'auto_confirm',
      autoResultHandlingMode: 'auto_accept_safe',
    })

    await app.close()
  })
})
