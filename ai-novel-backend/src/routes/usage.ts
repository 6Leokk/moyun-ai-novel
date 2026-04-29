import { FastifyInstance } from 'fastify'
import { getDb } from '../db/connection'
import { llmCallLogs, projects } from '../db/schema'
import { sql, count, eq, and, desc, inArray } from 'drizzle-orm'

export function registerUsageRoutes(app: FastifyInstance) {
  app.get('/api/user/usage', async (request, reply) => {
    if (!request.userId) { reply.status(401).send({ error: '未登录' }); return }
    const db = getDb()
    const { range } = request.query as { range?: string }
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
    const today = new Date(); today.setHours(0,0,0,0)
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0)
    const since = new Date(Date.now() - days*86400000)

    const userProjects = await db.select({ id: projects.id }).from(projects)
      .where(eq(projects.userId, request.userId))
    const projectIds = userProjects.map(p => p.id)

    if (projectIds.length === 0) {
      reply.send({ today:{calls:0,tokens:0,cost:0}, thisMonth:{calls:0,tokens:0,cost:0}, allTime:{calls:0,tokens:0,cost:0}, byModel:[], daily:[], dailyByModel:[] })
      return
    }

    const userFilter = inArray(llmCallLogs.projectId, projectIds)

    const [todayStats, monthStats, allTime, modelBreakdown, dailyUsage, dailyByModel] = await Promise.all([
      db.select({ calls: count(), tokens: sql`COALESCE(SUM(${llmCallLogs.inputTokens})+SUM(${llmCallLogs.outputTokens}), 0)::int`, cost: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}::numeric), 0)::float` })
        .from(llmCallLogs).where(and(userFilter, sql`${llmCallLogs.createdAt} >= ${today.toISOString()}`)),
      db.select({ calls: count(), tokens: sql`COALESCE(SUM(${llmCallLogs.inputTokens})+SUM(${llmCallLogs.outputTokens}), 0)::int`, cost: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}::numeric), 0)::float` })
        .from(llmCallLogs).where(and(userFilter, sql`${llmCallLogs.createdAt} >= ${thisMonth.toISOString()}`)),
      db.select({ calls: count(), tokens: sql`COALESCE(SUM(${llmCallLogs.inputTokens})+SUM(${llmCallLogs.outputTokens}), 0)::int`, cost: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}::numeric), 0)::float` })
        .from(llmCallLogs).where(userFilter),
      db.select({ model: llmCallLogs.model, provider: llmCallLogs.provider, calls: count(), tokens: sql`COALESCE(SUM(${llmCallLogs.inputTokens})+SUM(${llmCallLogs.outputTokens}), 0)::int`, cost: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}::numeric), 0)::float` })
        .from(llmCallLogs).where(userFilter).groupBy(llmCallLogs.model, llmCallLogs.provider).orderBy(desc(sql`COALESCE(SUM(${llmCallLogs.inputTokens})+SUM(${llmCallLogs.outputTokens}), 0)`)),
      db.select({ date: sql`DATE(${llmCallLogs.createdAt})::text`, tokens: sql`COALESCE(SUM(${llmCallLogs.inputTokens})+SUM(${llmCallLogs.outputTokens}), 0)::int`, calls: count(), cost: sql`COALESCE(SUM(${llmCallLogs.estimatedCost}::numeric), 0)::float` })
        .from(llmCallLogs).where(and(userFilter, sql`${llmCallLogs.createdAt} >= ${since.toISOString()}`))
        .groupBy(sql`DATE(${llmCallLogs.createdAt})`).orderBy(sql`DATE(${llmCallLogs.createdAt})`),
      db.select({ date: sql`DATE(${llmCallLogs.createdAt})::text`, model: llmCallLogs.model, tokens: sql`COALESCE(SUM(${llmCallLogs.inputTokens})+SUM(${llmCallLogs.outputTokens}), 0)::int`, calls: count() })
        .from(llmCallLogs).where(and(userFilter, sql`${llmCallLogs.createdAt} >= ${since.toISOString()}`))
        .groupBy(sql`DATE(${llmCallLogs.createdAt})`, llmCallLogs.model).orderBy(sql`DATE(${llmCallLogs.createdAt})`),
    ])

    reply.send({
      today: { calls: Number(todayStats[0]?.calls ?? 0), tokens: Number(todayStats[0]?.tokens ?? 0), cost: Number(todayStats[0]?.cost ?? 0) },
      thisMonth: { calls: Number(monthStats[0]?.calls ?? 0), tokens: Number(monthStats[0]?.tokens ?? 0), cost: Number(monthStats[0]?.cost ?? 0) },
      allTime: { calls: Number(allTime[0]?.calls ?? 0), tokens: Number(allTime[0]?.tokens ?? 0), cost: Number(allTime[0]?.cost ?? 0) },
      byModel: modelBreakdown.map(m => ({ model: m.model, provider: m.provider, calls: Number(m.calls), tokens: Number(m.tokens), cost: Number(m.cost) })),
      daily: dailyUsage.map(d => ({ date: d.date, tokens: Number(d.tokens), calls: Number(d.calls), cost: Number(d.cost) })),
      dailyByModel: dailyByModel.map(d => ({ date: d.date, model: d.model, tokens: Number(d.tokens), calls: Number(d.calls) })),
    })
  })
}
