import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection'
import { outlines, projects } from '../db/schema'
import { eq, and } from 'drizzle-orm'

export function registerOutlineRoutes(app: FastifyInstance) {
  // PUT /api/outlines/reorder — batch update order_index
  app.put('/api/outlines/reorder', async (request, reply) => {
    const schema = z.object({
      projectId: z.string().uuid(),
      orders: z.array(z.object({ id: z.string().uuid(), orderIndex: z.number() })),
    })
    const body = schema.parse(request.body)
    const db = getDb()

    const proj = await db.select({ userId: projects.userId }).from(projects)
      .where(eq(projects.id, body.projectId)).limit(1)
    if (proj.length === 0 || proj[0].userId !== request.userId) {
      reply.status(403).send({ error: '无权访问' }); return
    }

    for (const item of body.orders) {
      await db.update(outlines).set({ orderIndex: item.orderIndex })
        .where(and(eq(outlines.id, item.id), eq(outlines.projectId, body.projectId)))
    }
    reply.send({ success: true })
  })

  // POST /api/outlines/:id/expand — AI batch expand outline to chapter plans
  app.post('/api/outlines/:id/expand', async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ count: z.number().min(1).max(20).optional().default(5) })
    const body = schema.parse(request.body)
    const db = getDb()

    const found = await db.select().from(outlines)
      .innerJoin(projects, eq(outlines.projectId, projects.id))
      .where(and(eq(outlines.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) { reply.status(404).send({ error: '大纲不存在' }); return }

    const node = found[0].outlines
    const result: any[] = []

    for (let i = 0; i < body.count; i++) {
      const [row] = await db.insert(outlines).values({
        projectId: node.projectId,
        parentId: id,
        title: `${node.title} - 章节 ${i + 1}`,
        content: '',
        orderIndex: i,
      }).returning()
      result.push(row)
    }

    reply.status(201).send(result)
  })
}
