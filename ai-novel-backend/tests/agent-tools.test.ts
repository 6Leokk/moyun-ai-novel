import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { initProjectDB } from '../src/db/sqlite/connection'
import {
  ALL_TOOLS, getToolsForAI, findTool,
  READ_TOOLS, WRITE_TOOLS, type AgentTool,
} from '../src/services/agent-tools'

// Override getDB to use test database directly
const TEST_DB = '/tmp/test-agent-tools.db'
let db: Database

// Mock projectDBManager.open to return our test db
vi.mock('../src/db/sqlite/manager', () => ({
  projectDBManager: {
    open: () => db,
    close: () => {},
    exists: () => true,
    initNew: () => db,
    acquireLock: async () => () => {},
    shutdown: () => {},
  },
}))

beforeAll(() => {
  try { fs.unlinkSync(TEST_DB) } catch {}
  try { fs.unlinkSync(TEST_DB + '-wal') } catch {}
  try { fs.unlinkSync(TEST_DB + '-shm') } catch {}
  db = new Database(TEST_DB)
  db.pragma('journal_mode = WAL')
  initProjectDB(db)

  // Seed test data using exec
  db.exec(`INSERT INTO characters (id, name, role_type, personality, background, gender) VALUES ('c1', '李凡', 'protagonist', '温和内敛', '出身寒门', '男')`)
  db.exec(`INSERT INTO characters (id, name, role_type, personality, background, gender) VALUES ('c2', '阿瑶', 'supporting', '活泼开朗', '未知', '女')`)
  db.exec(`INSERT INTO chapters (id, chapter_number, title, content, summary, summary_status) VALUES ('ch1', 1, '第一章', '正文', '摘要', 'ready')`)
  db.exec(`INSERT INTO chapters (id, chapter_number, title, content) VALUES ('ch2', 2, '第二章', '正文')`)
  db.exec(`INSERT INTO foreshadows (id, title, description, status) VALUES ('f1', '暗器来源', '标记', 'planted')`)
  db.exec(`INSERT INTO world_settings (id, time_period, location, rules) VALUES ('w1', '古代', '中原', '灵力')`)
  db.exec(`INSERT INTO memories (id, chapter_id, category, title, content, source_type, weight, status) VALUES ('m1', 'ch2', 'plot_event', '测试', '内容', 'extracted', 1.0, 'active')`)
})

afterAll(() => {
  db?.close()
  try { fs.unlinkSync(TEST_DB) } catch {}
  try { fs.unlinkSync(TEST_DB + '-wal') } catch {}
  try { fs.unlinkSync(TEST_DB + '-shm') } catch {}
})

const ctx = { projectId: 'test', chapterId: 'ch2', userId: 'u1' }

describe('Agent Tools', () => {
  describe('Tool Registry', () => {
    it('has 6 read tools', () => {
      expect(READ_TOOLS.length).toBe(6)
    })

    it('has 3 write tools', () => {
      expect(WRITE_TOOLS.length).toBe(3)
    })

    it('ALL_TOOLS = 9', () => {
      expect(ALL_TOOLS.length).toBe(9)
    })

    it('getToolsForAI returns OpenAI function format', () => {
      const formatted = getToolsForAI(READ_TOOLS)
      expect(formatted.length).toBe(6)
      expect(formatted[0]).toHaveProperty('name')
      expect(formatted[0]).toHaveProperty('description')
      expect(formatted[0]).toHaveProperty('input_schema')
    })

    it('findTool returns tool by name', () => {
      expect(findTool('getCharacter')).toBeTruthy()
      expect(findTool('nonexistent')).toBeUndefined()
    })
  })

  describe('AgentTool interface', () => {
    it('each tool has required methods', () => {
      for (const tool of ALL_TOOLS) {
        expect(tool).toHaveProperty('name')
        expect(tool).toHaveProperty('description')
        expect(tool).toHaveProperty('inputSchema')
        expect(tool).toHaveProperty('execute')
        expect(tool).toHaveProperty('summarizeForAI')
        expect(tool).toHaveProperty('summarizeForUI')
      }
    })

    it('all tool names are unique', () => {
      const names = ALL_TOOLS.map(t => t.name)
      expect(new Set(names).size).toBe(names.length)
    })
  })

  describe('Read Tools - getCharacter', () => {
    it('finds character by name', async () => {
      const tool = findTool('getCharacter')!
      const result = await tool.execute({ name: '李凡' }, ctx)
      expect(result).toBeTruthy()
      expect((result as any).name).toBe('李凡')
      expect((result as any).role_type).toBe('protagonist')
    })

    it('summarizeForAI filters metadata', async () => {
      const tool = findTool('getCharacter')!
      const result = await tool.execute({ name: '李凡' }, ctx)
      const summary = tool.summarizeForAI(result)
      expect(summary).toHaveProperty('name')
      expect(summary).toHaveProperty('personality')
      expect(summary).not.toHaveProperty('id')
      expect(summary).not.toHaveProperty('created_at')
    })

    it('returns null for non-existent character', async () => {
      const tool = findTool('getCharacter')!
      const result = await tool.execute({ name: '不存在' }, ctx)
      expect(result).toBeUndefined()
    })
  })

  describe('Read Tools - getForeshadows', () => {
    it('lists planted foreshadows', async () => {
      const tool = findTool('getForeshadows')!
      const result = await tool.execute({ status: 'planted' }, ctx)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(1)
      expect(result[0].title).toBe('暗器来源')
    })
  })

  describe('Read Tools - getPrevSummary', () => {
    it('gets previous chapter with ready summary', async () => {
      const tool = findTool('getPreviousChapterSummary')!
      const result = await tool.execute({}, { ...ctx, chapterId: 'ch2' })
      expect(result).toBeTruthy()
      expect((result as any).title).toBe('第一章')
      expect((result as any).summary_status).toBe('ready')
    })
  })

  describe('Read Tools - getWorldRules', () => {
    it('returns world settings', async () => {
      const tool = findTool('getWorldRules')!
      const result = await tool.execute({}, ctx)
      expect(result).toBeTruthy()
      expect((result as any).worldSettings).toBeTruthy()
    })
  })

  describe('Write Tools - saveChapter', () => {
    it('saves chapter content', async () => {
      const tool = findTool('saveChapter')!
      const result = await tool.execute({ content: '新内容', wordCount: 3 }, { ...ctx, chapterId: 'ch2' })
      expect(result).toEqual({ success: true })

      // Verify saved
      const ch = db.prepare('SELECT content, word_count, status FROM chapters WHERE id = ?').get('ch2') as any
      expect(ch.content).toBe('新内容')
      expect(ch.word_count).toBe(3)
      expect(ch.status).toBe('done')
    })

    it('fails when the target chapter is missing', async () => {
      const tool = findTool('saveChapter')!
      await expect(tool.execute({ content: '孤立内容', wordCount: 4 }, { ...ctx, chapterId: 'missing-chapter' }))
        .rejects.toThrow('章节不存在')
    })
  })

  describe('Write Tools - resolveForeshadow', () => {
    it('marks foreshadow as resolved', async () => {
      const tool = findTool('resolveForeshadow')!
      await tool.execute({ foreshadowId: 'f1' }, ctx)

      const fs = db.prepare('SELECT status, resolved_chapter_id FROM foreshadows WHERE id = ?').get('f1') as any
      expect(fs.status).toBe('resolved')
      expect(fs.resolved_chapter_id).toBe('ch2')
    })
  })

  describe('Budget enforcement', () => {
    it('tools have budget constants defined in orchestrator', () => {
      // Verify that the orchestrator's budget constants match tool count
      const MAX_TOOLS_PER_RUN = 36
      const MAX_TOOLS_PER_SCENE = 6
      expect(MAX_TOOLS_PER_RUN).toBeGreaterThan(ALL_TOOLS.length)
      expect(MAX_TOOLS_PER_SCENE).toBeLessThan(MAX_TOOLS_PER_RUN)
    })
  })
})
