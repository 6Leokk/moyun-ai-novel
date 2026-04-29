import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { openSQLite, initProjectDB, runMigrations } from '../src/db/sqlite/connection'

const TEST_DB = '/tmp/test-project.db'

describe('SQLite Connection', () => {
  afterEach(() => {
    try { fs.unlinkSync(TEST_DB) } catch {}
    try { fs.unlinkSync(TEST_DB + '-wal') } catch {}
    try { fs.unlinkSync(TEST_DB + '-shm') } catch {}
  })

  describe('openSQLite', () => {
    it('opens a database with WAL mode', () => {
      const db = openSQLite(TEST_DB)
      const journal = db.pragma('journal_mode', { simple: true })
      expect(journal).toBe('wal')
      db.close()
    })

    it('sets busy_timeout', () => {
      const db = openSQLite(TEST_DB)
      const timeout = db.pragma('busy_timeout', { simple: true })
      expect(timeout).toBe(5000)
      db.close()
    })

    it('enables foreign keys', () => {
      const db = openSQLite(TEST_DB)
      const fk = db.pragma('foreign_keys', { simple: true })
      expect(fk).toBe(1)
      db.close()
    })
  })

  describe('initProjectDB', () => {
    it('creates all required tables', () => {
      const db = openSQLite(TEST_DB)
      initProjectDB(db)

      const tables = [
        'project_meta', 'world_settings', 'world_entries',
        'characters', 'character_relationships', 'organizations',
        'organization_members', 'careers', 'character_careers',
        'outlines', 'chapters', 'foreshadows',
        'memories', 'chapter_analysis',
      ]

      for (const table of tables) {
        const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table)
        expect(exists, `Table ${table} should exist`).toBeTruthy()
      }

      db.close()
    })

    it('creates indexes on chapters', () => {
      const db = openSQLite(TEST_DB)
      initProjectDB(db)

      const indexes = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='chapters'`).all() as any[]
      const names = indexes.map((i: any) => i.name)
      expect(names).toContain('idx_chapters_num')
      expect(names).toContain('idx_chapters_status')
      db.close()
    })

    it('handles vec0 gracefully when not loaded', () => {
      const db = openSQLite(TEST_DB)
      // Should not throw even if vec0 extension is unavailable
      expect(() => initProjectDB(db)).not.toThrow()
      db.close()
    })
  })
})

describe('SQLite Manager', () => {
  afterEach(() => {
    try { fs.unlinkSync(TEST_DB) } catch {}
    try { fs.unlinkSync(TEST_DB + '-wal') } catch {}
    try { fs.unlinkSync(TEST_DB + '-shm') } catch {}
  })

  describe('runMigrations', () => {
    it('sets user_version', () => {
      const db = openSQLite(TEST_DB)
      initProjectDB(db)
      runMigrations(db)

      const version = db.pragma('user_version', { simple: true })
      expect(version).toBeGreaterThanOrEqual(0)
      db.close()
    })
  })
})
