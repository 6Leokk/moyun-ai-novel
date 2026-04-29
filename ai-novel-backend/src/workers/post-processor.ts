#!/usr/bin/env tsx
/**
 * Post-processor worker — polls PG queue, executes tasks against project SQLite.
 *
 * Start: tsx src/workers/post-processor.ts
 */

import crypto from 'crypto'
import { getDb } from '../db/connection'
import { postProcessingTasks, projects } from '../db/schema'
import { eq, and, sql, lt, or, isNull } from 'drizzle-orm'
import { projectDBManager } from '../db/sqlite/manager'
import { AIService } from '../services/ai/service'

const WORKER_ID = `worker-${process.pid}-${Date.now()}`
const POLL_INTERVAL_MS = 2000
const LOCK_TIMEOUT_MS = 600_000 // 10 min
const HEARTBEAT_MS = 30_000     // 30s

interface Task {
  id: string
  projectId: string
  chapterId: string
  taskType: string
  payload: Record<string, any>
}

async function poll(): Promise<Task | null> {
  const db = getDb()

  // Reclaim timed-out locks
  await db.update(postProcessingTasks).set({
    status: 'pending',
    lockedBy: null,
    lockedAt: null,
  } as any).where(and(
    eq(postProcessingTasks.status, 'processing'),
    lt(postProcessingTasks.lockedAt as any, new Date(Date.now() - LOCK_TIMEOUT_MS)),
  ))

  // Claim next task
  const rows = await db.select().from(postProcessingTasks)
    .where(and(
      eq(postProcessingTasks.status, 'pending'),
      or(
        isNull(postProcessingTasks.nextRetryAt),
        lt(postProcessingTasks.nextRetryAt as any, new Date()),
      ),
    ))
    .orderBy(sql`${postProcessingTasks.priority} DESC, ${postProcessingTasks.createdAt} ASC`)
    .limit(1)
    .for('update', { skipLocked: true })

  if (rows.length === 0) return null

  const task = rows[0]
  await db.update(postProcessingTasks).set({
    status: 'processing',
    lockedBy: WORKER_ID,
    lockedAt: new Date(),
    startedAt: sql`COALESCE(${postProcessingTasks.startedAt}, NOW())`,
  } as any).where(eq(postProcessingTasks.id, task.id))

  return {
    id: task.id,
    projectId: task.projectId,
    chapterId: task.chapterId,
    taskType: task.taskType,
    payload: task.payload as Record<string, any>,
  }
}

async function executeTask(task: Task): Promise<void> {
  const db = getDb()

  // Verify project not deleted + get userId for AI calls
  const proj = await db.select({ deletedAt: projects.deletedAt, sqliteStatus: projects.sqliteStatus, userId: projects.userId })
    .from(projects).where(eq(projects.id, task.projectId)).limit(1)

  if (proj.length === 0 || proj[0].deletedAt) {
    await db.update(postProcessingTasks).set({
      status: 'skipped',
      errorMessage: 'Project deleted',
    } as any).where(eq(postProcessingTasks.id, task.id))
    return
  }

  if (proj[0].sqliteStatus !== 'ready') {
    // Re-queue for later
    await db.update(postProcessingTasks).set({
      status: 'pending',
      lockedBy: null,
      lockedAt: null,
      nextRetryAt: new Date(Date.now() + 60_000),
    } as any).where(eq(postProcessingTasks.id, task.id))
    return
  }

  try {
    // Placeholder: actual task logic in Phase 2
    switch (task.taskType) {
      case 'extract_summary': {
        const db = projectDBManager.open(task.projectId)
        const ch = db.prepare('SELECT content FROM chapters WHERE id = ?').get(task.chapterId) as any
        if (ch?.content) {
          const ai = new AIService({ userId: proj[0].userId, projectId: task.projectId })
          const result = await ai.generateJSON<{ summary: string }>({ prompt: '提取本章100-200字摘要。只返回JSON: {"summary":"..."}\n\n章节:' + ch.content.slice(0, 5000), temperature: 0.3 })
          if (result?.summary) db.prepare('UPDATE chapters SET summary=?, summary_status=? WHERE id=?').run(result.summary, 'ready', task.chapterId)
        }
        break
      }
      case 'extract_memories': {
        const db = projectDBManager.open(task.projectId)
        const ch = db.prepare('SELECT content FROM chapters WHERE id = ?').get(task.chapterId) as any
        if (ch?.content) {
          const ai = new AIService({ userId: proj[0].userId, projectId: task.projectId })
          const result = await ai.generateJSON<Array<{ title: string; content: string; category: string }>>({ prompt: '提取3-5个关键记忆。返回JSON数组:[{"title":"","content":"","category":"plot_event|character_state|foreshadow"}...]\n\n章节:' + ch.content.slice(0, 5000), temperature: 0.3 })
          if (Array.isArray(result)) {
            const insert = db.prepare('INSERT INTO memories (id,chapter_id,category,title,content,importance,source_type,weight,status) VALUES (?,?,?,?,?,5,\'extracted\',1.0,\'active\')')
            for (const m of result) insert.run(crypto.randomUUID(), task.chapterId, m.category, m.title, m.content)
          }
        }
        break
      }
      case 'embed_memories':
      case 'update_character_states':
        // Phase 2 — not yet implemented, skip without marking done
        await db.update(postProcessingTasks).set({ status: 'pending', lockedBy: null, lockedAt: null, nextRetryAt: new Date(Date.now() + 300_000) } as any).where(eq(postProcessingTasks.id, task.id))
        return
    }

    await db.update(postProcessingTasks).set({
      status: 'done',
      finishedAt: new Date(),
      updatedAt: new Date(),
    } as any).where(eq(postProcessingTasks.id, task.id))
  } catch (e: any) {
    const newRetryCount = (task as any).retryCount + 1
    const maxRetries = (task as any).maxRetries || 3

    if (newRetryCount >= maxRetries) {
      await db.update(postProcessingTasks).set({
        status: 'failed',
        errorMessage: e.message,
        finishedAt: new Date(),
        updatedAt: new Date(),
      } as any).where(eq(postProcessingTasks.id, task.id))
    } else {
      const backoff = Math.min(Math.pow(2, newRetryCount) * 1000, 60_000)
      await db.update(postProcessingTasks).set({
        status: 'pending',
        retryCount: newRetryCount,
        errorMessage: e.message,
        lockedBy: null,
        lockedAt: null,
        nextRetryAt: new Date(Date.now() + backoff),
        updatedAt: new Date(),
      } as any).where(eq(postProcessingTasks.id, task.id))
    }
  }
}

async function heartbeat(): Promise<void> {
  const db = getDb()
  await db.update(postProcessingTasks).set({
    lockedAt: new Date(),
  } as any).where(and(
    eq(postProcessingTasks.status, 'processing'),
    eq(postProcessingTasks.lockedBy as any, WORKER_ID),
  ))
}

async function main() {
  console.log(`[${WORKER_ID}] Post-processor worker started`)

  const heartbeatTimer = setInterval(() => {
    heartbeat().catch(() => {})
  }, HEARTBEAT_MS)

  process.on('SIGTERM', () => {
    console.log(`[${WORKER_ID}] Shutting down...`)
    clearInterval(heartbeatTimer)
    projectDBManager.shutdown()
    process.exit(0)
  })

  while (true) {
    try {
      const task = await poll()
      if (task) {
        console.log(`[${WORKER_ID}] Processing: ${task.taskType} (${task.id})`)
        await executeTask(task)
      } else {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
      }
    } catch (e) {
      console.error(`[${WORKER_ID}] Error:`, e)
      await new Promise(r => setTimeout(r, 5000))
    }
  }
}

main()
