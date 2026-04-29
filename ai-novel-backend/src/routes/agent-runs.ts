import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import crypto from 'crypto'
import { getDb } from '../db/connection.ts'
import { agentRuns, agentRunEvents, projects } from '../db/schema.ts'
import { eq, and, sql, inArray, gt } from 'drizzle-orm'

const VALID_TRANSITIONS: Record<string, string[]> = {
  queued: ['running', 'cancelled'],
  running: ['cancelling', 'completed', 'failed', 'interrupted', 'needs_manual_review'],
  cancelling: ['cancelled'],
  cancelled: [],
  completed: [],
  failed: [],
  interrupted: ['running', 'failed'],
  needs_manual_review: ['completed', 'failed'],
}

export function registerAgentRunRoutes(app: FastifyInstance) {
  // ── Verify run ownership ──
  async function verifyRunOwnership(runId: string, userId: string): Promise<any> {
    const db = getDb()
    const rows = await db.select({ run: agentRuns, owner: projects.userId })
      .from(agentRuns)
      .innerJoin(projects, eq(agentRuns.projectId, projects.id))
      .where(and(eq(agentRuns.id, runId), eq(projects.userId, userId)))
      .limit(1)
    return rows[0] || null
  }

  // GET /api/agent-runs — list runs for a chapter or project
  app.get('/api/agent-runs', async (request, reply) => {
    const { chapterId, projectId, status } = request.query as {
      chapterId?: string; projectId?: string; status?: string;
    }
    const db = getDb()

    const conditions: any[] = []
    if (chapterId) conditions.push(eq(agentRuns.chapterId, chapterId))
    if (projectId) {
      // Verify project ownership
      const proj = await db.select({ userId: projects.userId })
        .from(projects).where(eq(projects.id, projectId)).limit(1)
      if (proj.length === 0 || proj[0].userId !== request.userId) {
        reply.status(403).send({ error: '无权访问' }); return
      }
      conditions.push(eq(agentRuns.projectId, projectId))
    }
    if (status) {
      const statuses = status.split(',').map(s => s.trim())
      conditions.push(inArray(agentRuns.status, statuses as any))
    }

    if (conditions.length === 0) {
      reply.status(400).send({ error: '请提供 chapterId 或 projectId' }); return
    }

    return db.select().from(agentRuns).where(and(...conditions))
      .orderBy(sql`${agentRuns.createdAt} DESC`).limit(50)
  })

  // GET /api/agent-runs/:id
  app.get('/api/agent-runs/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const owned = await verifyRunOwnership(id, request.userId!)
    if (!owned) { reply.status(404).send({ error: 'Run 不存在' }); return }
    reply.send(owned.run)
  })

  // POST /api/agent-runs/:id/cancel
  app.post('/api/agent-runs/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string }
    const owned = await verifyRunOwnership(id, request.userId!)
    if (!owned) { reply.status(404).send({ error: 'Run 不存在' }); return }

    const run = owned.run
    const currentStatus = run.status as string
    const newStatus = currentStatus === 'queued' ? 'cancelled' : 'cancelling'

    if (!VALID_TRANSITIONS[currentStatus]?.includes(newStatus)) {
      reply.status(409).send({ error: `无法从 ${currentStatus} 取消` }); return
    }

    const db = getDb()
    await db.update(agentRuns).set({ status: newStatus } as any).where(eq(agentRuns.id, id))
    reply.send({ status: newStatus })
  })

  // POST /api/agent-runs/:id/accept
  app.post('/api/agent-runs/:id/accept', async (request, reply) => {
    const { id } = request.params as { id: string }
    const owned = await verifyRunOwnership(id, request.userId!)
    if (!owned) { reply.status(404).send({ error: 'Run 不存在' }); return }

    if (owned.run.status !== 'needs_manual_review') {
      reply.status(409).send({ error: '当前状态不支持接受操作' }); return
    }

    const db = getDb()
    await db.update(agentRuns).set({
      status: 'completed',
      finishedAt: new Date(),
    } as any).where(eq(agentRuns.id, id))
    reply.send({ status: 'completed' })
  })

  // POST /api/agent-runs/:id/discard
  app.post('/api/agent-runs/:id/discard', async (request, reply) => {
    const { id } = request.params as { id: string }
    const owned = await verifyRunOwnership(id, request.userId!)
    if (!owned) { reply.status(404).send({ error: 'Run 不存在' }); return }

    if (owned.run.status !== 'needs_manual_review') {
      reply.status(409).send({ error: '当前状态不支持丢弃操作' }); return
    }

    const db = getDb()
    await db.update(agentRuns).set({
      status: 'failed',
      finishedAt: new Date(),
    } as any).where(eq(agentRuns.id, id))
    reply.send({ status: 'failed' })
  })

  // GET /api/agent-runs/:id/stream — SSE event replay
  app.get('/api/agent-runs/:id/stream', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { afterSeq } = request.query as { afterSeq?: string }
    const owned = await verifyRunOwnership(id, request.userId!)
    if (!owned) { reply.status(404).send({ error: 'Run 不存在' }); return }

    const afterSeqNum = parseInt(afterSeq || '0', 10)
    const db = getDb()

    // Setup SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    // Send current run state first
    const run = owned.run
    reply.raw.write(`event: agent:phase\ndata: ${JSON.stringify({ runId: id, phase: run.phase, status: run.status })}\n\n`)

    // Replay events
    const conditions: any[] = [eq(agentRunEvents.runId, id)]
    if (afterSeqNum > 0) conditions.push(gt(agentRunEvents.seq, afterSeqNum))

    const events = await db.select().from(agentRunEvents)
      .where(and(...conditions))
      .orderBy(sql`${agentRunEvents.seq} ASC`)
      .limit(500)

    for (const ev of events) {
      reply.raw.write(`id: ${ev.seq}\nevent: ${ev.eventType}\ndata: ${JSON.stringify(ev.payload)}\n\n`)
    }

    // If run is still active, this endpoint ends after replay
    // Active streaming is only available via the initial generate-agent SSE connection
    reply.raw.write(`event: done\ndata: {"runId":"${id}","status":"${run.status}"}\n\n`)
    reply.raw.end()
  })
}
