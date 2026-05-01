import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import fs from 'fs'
import path from 'path'
import { registerProjectRoutes } from '../src/routes/projects'
import { registerChapterRoutes } from '../src/routes/chapters'
import { registerCharacterRoutes } from '../src/routes/characters'
import { registerOutlineRoutes } from '../src/routes/outlines'

const state = vi.hoisted(() => ({ db: null as any }))

vi.mock('../src/db/connection.ts', () => ({
  getDb: () => state.db,
}))

function resultBuilder(value: unknown) {
  return {
    from() { return this },
    innerJoin() { return this },
    where() { return this },
    orderBy() { return Promise.resolve(value) },
    limit() { return Promise.resolve(value) },
    then(resolve: any, reject: any) {
      return Promise.resolve(value).then(resolve, reject)
    },
  }
}

function makeDb(results: unknown[]) {
  return {
    select() {
      return resultBuilder(results.shift())
    },
    insert() {
      return {
        values() {
          return {
            returning: async () => results.shift(),
          }
        },
      }
    },
    update() {
      return {
        set() {
          return {
            where() {
              return {
                returning: async () => results.shift(),
              }
            },
          }
        },
      }
    },
    delete() {
      return {
        where: async () => undefined,
      }
    },
  }
}

async function buildApp(register: (app: any) => void) {
  const app = Fastify()
  app.addHook('onRequest', async (request) => {
    ;(request as any).userId = 'user-1'
  })
  register(app)
  await app.ready()
  return app
}

describe('route response contracts used by the Vue app', () => {
  beforeEach(() => {
    state.db = null
  })

  it('wraps project list, detail, create, and update responses', async () => {
    const project = { id: 'project-1', userId: 'user-1', title: 'Novel', targetWords: 10000 }
    state.db = makeDb([[project], [project], [project], [project], [project]])
    const app = await buildApp(registerProjectRoutes)

    const list = await app.inject({ method: 'GET', url: '/api/projects' })
    expect(list.json()).toEqual({ projects: [project] })

    const detail = await app.inject({ method: 'GET', url: '/api/projects/project-1' })
    expect(detail.json()).toEqual({ project })

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { title: 'Novel' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toEqual({ project })

    const updated = await app.inject({
      method: 'PUT',
      url: '/api/projects/project-1',
      payload: { title: 'Novel 2' },
    })
    expect(updated.json()).toEqual({ project })

    await app.close()
  })

  it('wraps chapter responses and supports frontend chapter deletion', async () => {
    const chapter = { id: 'chapter-1', projectId: 'project-1', title: 'Chapter 1' }
    state.db = makeDb([
      [{ userId: 'user-1' }],
      [chapter],
      [{ userId: 'user-1' }],
      [chapter],
      [chapter],
      [{ chapters: chapter }],
      [{ chapters: chapter }],
      [chapter],
      [{ chapters: chapter }],
    ])
    const app = await buildApp(registerChapterRoutes)

    const list = await app.inject({ method: 'GET', url: '/api/projects/project-1/chapters' })
    expect(list.json()).toEqual({ chapters: [chapter] })

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects/project-1/chapters',
      payload: { title: 'Chapter 1' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toEqual({ chapter })

    const detail = await app.inject({ method: 'GET', url: '/api/chapters/chapter-1' })
    expect(detail.json()).toEqual({ chapter })

    const updated = await app.inject({
      method: 'PUT',
      url: '/api/chapters/chapter-1',
      payload: { title: 'Chapter 2' },
    })
    expect(updated.json()).toEqual({ chapter })

    const deleted = await app.inject({ method: 'DELETE', url: '/api/chapters/chapter-1' })
    expect(deleted.statusCode).toBe(204)

    await app.close()
  })

  it('wraps character responses used by the store', async () => {
    const character = { id: 'character-1', projectId: 'project-1', name: '主角' }
    state.db = makeDb([
      [{ userId: 'user-1' }],
      [character],
      [{ userId: 'user-1' }],
      [character],
      [{ characters: character }],
      [{ characters: character }],
      [character],
    ])
    const app = await buildApp(registerCharacterRoutes)

    const list = await app.inject({ method: 'GET', url: '/api/projects/project-1/characters' })
    expect(list.json()).toEqual({ characters: [character] })

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects/project-1/characters',
      payload: { name: '主角' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toEqual({ character })

    const detail = await app.inject({ method: 'GET', url: '/api/characters/character-1' })
    expect(detail.json()).toEqual({ character })

    const updated = await app.inject({
      method: 'PUT',
      url: '/api/characters/character-1',
      payload: { name: '主角2' },
    })
    expect(updated.json()).toEqual({ character })

    await app.close()
  })

  it('provides relationship routes with frontend field aliases', async () => {
    const routePath = path.resolve(process.cwd(), 'src/routes/relationships.ts')
    expect(fs.existsSync(routePath)).toBe(true)

    const { registerRelationshipRoutes } = await import('../src/routes/relationships')
    const relationship = {
      id: 'relationship-1',
      projectId: 'project-1',
      characterFromId: 'character-1',
      characterToId: 'character-2',
      relationshipName: 'ally',
      intimacyLevel: 75,
      description: '',
    }
    state.db = makeDb([
      [{ userId: 'user-1' }],
      [relationship],
      [{ userId: 'user-1' }],
      [{ id: 'character-1' }, { id: 'character-2' }],
      [relationship],
      [{ character_relationships: relationship }],
    ])
    const app = await buildApp(registerRelationshipRoutes)

    const list = await app.inject({ method: 'GET', url: '/api/projects/project-1/relationships' })
    expect(list.json()).toEqual({
      relationships: [expect.objectContaining({
        id: 'relationship-1',
        sourceId: 'character-1',
        targetId: 'character-2',
        type: 'ally',
        strength: 75,
      })],
    })

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects/project-1/relationships',
      payload: { sourceId: 'character-1', targetId: 'character-2', type: 'ally', strength: 75 },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toEqual({
      relationship: expect.objectContaining({
        sourceId: 'character-1',
        targetId: 'character-2',
        type: 'ally',
      }),
    })

    const deleted = await app.inject({ method: 'DELETE', url: '/api/relationships/relationship-1' })
    expect(deleted.statusCode).toBe(204)

    await app.close()
  })

  it('adapts outlines as plot-node routes for the frontend store', async () => {
    const outline = {
      id: 'plot-1',
      projectId: 'project-1',
      parentId: null,
      title: '主线',
      content: '开场剧情',
      structure: { type: 'main', desc: '开场剧情', emoji: '*', color: '#5a7d94', chapterId: null },
      orderIndex: 0,
    }
    state.db = makeDb([
      [{ userId: 'user-1' }],
      [outline],
      [{ userId: 'user-1' }],
      [outline],
      [{ outlines: outline }],
    ])
    const app = await buildApp(registerOutlineRoutes)

    const list = await app.inject({ method: 'GET', url: '/api/projects/project-1/plot-nodes' })
    expect(list.json()).toEqual({
      plotNodes: [expect.objectContaining({
        id: 'plot-1',
        parentId: null,
        title: '主线',
        desc: '开场剧情',
        type: 'main',
        color: '#5a7d94',
      })],
    })

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects/project-1/plot-nodes',
      payload: { title: '主线', desc: '开场剧情', type: 'main', color: '#5a7d94' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toEqual({
      plotNode: expect.objectContaining({ id: 'plot-1', desc: '开场剧情', type: 'main' }),
    })

    const deleted = await app.inject({ method: 'DELETE', url: '/api/plot-nodes/plot-1' })
    expect(deleted.statusCode).toBe(204)

    await app.close()
  })

  it('provides world-entry routes with description aliases', async () => {
    const routePath = path.resolve(process.cwd(), 'src/routes/world-entries.ts')
    expect(fs.existsSync(routePath)).toBe(true)

    const { registerWorldEntryRoutes } = await import('../src/routes/world-entries')
    const worldEntry = {
      id: 'world-1',
      projectId: 'project-1',
      category: 'location',
      icon: '*',
      name: '雾都',
      description: '核心城市',
      iconBg: 'linear-gradient(135deg,#1a1a1c,#2a2a2d)',
      tags: ['城市'],
    }
    state.db = makeDb([
      [{ userId: 'user-1' }],
      [worldEntry],
      [{ userId: 'user-1' }],
      [worldEntry],
      [{ world_entries: worldEntry }],
    ])
    const app = await buildApp(registerWorldEntryRoutes)

    const list = await app.inject({ method: 'GET', url: '/api/projects/project-1/world-entries' })
    expect(list.json()).toEqual({
      worldEntries: [expect.objectContaining({
        id: 'world-1',
        name: '雾都',
        desc: '核心城市',
        tags: ['城市'],
      })],
    })

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects/project-1/world-entries',
      payload: { category: 'location', name: '雾都', desc: '核心城市', tags: ['城市'] },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toEqual({
      worldEntry: expect.objectContaining({ id: 'world-1', desc: '核心城市' }),
    })

    const deleted = await app.inject({ method: 'DELETE', url: '/api/world-entries/world-1' })
    expect(deleted.statusCode).toBe(204)

    await app.close()
  })

  it('provides project search and stats summary responses used by the frontend', async () => {
    const project = { id: 'project-1', userId: 'user-1', title: 'Novel', targetWords: 10000 }
    const chapter = { id: 'chapter-1', title: '雨夜开场', content: '主角在雾都醒来', wordCount: 1200 }
    const character = { id: 'character-1', name: '主角', background: '来自雾都' }
    const worldEntry = { id: 'world-1', name: '雾都', description: '常年下雨的城市' }
    state.db = makeDb([
      [project],
      [chapter],
      [character],
      [worldEntry],
      [project],
      [chapter],
    ])
    const app = await buildApp(registerProjectRoutes)

    const search = await app.inject({ method: 'GET', url: '/api/projects/project-1/search?q=%E9%9B%BE%E9%83%BD' })
    expect(search.json()).toEqual({
      results: expect.arrayContaining([
        expect.objectContaining({ type: 'chapter', id: 'chapter-1' }),
        expect.objectContaining({ type: 'character', id: 'character-1' }),
        expect.objectContaining({ type: 'worldEntry', id: 'world-1' }),
      ]),
    })

    const summary = await app.inject({ method: 'GET', url: '/api/projects/project-1/stats/summary' })
    expect(summary.json()).toEqual({
      summary: expect.objectContaining({
        totalWordsWritten: 1200,
        todayWords: expect.any(Number),
        totalDays: expect.any(Number),
        streak: expect.any(Number),
      }),
    })

    await app.close()
  })
})
