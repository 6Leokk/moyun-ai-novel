import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import { initProjectDB } from '../src/db/sqlite/connection'

// Test the SQLite-level memory operations directly
const TEST_DB = '/tmp/test-memory.db'
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
  try { fs.unlinkSync(TEST_DB + '-wal') } catch {}
  try { fs.unlinkSync(TEST_DB + '-shm') } catch {}
})

describe('Memory Storage', () => {
  it('inserts a memory', () => {
    db.prepare(`INSERT INTO memories (id, chapter_id, category, title, content, importance, source_type, weight, status, embedding_model, embedding_dimensions, embedding_version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run('m1', 'ch1', 'plot_event', '测试', '测试内容', 5, 'extracted', 1.0, 'active', 'text-embedding-3-small', 1536, '1')

    const m = db.prepare('SELECT * FROM memories WHERE id = ?').get('m1') as any
    expect(m).toBeTruthy()
    expect(m.title).toBe('测试')
    expect(m.source_type).toBe('extracted')
    expect(m.weight).toBe(1.0)
    expect(m.status).toBe('active')
  })

  it('inserts user_setting memory with higher weight', () => {
    db.prepare(`INSERT INTO memories (id, chapter_id, category, title, content, importance, source_type, weight, status, embedding_model, embedding_dimensions, embedding_version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run('m2', '', 'character_state', '角色设定', '设定内容', 10, 'user_setting', 2.0, 'active', 'text-embedding-3-small', 1536, '1')

    const m = db.prepare('SELECT * FROM memories WHERE id = ?').get('m2') as any
    expect(m.weight).toBe(2.0)
    expect(m.importance).toBe(10)
  })

  it('searches memories by keyword', () => {
    const rows = db.prepare(`SELECT * FROM memories WHERE status = 'active' AND content LIKE ? ORDER BY (importance * weight) DESC`)
      .all('%测试%') as any[]
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })

  it('weights user_setting higher in search results', () => {
    const rows = db.prepare(`SELECT * FROM memories WHERE status = 'active' ORDER BY (importance * weight) DESC`).all() as any[]
    expect(rows.length).toBeGreaterThanOrEqual(1)
    // user_setting (weight 2.0 * importance 10 = 20) > extracted (weight 1.0 * importance 5 = 5)
    expect(rows[0].source_type).toBe('user_setting')
  })

  it('supersedes chapter memories', () => {
    // Mark old memories as superseded
    db.prepare(`UPDATE memories SET status = 'superseded' WHERE chapter_id = ? AND status = 'active'`).run('ch1')

    const active = db.prepare(`SELECT COUNT(*) as count FROM memories WHERE chapter_id = ? AND status = 'active'`).get('ch1') as any
    expect(active.count).toBe(0)
  })

  it('filters out superseded memories in search', () => {
    const active = db.prepare(`SELECT COUNT(*) as count FROM memories WHERE status = 'active'`).get() as any
    expect(active.count).toBe(1) // Only m2 remains active
  })
})

describe('Memory Categories', () => {
  const categories = ['plot_event', 'character_state', 'foreshadow', 'world_rule', 'revelation']

  for (const cat of categories) {
    it(`inserts category ${cat}`, () => {
      const id = 'cat-' + cat
      db.prepare(`INSERT OR IGNORE INTO memories (id, chapter_id, category, title, content, source_type, weight, status) VALUES (?,?,?,?,?,?,?,?)`)
        .run(id, 'ch1', cat, cat, 'content', 'extracted', 1.0, 'active')

      const m = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as any
      expect(m.category).toBe(cat)
    })
  }
})
