import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection'
import { outlines, projects } from '../db/schema'
import { eq, and } from 'drizzle-orm'

type OutlineRow = typeof outlines.$inferSelect

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function toFrontendPlotNode(row: OutlineRow) {
  const structure = asRecord(row.structure)
  const desc = typeof structure.desc === 'string' ? structure.desc : row.content
  const type = typeof structure.type === 'string' ? structure.type : (row.parentId ? 'sub' : 'main')

  return {
    ...row,
    desc,
    type,
    emoji: typeof structure.emoji === 'string' ? structure.emoji : undefined,
    color: typeof structure.color === 'string' ? structure.color : '#5a7d94',
    chapterId: typeof structure.chapterId === 'string' ? structure.chapterId : null,
  }
}

export function registerOutlineRoutes(app: FastifyInstance) {
  const plotNodeSchema = z.object({
    parentId: z.string().nullable().optional(),
    title: z.string().min(1).max(200),
    desc: z.string().optional(),
    description: z.string().optional(),
    content: z.string().optional(),
    type: z.string().optional().default('main'),
    chapterId: z.string().nullable().optional(),
    emoji: z.string().optional(),
    color: z.string().optional().default('#5a7d94'),
    orderIndex: z.number().int().optional().default(0),
  })

  const plotNodeUpdateSchema = plotNodeSchema.partial()

  // GET /api/projects/:id/plot-nodes — frontend-compatible alias for outlines.
  app.get('/api/projects/:id/plot-nodes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    const rows = await db.select().from(outlines)
      .where(eq(outlines.projectId, id))
      .orderBy(outlines.orderIndex)

    reply.send({ plotNodes: rows.map(toFrontendPlotNode) })
  })

  // POST /api/projects/:id/plot-nodes
  app.post('/api/projects/:id/plot-nodes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = plotNodeSchema.parse(request.body)
    const db = getDb()

    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    const content = body.content ?? body.description ?? body.desc ?? ''
    const result = await db.insert(outlines).values({
      projectId: id,
      parentId: body.parentId ?? null,
      title: body.title,
      content,
      structure: {
        desc: body.desc ?? body.description ?? content,
        type: body.type,
        chapterId: body.chapterId ?? null,
        emoji: body.emoji,
        color: body.color,
      },
      orderIndex: body.orderIndex,
    }).returning()

    reply.status(201).send({ plotNode: toFrontendPlotNode(result[0]) })
  })

  // PUT /api/plot-nodes/:id
  app.put('/api/plot-nodes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = plotNodeUpdateSchema.parse(request.body)
    const db = getDb()

    const found = await db.select().from(outlines)
      .innerJoin(projects, eq(outlines.projectId, projects.id))
      .where(and(eq(outlines.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) { reply.status(404).send({ error: '剧情节点不存在' }); return }

    const node = found[0].outlines as OutlineRow
    const updates: Partial<typeof outlines.$inferInsert> = {}
    const nextStructure = { ...asRecord(node.structure) }
    let changedStructure = false

    if (body.parentId !== undefined) updates.parentId = body.parentId
    if (body.title !== undefined) updates.title = body.title
    if (body.content !== undefined) updates.content = body.content
    if (body.description !== undefined) updates.content = body.description
    if (body.desc !== undefined) updates.content = body.desc
    if (body.orderIndex !== undefined) updates.orderIndex = body.orderIndex
    if (body.desc !== undefined) { nextStructure.desc = body.desc; changedStructure = true }
    if (body.description !== undefined && body.desc === undefined) { nextStructure.desc = body.description; changedStructure = true }
    if (body.content !== undefined && body.desc === undefined && body.description === undefined) { nextStructure.desc = body.content; changedStructure = true }
    if (body.type !== undefined) { nextStructure.type = body.type; changedStructure = true }
    if (body.chapterId !== undefined) { nextStructure.chapterId = body.chapterId; changedStructure = true }
    if (body.emoji !== undefined) { nextStructure.emoji = body.emoji; changedStructure = true }
    if (body.color !== undefined) { nextStructure.color = body.color; changedStructure = true }
    if (changedStructure) updates.structure = nextStructure

    const updated = await db.update(outlines)
      .set(updates)
      .where(eq(outlines.id, id))
      .returning()

    reply.send({ plotNode: toFrontendPlotNode(updated[0]) })
  })

  // DELETE /api/plot-nodes/:id
  app.delete('/api/plot-nodes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select().from(outlines)
      .innerJoin(projects, eq(outlines.projectId, projects.id))
      .where(and(eq(outlines.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) { reply.status(404).send({ error: '剧情节点不存在' }); return }

    await db.delete(outlines).where(eq(outlines.parentId, id))
    await db.delete(outlines).where(eq(outlines.id, id))
    reply.status(204).send()
  })

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
