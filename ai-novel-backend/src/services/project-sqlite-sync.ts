import type { Database as SQLiteDatabase } from 'better-sqlite3'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '../db/connection.ts'
import {
  characterRelationships,
  characters,
  chapters,
  foreshadows,
  outlines,
  projects,
  worldEntries,
  worldSettings,
} from '../db/schema.ts'
import { projectDBManager } from '../db/sqlite/manager'

type ProjectSnapshot = {
  project: any
  worldSettings?: any | null
  worldEntries?: any[]
  characters?: any[]
  relationships?: any[]
  outlines?: any[]
  chapters?: any[]
  foreshadows?: any[]
}

function jsonText(value: unknown, fallback: unknown): string {
  return JSON.stringify(value ?? fallback)
}

function sqliteTime(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}

function boolInt(value: unknown): number {
  return value ? 1 : 0
}

function deleteMissing(db: SQLiteDatabase, table: string, ids: string[]): void {
  if (ids.length === 0) {
    db.prepare(`DELETE FROM ${table}`).run()
    return
  }
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`DELETE FROM ${table} WHERE id NOT IN (${placeholders})`).run(...ids)
}

export function applyProjectSnapshotToSQLite(sqliteDb: SQLiteDatabase, snapshot: ProjectSnapshot): void {
  const tx = sqliteDb.transaction(() => {
    const project = snapshot.project
    sqliteDb.prepare(`
      INSERT INTO project_meta (
        id, title, genre, theme, description, narrative_perspective,
        target_words, max_words_per_chapter, outline_mode, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        genre = excluded.genre,
        theme = excluded.theme,
        description = excluded.description,
        narrative_perspective = excluded.narrative_perspective,
        target_words = excluded.target_words,
        max_words_per_chapter = excluded.max_words_per_chapter,
        outline_mode = excluded.outline_mode,
        synced_at = excluded.synced_at
    `).run(
      project.id,
      project.title || '',
      project.genre || '',
      project.theme || '',
      project.description || '',
      project.narrativePerspective || null,
      project.targetWords || 0,
      project.maxWordsPerChapter || null,
      project.outlineMode || 'one-to-many',
    )

    if (snapshot.worldSettings) {
      const ws = snapshot.worldSettings
      sqliteDb.prepare(`
        INSERT INTO world_settings (
          id, time_period, location, atmosphere, rules, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          time_period = excluded.time_period,
          location = excluded.location,
          atmosphere = excluded.atmosphere,
          rules = excluded.rules,
          updated_at = excluded.updated_at
      `).run(
        ws.id,
        ws.timePeriod || null,
        ws.location || null,
        ws.atmosphere || null,
        ws.rules || null,
        sqliteTime(ws.createdAt),
        sqliteTime(ws.updatedAt),
      )
      sqliteDb.prepare('DELETE FROM world_settings WHERE id != ?').run(ws.id)
    } else {
      sqliteDb.prepare('DELETE FROM world_settings').run()
    }

    const worldRows = snapshot.worldEntries || []
    deleteMissing(sqliteDb, 'world_entries', worldRows.map(row => row.id))
    const upsertWorldEntry = sqliteDb.prepare(`
      INSERT INTO world_entries (
        id, category, icon, name, description, icon_bg, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        category = excluded.category,
        icon = excluded.icon,
        name = excluded.name,
        description = excluded.description,
        icon_bg = excluded.icon_bg,
        tags = excluded.tags,
        updated_at = excluded.updated_at,
        deleted_at = NULL
    `)
    for (const row of worldRows) {
      upsertWorldEntry.run(
        row.id,
        row.category || 'location',
        row.icon || '*',
        row.name || '',
        row.description || '',
        row.iconBg || 'linear-gradient(135deg,#1a1a1c,#2a2a2d)',
        jsonText(row.tags, []),
        sqliteTime(row.createdAt),
        sqliteTime(row.updatedAt),
      )
    }

    const characterRows = snapshot.characters || []
    deleteMissing(sqliteDb, 'characters', characterRows.map(row => row.id))
    const upsertCharacter = sqliteDb.prepare(`
      INSERT INTO characters (
        id, name, avatar_char, role, role_type, color, alias, gender, age,
        personality, background, appearance, is_organization, organization_type,
        organization_purpose, main_career_id, main_career_stage, traits,
        ai_generated, source, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        avatar_char = excluded.avatar_char,
        role = excluded.role,
        role_type = excluded.role_type,
        color = excluded.color,
        alias = excluded.alias,
        gender = excluded.gender,
        age = excluded.age,
        personality = excluded.personality,
        background = excluded.background,
        appearance = excluded.appearance,
        is_organization = excluded.is_organization,
        organization_type = excluded.organization_type,
        organization_purpose = excluded.organization_purpose,
        main_career_id = excluded.main_career_id,
        main_career_stage = excluded.main_career_stage,
        traits = excluded.traits,
        ai_generated = excluded.ai_generated,
        source = excluded.source,
        deleted_at = excluded.deleted_at,
        updated_at = excluded.updated_at
    `)
    for (const row of characterRows) {
      upsertCharacter.run(
        row.id,
        row.name || '',
        row.avatarChar || '?',
        row.role || '配角',
        row.roleType || 'supporting',
        row.color || '#5a7d94',
        row.alias || '',
        row.gender || '未设定',
        row.age || null,
        row.personality || '',
        row.background || '',
        row.appearance || '',
        boolInt(row.isOrganization),
        row.organizationType || null,
        row.organizationPurpose || null,
        row.mainCareerId || null,
        row.mainCareerStage || null,
        jsonText(row.traits, []),
        boolInt(row.aiGenerated),
        row.source || 'manual',
        sqliteTime(row.deletedAt),
        sqliteTime(row.createdAt),
        sqliteTime(row.updatedAt),
      )
    }

    const relationshipRows = snapshot.relationships || []
    deleteMissing(sqliteDb, 'character_relationships', relationshipRows.map(row => row.id))
    const upsertRelationship = sqliteDb.prepare(`
      INSERT INTO character_relationships (
        id, character_from_id, character_to_id, relationship_type_id,
        relationship_name, intimacy_level, description, started_at, source,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        character_from_id = excluded.character_from_id,
        character_to_id = excluded.character_to_id,
        relationship_type_id = excluded.relationship_type_id,
        relationship_name = excluded.relationship_name,
        intimacy_level = excluded.intimacy_level,
        description = excluded.description,
        started_at = excluded.started_at,
        source = excluded.source,
        updated_at = excluded.updated_at
    `)
    for (const row of relationshipRows) {
      upsertRelationship.run(
        row.id,
        row.characterFromId,
        row.characterToId,
        row.relationshipTypeId || null,
        row.relationshipName || '',
        row.intimacyLevel || 50,
        row.description || '',
        row.startedAt || null,
        row.source || 'manual',
        sqliteTime(row.createdAt),
        sqliteTime(row.updatedAt),
      )
    }

    const outlineRows = snapshot.outlines || []
    deleteMissing(sqliteDb, 'outlines', outlineRows.map(row => row.id))
    const upsertOutline = sqliteDb.prepare(`
      INSERT INTO outlines (
        id, parent_id, title, content, structure, order_index, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        parent_id = excluded.parent_id,
        title = excluded.title,
        content = excluded.content,
        structure = excluded.structure,
        order_index = excluded.order_index,
        updated_at = excluded.updated_at,
        deleted_at = NULL
    `)
    for (const row of outlineRows) {
      upsertOutline.run(
        row.id,
        row.parentId || null,
        row.title || '',
        row.content || '',
        jsonText(row.structure, {}),
        row.orderIndex || 0,
        sqliteTime(row.createdAt),
        sqliteTime(row.updatedAt),
      )
    }

    const chapterRows = snapshot.chapters || []
    deleteMissing(sqliteDb, 'chapters', chapterRows.map(row => row.id))
    const upsertChapter = sqliteDb.prepare(`
      INSERT INTO chapters (
        id, outline_id, chapter_number, title, content, word_count, status,
        characters_present, expansion_plan, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        outline_id = excluded.outline_id,
        chapter_number = excluded.chapter_number,
        title = excluded.title,
        content = excluded.content,
        word_count = excluded.word_count,
        status = excluded.status,
        characters_present = excluded.characters_present,
        expansion_plan = excluded.expansion_plan,
        updated_at = excluded.updated_at,
        deleted_at = NULL
    `)
    for (const row of chapterRows) {
      upsertChapter.run(
        row.id,
        row.outlineId || null,
        row.chapterNumber || 1,
        row.title || '',
        row.content || '',
        row.wordCount || 0,
        row.status || 'draft',
        jsonText(row.charactersPresent, []),
        row.expansionPlan == null ? null : jsonText(row.expansionPlan, null),
        sqliteTime(row.createdAt),
        sqliteTime(row.updatedAt),
      )
    }

    const foreshadowRows = snapshot.foreshadows || []
    deleteMissing(sqliteDb, 'foreshadows', foreshadowRows.map(row => row.id))
    const upsertForeshadow = sqliteDb.prepare(`
      INSERT INTO foreshadows (
        id, title, description, planted_chapter_id, planted_at,
        resolved_chapter_id, resolved_at, status, color, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        planted_chapter_id = excluded.planted_chapter_id,
        planted_at = excluded.planted_at,
        resolved_chapter_id = excluded.resolved_chapter_id,
        resolved_at = excluded.resolved_at,
        status = excluded.status,
        color = excluded.color,
        updated_at = excluded.updated_at
    `)
    for (const row of foreshadowRows) {
      upsertForeshadow.run(
        row.id,
        row.title || '',
        row.description || '',
        row.plantedChapterId || null,
        row.plantedAt || null,
        row.resolvedChapterId || null,
        row.resolvedAt || null,
        row.status || 'planted',
        row.color || '#f0a040',
        sqliteTime(row.createdAt),
        sqliteTime(row.updatedAt),
      )
    }
  })

  tx()
}

export async function loadProjectSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
  const db = getDb()
  const [projectRows, worldRows, worldEntryRows, characterRows, relationshipRows, outlineRows, chapterRows, foreshadowRows] = await Promise.all([
    db.select().from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt))).limit(1),
    db.select().from(worldSettings).where(eq(worldSettings.projectId, projectId)).limit(1),
    db.select().from(worldEntries).where(eq(worldEntries.projectId, projectId)),
    db.select().from(characters).where(eq(characters.projectId, projectId)),
    db.select().from(characterRelationships).where(eq(characterRelationships.projectId, projectId)),
    db.select().from(outlines).where(eq(outlines.projectId, projectId)),
    db.select().from(chapters).where(eq(chapters.projectId, projectId)),
    db.select().from(foreshadows).where(eq(foreshadows.projectId, projectId)),
  ])

  const project = projectRows[0]
  if (!project) return null

  return {
    project,
    worldSettings: worldRows[0] || null,
    worldEntries: worldEntryRows,
    characters: characterRows,
    relationships: relationshipRows,
    outlines: outlineRows,
    chapters: chapterRows,
    foreshadows: foreshadowRows,
  }
}

export async function syncProjectToSQLite(projectId: string): Promise<boolean> {
  const snapshot = await loadProjectSnapshot(projectId)
  if (!snapshot) return false

  if (!projectDBManager.exists(projectId)) {
    projectDBManager.initNew(projectId)
  }
  const sqliteDb = projectDBManager.open(projectId)
  applyProjectSnapshotToSQLite(sqliteDb, snapshot)
  return true
}

function parseJsonField(value: unknown, fallback: unknown) {
  if (typeof value !== 'string' || value.length === 0) return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

function normalizeChapterStatus(value: unknown): 'draft' | 'writing' | 'done' | 'archived' {
  if (value === 'writing' || value === 'done' || value === 'archived') return value
  return 'draft'
}

export async function syncChapterFromSQLite(projectId: string, chapterId: string): Promise<boolean> {
  if (!projectDBManager.exists(projectId)) return false
  const sqliteDb = projectDBManager.open(projectId)
  const row = sqliteDb.prepare(`
    SELECT id, title, content, word_count, status, characters_present, expansion_plan
    FROM chapters
    WHERE id = ?
  `).get(chapterId) as any
  if (!row) return false

  const db = getDb()
  await db.update(chapters).set({
    title: row.title || '',
    content: row.content || '',
    wordCount: row.word_count || 0,
    status: normalizeChapterStatus(row.status),
    charactersPresent: parseJsonField(row.characters_present, []),
    expansionPlan: parseJsonField(row.expansion_plan, null),
    updatedAt: new Date(),
  } as any).where(and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId)))

  return true
}
