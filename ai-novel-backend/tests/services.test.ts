import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import { initProjectDB } from '../src/db/sqlite/connection'
import { PromptService } from '../src/services/prompt-service'
import { ChapterContextBuilder } from '../src/services/chapter-context'

// ── Prompt Service ──

describe('PromptService', () => {
  it('formats template with variables', () => {
    const template = '标题：{title}，类型：{genre}，字数：{words}'
    const result = PromptService.formatPrompt(template, { title: '测试', genre: '科幻', words: '3000' })
    expect(result).toBe('标题：测试，类型：科幻，字数：3000')
  })

  it('replaces multiple occurrences of same variable', () => {
    const template = '{name}说：{name}今天很开心'
    const result = PromptService.formatPrompt(template, { name: '小张' })
    expect(result).toBe('小张说：小张今天很开心')
  })

  it('leaves unknown placeholders unchanged', () => {
    const template = '{known} and {unknown}'
    const result = PromptService.formatPrompt(template, { known: 'yes' })
    expect(result).toBe('yes and {unknown}')
  })

  it('handles numeric values', () => {
    const result = PromptService.formatPrompt('字数：{count}', { count: 5000 })
    expect(result).toBe('字数：5000')
  })
})

// ── Migration Service ──

const TEST_DB = '/tmp/test-migration.db'
let db: Database

beforeAll(() => {
  try { fs.unlinkSync(TEST_DB) } catch {}
  try { fs.unlinkSync(TEST_DB + '-wal') } catch {}
  try { fs.unlinkSync(TEST_DB + '-shm') } catch {}
  db = new Database(TEST_DB)
  db.pragma('journal_mode = WAL')
  initProjectDB(db)
})

afterAll(() => {
  db?.close()
  try { fs.unlinkSync(TEST_DB) } catch {}
})

vi.mock('../src/db/sqlite/manager', () => ({
  projectDBManager: { open: () => db, close: () => {}, exists: () => true, initNew: () => db, acquireLock: async () => () => {}, shutdown: () => {} },
}))

describe('ChapterContextBuilder (format-only)', () => {
  it('formatContext with empty context', () => {
    const ctx = {
      projectInfo: 'test', worldInfo: '', characters: '',
      outline: '', previousChapterEnding: '无', foreshadows: '',
      style: '', targetWords: 2000,
    }
    const text = ChapterContextBuilder.formatContext(ctx)
    expect(text).toContain('【项目信息】')
    expect(text).toContain('【世界观】')
  })

  it('formatContext includes all sections', () => {
    const ctx = {
      projectInfo: 'p', worldInfo: 'w', characters: 'c',
      outline: 'o', previousChapterEnding: 'prev', foreshadows: 'f',
      style: 's', targetWords: 3000,
    }
    const sections = ['【项目信息】', '【世界观】', '【角色列表】', '【当前大纲】', '【前一章结尾】', '【未回收伏笔】', '【写作风格】']
    const text = ChapterContextBuilder.formatContext(ctx)
    for (const s of sections) expect(text).toContain(s)
  })
})

describe('SQLite Migration Structure', () => {
  it('all 16 tables exist after init', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'memories_vec'").all() as any[]
    expect(tables.length).toBeGreaterThanOrEqual(14)
  })

  it('chapters has summary_status column', () => {
    const cols = db.prepare("PRAGMA table_info(chapters)").all() as any[]
    const names = cols.map((c: any) => c.name)
    expect(names).toContain('summary_status')
    expect(names).toContain('content_hash')
    expect(names).toContain('generation_mode')
  })

  it('memories has weight and source_type columns', () => {
    const cols = db.prepare("PRAGMA table_info(memories)").all() as any[]
    const names = cols.map((c: any) => c.name)
    expect(names).toContain('source_type')
    expect(names).toContain('weight')
    expect(names).toContain('status')
    expect(names).toContain('embedding_model')
  })

  it('chapters has unique index on chapter_number', () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='chapters'").all() as any[]
    const names = indexes.map((i: any) => i.name)
    expect(names).toContain('idx_chapters_num')
  })
})
