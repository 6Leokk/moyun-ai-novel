import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { foreshadows, projects, chapters } from '../db/schema.ts'
import { eq, and } from 'drizzle-orm'

export function registerForeshadowRoutes(app: FastifyInstance) {
  const createSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().optional().default(''),
    plantedChapterId: z.string().uuid().nullable().optional(),
    plantedAt: z.string().optional(),
    color: z.string().optional().default('#f0a040'),
  })

  const updateSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().optional(),
    plantedChapterId: z.string().uuid().nullable().optional(),
    plantedAt: z.string().nullable().optional(),
    resolvedChapterId: z.string().uuid().nullable().optional(),
    resolvedAt: z.string().nullable().optional(),
    status: z.enum(['planted', 'hinted', 'resolved']).optional(),
    color: z.string().optional(),
  })

  // GET /api/projects/:id/foreshadows
  app.get('/api/projects/:id/foreshadows', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    return db.select().from(foreshadows)
      .where(eq(foreshadows.projectId, id))
      .orderBy(foreshadows.createdAt)
  })

  // POST /api/projects/:id/foreshadows
  app.post('/api/projects/:id/foreshadows', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createSchema.parse(request.body)
    const db = getDb()

    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    const result = await db.insert(foreshadows).values({
      projectId: id,
      title: body.title,
      description: body.description,
      plantedChapterId: body.plantedChapterId || null,
      plantedAt: body.plantedAt || null,
      color: body.color,
      status: 'planted',
    }).returning()

    reply.status(201).send(result[0])
  })

  // PUT /api/foreshadows/:id
  app.put('/api/foreshadows/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateSchema.parse(request.body)
    const db = getDb()

    const found = await db.select().from(foreshadows)
      .innerJoin(projects, eq(foreshadows.projectId, projects.id))
      .where(and(eq(foreshadows.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) { reply.status(404).send({ error: '伏笔不存在' }); return }

    const updates: Record<string, unknown> = {}
    if (body.title !== undefined) updates.title = body.title
    if (body.description !== undefined) updates.description = body.description
    if (body.plantedChapterId !== undefined) updates.plantedChapterId = body.plantedChapterId
    if (body.plantedAt !== undefined) updates.plantedAt = body.plantedAt
    if (body.resolvedChapterId !== undefined) updates.resolvedChapterId = body.resolvedChapterId
    if (body.resolvedAt !== undefined) updates.resolvedAt = body.resolvedAt
    if (body.status !== undefined) updates.status = body.status
    if (body.color !== undefined) updates.color = body.color

    // Auto-set resolvedAt when resolving
    if (body.status === 'resolved' && !body.resolvedAt) {
      updates.resolvedAt = new Date().toISOString()
    }

    const updated = await db.update(foreshadows).set(updates).where(eq(foreshadows.id, id)).returning()
    reply.send(updated[0])
  })

  // DELETE /api/foreshadows/:id
  app.delete('/api/foreshadows/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select().from(foreshadows)
      .innerJoin(projects, eq(foreshadows.projectId, projects.id))
      .where(and(eq(foreshadows.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) { reply.status(404).send({ error: '伏笔不存在' }); return }

    await db.delete(foreshadows).where(eq(foreshadows.id, id))
    reply.status(204).send()
  })

  // GET /api/projects/:id/foreshadows/stats
  app.get('/api/projects/:id/foreshadows/stats', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    const all = await db.select().from(foreshadows).where(eq(foreshadows.projectId, id))
    reply.send({
      total: all.length,
      planted: all.filter(f => f.status === 'planted').length,
      hinted: all.filter(f => f.status === 'hinted').length,
      resolved: all.filter(f => f.status === 'resolved').length,
      unresolvedCount: all.filter(f => f.status !== 'resolved').length,
    })
  })
}
