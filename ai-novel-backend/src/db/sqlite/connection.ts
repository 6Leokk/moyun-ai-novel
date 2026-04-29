import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export function openSQLite(path: string): DatabaseType {
  const db: DatabaseType = new Database(path)

  // WAL mode for concurrent reads + better write performance
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = ON')

  return db
}

export function createDrizzle(db: DatabaseType) {
  return drizzle(db, { schema })
}

let currentVersion = 0

export function runMigrations(db: DatabaseType) {
  const version = db.pragma('user_version', { simple: true }) as number
  if (version >= currentVersion) return

  // Future: add migration steps here
  // if (version < 1) { db.exec(migrationV1); }

  db.pragma(`user_version = ${currentVersion}`)
}

export function initProjectDB(db: DatabaseType) {
  // Create all tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_meta (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, genre TEXT NOT NULL DEFAULT '',
      theme TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      narrative_perspective TEXT, target_words INTEGER NOT NULL DEFAULT 0,
      max_words_per_chapter INTEGER, outline_mode TEXT NOT NULL DEFAULT 'one-to-many',
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS world_settings (
      id TEXT PRIMARY KEY, time_period TEXT, location TEXT,
      atmosphere TEXT, rules TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS world_entries (
      id TEXT PRIMARY KEY, category TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '📦', name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon_bg TEXT NOT NULL DEFAULT 'linear-gradient(135deg,#1a1a1c,#2a2a2d)',
      tags TEXT NOT NULL DEFAULT '[]', deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      avatar_char TEXT NOT NULL DEFAULT '?', role TEXT NOT NULL DEFAULT '配角',
      role_type TEXT NOT NULL DEFAULT 'supporting', color TEXT NOT NULL DEFAULT '#5a7d94',
      alias TEXT NOT NULL DEFAULT '', gender TEXT NOT NULL DEFAULT '未设定',
      age TEXT, personality TEXT NOT NULL DEFAULT '',
      background TEXT NOT NULL DEFAULT '', appearance TEXT NOT NULL DEFAULT '',
      is_organization INTEGER NOT NULL DEFAULT 0,
      organization_type TEXT, organization_purpose TEXT,
      main_career_id TEXT, main_career_stage INTEGER,
      traits TEXT NOT NULL DEFAULT '[]', ai_generated INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual', deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chars_role ON characters(role_type);
    CREATE INDEX IF NOT EXISTS idx_chars_org ON characters(is_organization);

    CREATE TABLE IF NOT EXISTS character_relationships (
      id TEXT PRIMARY KEY, character_from_id TEXT NOT NULL,
      character_to_id TEXT NOT NULL, relationship_type_id TEXT,
      relationship_name TEXT NOT NULL, intimacy_level INTEGER NOT NULL DEFAULT 50,
      description TEXT NOT NULL DEFAULT '', started_at TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cr_unique ON character_relationships(character_from_id, character_to_id, relationship_name);

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL UNIQUE,
      member_count INTEGER NOT NULL DEFAULT 0,
      power_level INTEGER NOT NULL DEFAULT 50,
      location TEXT, motto TEXT, color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS organization_members (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
      character_id TEXT NOT NULL, position TEXT NOT NULL DEFAULT '成员',
      rank INTEGER NOT NULL DEFAULT 0, loyalty INTEGER NOT NULL DEFAULT 50,
      joined_at TEXT, status TEXT NOT NULL DEFAULT 'active',
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_om_unique ON organization_members(organization_id, character_id);

    CREATE TABLE IF NOT EXISTS careers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'main', description TEXT,
      category TEXT, stages TEXT NOT NULL DEFAULT '[]',
      max_stage INTEGER NOT NULL DEFAULT 10, requirements TEXT,
      special_abilities TEXT, source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS character_careers (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL,
      career_id TEXT NOT NULL, career_type TEXT NOT NULL DEFAULT 'main',
      current_stage INTEGER NOT NULL DEFAULT 1,
      stage_progress INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_unique ON character_careers(character_id, career_id);

    CREATE TABLE IF NOT EXISTS outlines (
      id TEXT PRIMARY KEY, parent_id TEXT, title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '', structure TEXT NOT NULL DEFAULT '{}',
      order_index INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_outlines_parent ON outlines(parent_id);
    CREATE INDEX IF NOT EXISTS idx_outlines_order ON outlines(order_index);

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY, outline_id TEXT,
      chapter_number INTEGER NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '', summary TEXT,
      summary_status TEXT NOT NULL DEFAULT 'pending',
      content_hash TEXT, word_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      characters_present TEXT NOT NULL DEFAULT '[]',
      expansion_plan TEXT, generation_mode TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_num ON chapters(chapter_number);
    CREATE INDEX IF NOT EXISTS idx_chapters_outline ON chapters(outline_id);
    CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapters(status);

    CREATE TABLE IF NOT EXISTS foreshadows (
      id TEXT PRIMARY KEY, title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      planted_chapter_id TEXT, planted_at TEXT,
      resolved_chapter_id TEXT, resolved_at TEXT,
      status TEXT NOT NULL DEFAULT 'planted',
      color TEXT NOT NULL DEFAULT '#f0a040',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_fs_status ON foreshadows(status);
    CREATE INDEX IF NOT EXISTS idx_fs_planted ON foreshadows(planted_chapter_id);

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY, chapter_id TEXT,
      category TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL, importance INTEGER NOT NULL DEFAULT 5,
      source_type TEXT NOT NULL DEFAULT 'extracted',
      weight REAL NOT NULL DEFAULT 1.0,
      status TEXT NOT NULL DEFAULT 'active',
      embedding_model TEXT, embedding_dimensions INTEGER,
      embedding_version TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_mem_chapter ON memories(chapter_id);
    CREATE INDEX IF NOT EXISTS idx_mem_status ON memories(status);
    CREATE INDEX IF NOT EXISTS idx_mem_source ON memories(source_type);

    CREATE TABLE IF NOT EXISTS chapter_analysis (
      id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL,
      severity TEXT, issues TEXT NOT NULL DEFAULT '[]',
      quality_score INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- sqlite-vec virtual table (may fail if extension not loaded; graceful fallback)
  `)

  // Try loading vec0 extension — graceful fallback if not available
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(embedding float[1536])`)
  } catch {
    // vec0 module not loaded — memory service falls back to keyword search
  }
}
