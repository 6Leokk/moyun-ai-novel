import { eq, sql } from 'drizzle-orm'
import { getDb } from '../db/connection.ts'
import { chapters, projects } from '../db/schema.ts'

export async function refreshProjectCurrentWords(projectId: string): Promise<void> {
  const db = getDb()
  await db.update(projects).set({
    currentWords: sql`(
      SELECT COALESCE(SUM(${chapters.wordCount}), 0)::integer
      FROM ${chapters}
      WHERE ${chapters.projectId} = ${projectId}
    )`,
    updatedAt: new Date(),
  } as any).where(eq(projects.id, projectId))
}
