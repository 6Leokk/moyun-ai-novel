import { getDb } from '../db/connection'
import { projects } from '../db/schema'
import { projectDBManager } from '../db/sqlite/manager'
import { eq, and, isNull } from 'drizzle-orm'
import { ProjectPathResolver } from '../utils/project-path'

export async function migrateProjectToSQLite(projectId: string): Promise<{ success: boolean; error?: string }> {
  const db = getDb()

  // Verify project exists and is pg_legacy
  const proj = await db.select().from(projects).where(and(
    eq(projects.id, projectId),
    eq(projects.storageBackend as any, 'pg_legacy'),
    isNull(projects.deletedAt),
  )).limit(1)

  if (proj.length === 0) return { success: false, error: '项目不存在或已迁移' }

  try {
    // Mark as migrating
    await db.update(projects).set({
      sqliteStatus: 'migrating',
    } as any).where(eq(projects.id, projectId))

    // Initialize SQLite
    projectDBManager.initNew(projectId)

    // Migrate writing layer data from PG to SQLite
    const sqliteDb = projectDBManager.open(projectId)

    // Characters
    // Use raw SQL via drizzle's sql template for PG queries
    const { sql } = await import('drizzle-orm')
    const chars = await db.execute(sql`SELECT * FROM characters WHERE project_id = ${projectId} AND deleted_at IS NULL`)
    if (chars.rows.length > 0) {
      const insert = sqliteDb.prepare(`INSERT OR IGNORE INTO characters (id, name, role_type, personality, background, appearance, gender, age, traits, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      for (const c of chars.rows) {
        insert.run(c.id, c.name, c.role_type, c.personality, c.background, c.appearance, c.gender, c.age, JSON.stringify((c as any).traits || []), 'migrated', (c as any).created_at, (c as any).updated_at)
      }
    }

    // World Settings
    const world = await db.execute(sql`SELECT * FROM world_settings WHERE project_id = ${projectId}`)
    if (world.rows.length > 0) {
      const ws = world.rows[0] as any
      sqliteDb.prepare(`INSERT OR IGNORE INTO world_settings (id, time_period, location, atmosphere, rules, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`).run(ws.id, ws.time_period, ws.location, ws.atmosphere, ws.rules, ws.created_at, ws.updated_at)
    }

    // Mark as ready
    const sqlitePath = ProjectPathResolver.getDBPath(projectId)
    await db.update(projects).set({
      storageBackend: 'sqlite',
      sqliteStatus: 'ready',
      sqlitePath,
    } as any).where(eq(projects.id, projectId))

    return { success: true }
  } catch (e: any) {
    await db.update(projects).set({
      sqliteStatus: 'error',
    } as any).where(eq(projects.id, projectId))
    return { success: false, error: e.message }
  }
}
