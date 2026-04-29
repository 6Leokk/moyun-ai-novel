import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection'
import { users, projects, agentRuns, promptTemplates, generationHistory, postProcessingTasks, llmCallLogs } from '../db/schema'
import { eq, sql, count, desc, and, isNull, inArray } from 'drizzle-orm'
import { canManageUserPermissions, isSoleSiteAdmin } from '../lib/permissions'

async function requireAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false
  const db = getDb()
  const u = await db.select({
    username: users.username,
    isAdmin: users.isAdmin,
    trustLevel: users.trustLevel,
    deletedAt: users.deletedAt,
  })
    .from(users).where(eq(users.id, userId)).limit(1)
  if (u.length === 0) return false
  return isSoleSiteAdmin(u[0])
}

export function registerAdminRoutes(app: FastifyInstance) {

  // ── Dashboard ──
  app.get('/api/admin/dashboard', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const db = getDb()

    const [userCount, projectCount, runCount, costSum, recentErrors] = await Promise.all([
      db.select({ n: count() }).from(users).where(isNull(users.deletedAt)),
      db.select({ n: count() }).from(projects).where(isNull(projects.deletedAt)),
      db.select({ n: count() }).from(agentRuns),
      db.select({ sum: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}), 0)` }).from(llmCallLogs),
      db.select({ n: count() }).from(agentRuns).where(eq(agentRuns.status, 'failed')),
    ])

    reply.send({
      userCount: userCount[0]?.n ?? 0,
      projectCount: projectCount[0]?.n ?? 0,
      agentRunCount: runCount[0]?.n ?? 0,
      totalCost: Number(costSum[0]?.sum ?? 0),
      recentErrors: recentErrors[0]?.n ?? 0,
    })
  })

  // ── User Management ──
  app.get('/api/admin/users', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const { search, page, limit } = request.query as { search?: string; page?: string; limit?: string }
    const db = getDb()
    const offset = (parseInt(page || '1') - 1) * parseInt(limit || '20')

    const conditions = [isNull(users.deletedAt)]
    if (search) conditions.push(sql`${users.email} ILIKE ${'%' + search + '%'} OR ${users.username} ILIKE ${'%' + search + '%'}`)

    const [rows, total] = await Promise.all([
      db.select().from(users).where(and(...conditions)).orderBy(desc(users.createdAt)).limit(parseInt(limit || '20')).offset(offset),
      db.select({ n: count() }).from(users).where(and(...conditions)),
    ])

    // Enrich with project count + cost
    const enriched = []
    for (const u of rows) {
      const [projCount, cost] = await Promise.all([
        db.select({ n: count() }).from(projects).where(and(eq(projects.userId, u.id), isNull(projects.deletedAt))),
        db.select({ sum: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}), 0)` }).from(llmCallLogs).where(eq(llmCallLogs.projectId as any, sql`(SELECT id FROM projects WHERE user_id = ${u.id} LIMIT 1)`)),
      ])
      enriched.push({ ...u, _projectCount: projCount[0]?.n ?? 0, _totalCost: Number(cost[0]?.sum ?? 0) })
    }

    reply.send({ users: enriched, total: total[0]?.n ?? 0 })
  })

  app.put('/api/admin/users/:id', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const { id } = request.params as { id: string }
    const schema = z.object({ trustLevel: z.number().min(-1).max(3).optional(), isAdmin: z.boolean().optional() })
    const body = schema.parse(request.body)
    const db = getDb()
    const target = await db.select({ id: users.id, username: users.username })
      .from(users).where(eq(users.id, id)).limit(1)
    if (target.length === 0) { reply.status(404).send({ error: '用户不存在' }); return }
    if (!canManageUserPermissions({
      actorId: request.userId!,
      targetId: id,
      targetUsername: target[0].username,
      updates: body,
    })) {
      reply.status(403).send({ error: '不允许执行该权限变更' })
      return
    }
    const updates: Record<string, unknown> = {}
    if (body.trustLevel !== undefined) updates.trustLevel = body.trustLevel
    if (body.isAdmin !== undefined) updates.isAdmin = body.isAdmin
    await db.update(users).set(updates).where(eq(users.id, id))
    reply.send({ success: true })
  })

  app.post('/api/admin/users/:id/disable', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const { id } = request.params as { id: string }
    const db = getDb()
    const target = await db.select({ id: users.id, username: users.username })
      .from(users).where(eq(users.id, id)).limit(1)
    if (target.length === 0) { reply.status(404).send({ error: '用户不存在' }); return }
    const deletedAt = new Date()
    if (!canManageUserPermissions({
      actorId: request.userId!,
      targetId: id,
      targetUsername: target[0].username,
      updates: { deletedAt },
    })) {
      reply.status(403).send({ error: '不允许禁用唯一管理员' })
      return
    }
    await db.update(users).set({ deletedAt } as any).where(eq(users.id, id))
    reply.send({ success: true })
  })

  // ── Task Queue ──
  app.get('/api/admin/tasks', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const db = getDb()
    const rows = await db.select().from(postProcessingTasks)
      .where(eq(postProcessingTasks.status, 'pending'))
      .orderBy(desc(postProcessingTasks.createdAt)).limit(20)
    reply.send(rows)
  })

  // ── Recent Errors ──
  app.get('/api/admin/errors', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const db = getDb()
    const rows = await db.select().from(agentRuns)
      .where(eq(agentRuns.status, 'failed'))
      .orderBy(desc(agentRuns.finishedAt)).limit(20)
    reply.send(rows)
  })

  // ── Analytics ──
  app.get('/api/admin/analytics', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const db = getDb()
    const today = new Date(); today.setHours(0,0,0,0)
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0)

    const [todayStats, monthStats, totalCalls, modelStats, providerStats] = await Promise.all([
      db.select({ calls: count(), tokens: sql`COALESCE(SUM(${llmCallLogs.inputTokens}) + SUM(${llmCallLogs.outputTokens}), 0)`, cost: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}), 0)` }).from(llmCallLogs).where(sql`${llmCallLogs.createdAt} >= ${today.toISOString()}`),
      db.select({ calls: count(), tokens: sql`COALESCE(SUM(${llmCallLogs.inputTokens}) + SUM(${llmCallLogs.outputTokens}), 0)`, cost: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}), 0)` }).from(llmCallLogs).where(sql`${llmCallLogs.createdAt} >= ${thisMonth.toISOString()}`),
      db.select({ n: count() }).from(llmCallLogs),
      db.select({ model: llmCallLogs.model, provider: llmCallLogs.provider, calls: count(), tokens: sql`COALESCE(SUM(${llmCallLogs.inputTokens}) + SUM(${llmCallLogs.outputTokens}), 0)`, cost: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}), 0)` }).from(llmCallLogs).groupBy(llmCallLogs.model, llmCallLogs.provider).orderBy(desc(sql`COALESCE(SUM(${llmCallLogs.estimatedCost}), 0)`)),
      db.select({ provider: llmCallLogs.provider, calls: count(), tokens: sql`COALESCE(SUM(${llmCallLogs.inputTokens}) + SUM(${llmCallLogs.outputTokens}), 0)`, cost: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}), 0)` }).from(llmCallLogs).groupBy(llmCallLogs.provider),
    ])

    reply.send({
      today: { calls: Number(todayStats[0]?.calls ?? 0), tokens: Number(todayStats[0]?.tokens ?? 0), cost: Number(todayStats[0]?.cost ?? 0) },
      thisMonth: { calls: Number(monthStats[0]?.calls ?? 0), tokens: Number(monthStats[0]?.tokens ?? 0), cost: Number(monthStats[0]?.cost ?? 0) },
      totalCalls: totalCalls[0]?.n ?? 0,
      byModel: modelStats.map(m => ({ ...m, tokens: Number(m.tokens), cost: Number(m.cost), calls: Number(m.calls) })),
      byProvider: providerStats.map(p => ({ ...p, tokens: Number(p.tokens), cost: Number(p.cost), calls: Number(p.calls) })),
    })
  })

  // ── Project Management ──
  app.get('/api/admin/projects', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const { storage } = request.query as { storage?: string }
    const db = getDb()
    const conditions = [isNull(projects.deletedAt)]
    if (storage && storage !== 'all') conditions.push(eq(projects.storageBackend as any, storage))

    const rows = await db.select({
      id: projects.id, title: projects.title, userId: projects.userId,
      status: projects.status, storageBackend: projects.storageBackend,
      sqliteStatus: projects.sqliteStatus, currentWords: projects.currentWords,
      createdAt: projects.createdAt,
    }).from(projects).where(and(...conditions)).orderBy(desc(projects.createdAt)).limit(100)

    // Enrich with user emails
    const userIds = [...new Set(rows.map(r => r.userId))]
    const userMap = new Map()
    if (userIds.length > 0) {
      const urows = await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, userIds))
      for (const u of urows) userMap.set(u.id, u.email)
    }

    reply.send({ projects: rows.map(r => ({ ...r, _userEmail: userMap.get(r.userId) })) })
  })

  app.delete('/api/admin/projects/:id', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const { id } = request.params as { id: string }
    const db = getDb()
    await db.update(projects).set({ deletedAt: new Date() } as any).where(eq(projects.id, id))
    reply.send({ success: true })
  })

  // ── Workshop Moderation ──
  app.get('/api/admin/workshop', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const db = getDb()
    const rows = await db.select().from(promptTemplates).where(eq(promptTemplates.isPublic, true)).orderBy(desc(promptTemplates.createdAt)).limit(100)
    reply.send({ templates: rows })
  })

  app.post('/api/admin/workshop/:id/toggle', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const { id } = request.params as { id: string }
    const db = getDb()
    const t = await db.select({ isPublic: promptTemplates.isPublic }).from(promptTemplates).where(eq(promptTemplates.id, id)).limit(1)
    if (t.length === 0) { reply.status(404).send({ error: '不存在' }); return }
    await db.update(promptTemplates).set({ isPublic: !t[0].isPublic } as any).where(eq(promptTemplates.id, id))
    reply.send({ success: true })
  })

  // ── System Config ──
  app.get('/api/admin/config', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    reply.send({
      smtpHost: process.env.SMTP_HOST || '',
      smtpPort: process.env.SMTP_PORT || '465',
      smtpUser: process.env.SMTP_USER || '',
      smtpFrom: process.env.SMTP_FROM || '',
      registerEnabled: process.env.REGISTER_ENABLED !== 'false',
    })
  })

  // ── Database Management ──
  app.get('/api/admin/database', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const db = getDb()
    const [pgProjects, sqliteProjects, migratingProjects, errorProjects, pendingTasks] = await Promise.all([
      db.select({ n: count() }).from(projects).where(and(eq(projects.storageBackend as any, 'pg_legacy'), isNull(projects.deletedAt))),
      db.select({ n: count() }).from(projects).where(and(eq(projects.storageBackend as any, 'sqlite'), isNull(projects.deletedAt))),
      db.select({ n: count() }).from(projects).where(eq(projects.sqliteStatus as any, 'migrating')),
      db.select({ n: count() }).from(projects).where(eq(projects.sqliteStatus as any, 'error')),
      db.select({ n: count() }).from(postProcessingTasks).where(eq(postProcessingTasks.status, 'pending')),
    ])

    reply.send({
      pgLegacyProjects: pgProjects[0]?.n ?? 0,
      sqliteProjects: sqliteProjects[0]?.n ?? 0,
      migratingProjects: migratingProjects[0]?.n ?? 0,
      errorProjects: errorProjects[0]?.n ?? 0,
      pendingTasks: pendingTasks[0]?.n ?? 0,
    })
  })

  app.post('/api/admin/database/migrate-all', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const db = getDb()
    const pgProjects = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.storageBackend as any, 'pg_legacy'), isNull(projects.deletedAt))).limit(10)

    let migrated = 0
    for (const p of pgProjects) {
      try {
        const { migrateProjectToSQLite } = await import('../services/migration-service')
        await migrateProjectToSQLite(p.id)
        migrated++
      } catch { /* skip failures */ }
    }
    reply.send({ migrated, total: pgProjects.length })
  })

  // ── Reset Stats ──
  app.post('/api/admin/reset-stats', async (request, reply) => {
    if (!await requireAdmin(request.userId)) { reply.status(403).send({ error: '无权访问' }); return }
    const db = getDb()
    await db.delete(llmCallLogs)
    await db.delete(generationHistory)
    reply.send({ success: true })
  })

  // ── User Token Usage (self-service) ──
  app.get('/api/user/token-usage', async (request, reply) => {
    if (!request.userId) { reply.status(401).send({ error: '未登录' }); return }
    const db = getDb()
    const today = new Date(); today.setHours(0,0,0,0)
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0)

    // Get user's project IDs for filtering
    const userProjects = await db.select({ id: projects.id }).from(projects)
      .where(eq(projects.userId, request.userId))
    const projectIds = userProjects.map(p => p.id)

    if (projectIds.length === 0) {
      reply.send({ today: {calls:0,cost:0,tokens:0}, thisMonth: {calls:0,cost:0,tokens:0}, allTime: {calls:0,cost:0,tokens:0} })
      return
    }

    const userFilter = inArray(llmCallLogs.projectId, projectIds)

    const [todayStats, monthStats, allTime] = await Promise.all([
      db.select({ calls: count(), cost: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}), 0)`, tokens: sql`COALESCE(SUM(${llmCallLogs.inputTokens}) + SUM(${llmCallLogs.outputTokens}), 0)` })
        .from(llmCallLogs).where(and(userFilter, sql`${llmCallLogs.createdAt} >= ${today.toISOString()}`)),
      db.select({ calls: count(), cost: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}), 0)`, tokens: sql`COALESCE(SUM(${llmCallLogs.inputTokens}) + SUM(${llmCallLogs.outputTokens}), 0)` })
        .from(llmCallLogs).where(and(userFilter, sql`${llmCallLogs.createdAt} >= ${thisMonth.toISOString()}`)),
      db.select({ calls: count(), cost: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}), 0)`, tokens: sql`COALESCE(SUM(${llmCallLogs.inputTokens}) + SUM(${llmCallLogs.outputTokens}), 0)` })
        .from(llmCallLogs).where(userFilter),
    ])

    reply.send({
      today: { calls: todayStats[0]?.calls ?? 0, cost: Number(todayStats[0]?.cost ?? 0), tokens: Number(todayStats[0]?.tokens ?? 0) },
      thisMonth: { calls: monthStats[0]?.calls ?? 0, cost: Number(monthStats[0]?.cost ?? 0), tokens: Number(monthStats[0]?.tokens ?? 0) },
      allTime: { calls: allTime[0]?.calls ?? 0, cost: Number(allTime[0]?.cost ?? 0), tokens: Number(allTime[0]?.tokens ?? 0) },
    })
  })
}
