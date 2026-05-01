import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { projects, worldEntries } from '../db/schema.ts'
import { eq, and } from 'drizzle-orm'

type WorldEntryRow = typeof worldEntries.$inferSelect

function toFrontendWorldEntry(row: WorldEntryRow) {
  return {
    ...row,
    desc: row.description,
  }
}

export function registerWorldEntryRoutes(app: FastifyInstance) {
  const createSchema = z.object({
    category: z.string().min(1).max(20).optional().default('location'),
    icon: z.string().optional().default('*'),
    name: z.string().min(1).max(200),
    desc: z.string().optional(),
    description: z.string().optional(),
    iconBg: z.string().optional().default('linear-gradient(135deg,#1a1a1c,#2a2a2d)'),
    tags: z.array(z.string()).optional().default([]),
  })

  const updateSchema = createSchema.partial()

  // GET /api/projects/:id/world-entries
  app.get('/api/projects/:id/world-entries', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    const rows = await db.select().from(worldEntries)
      .where(eq(worldEntries.projectId, id))
      .orderBy(worldEntries.createdAt)

    reply.send({ worldEntries: rows.map(toFrontendWorldEntry) })
  })

  // POST /api/projects/:id/world-entries
  app.post('/api/projects/:id/world-entries', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createSchema.parse(request.body)
    const db = getDb()

    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    const result = await db.insert(worldEntries).values({
      projectId: id,
      category: body.category,
      icon: body.icon,
      name: body.name,
      description: body.description ?? body.desc ?? '',
      iconBg: body.iconBg,
      tags: body.tags,
    }).returning()

    reply.status(201).send({ worldEntry: toFrontendWorldEntry(result[0]) })
  })

  // PUT /api/world-entries/:id
  app.put('/api/world-entries/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateSchema.parse(request.body)
    const db = getDb()

    const found = await db.select().from(worldEntries)
      .innerJoin(projects, eq(worldEntries.projectId, projects.id))
      .where(and(eq(worldEntries.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) { reply.status(404).send({ error: '世界条目不存在' }); return }

    const updates: Partial<typeof worldEntries.$inferInsert> = {}
    if (body.category !== undefined) updates.category = body.category
    if (body.icon !== undefined) updates.icon = body.icon
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.desc !== undefined && body.description === undefined) updates.description = body.desc
    if (body.iconBg !== undefined) updates.iconBg = body.iconBg
    if (body.tags !== undefined) updates.tags = body.tags

    const updated = await db.update(worldEntries)
      .set(updates)
      .where(eq(worldEntries.id, id))
      .returning()

    reply.send({ worldEntry: toFrontendWorldEntry(updated[0]) })
  })

  // DELETE /api/world-entries/:id
  app.delete('/api/world-entries/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select().from(worldEntries)
      .innerJoin(projects, eq(worldEntries.projectId, projects.id))
      .where(and(eq(worldEntries.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) { reply.status(404).send({ error: '世界条目不存在' }); return }

    await db.delete(worldEntries).where(eq(worldEntries.id, id))
    reply.status(204).send()
  })
}
