import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { writingStyles, projectDefaultStyles, projects } from '../db/schema.ts'
import { eq, and, sql } from 'drizzle-orm'

export function registerWritingStyleRoutes(app: FastifyInstance) {
  // GET /api/writing-styles — list user's styles + system defaults
  app.get('/api/writing-styles', async (request) => {
    const db = getDb()
    return db.select().from(writingStyles)
      .where(sql`${writingStyles.userId} IS NULL OR ${writingStyles.userId} = ${request.userId!}`)
      .orderBy(writingStyles.orderIndex)
  })

  // GET /api/writing-styles/:id
  app.get('/api/writing-styles/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()
    const found = await db.select().from(writingStyles)
      .where(and(eq(writingStyles.id, id), sql`(${writingStyles.userId} IS NULL OR ${writingStyles.userId} = ${request.userId!})`))
      .limit(1)
    if (found.length === 0) { reply.status(404).send({ error: '风格不存在' }); return }
    reply.send(found[0])
  })

  // POST /api/writing-styles — create custom style
  app.post('/api/writing-styles', async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      styleContent: z.string().min(1, '风格内容不能为空'),
      orderIndex: z.number().optional().default(0),
    })
    const body = schema.parse(request.body)
    const db = getDb()
    const result = await db.insert(writingStyles).values({
      userId: request.userId!,
      name: body.name,
      description: body.description || null,
      styleContent: body.styleContent,
      orderIndex: body.orderIndex,
    }).returning()
    reply.status(201).send(result[0])
  })

  // PUT /api/writing-styles/:id — update own style
  app.put('/api/writing-styles/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().nullable().optional(),
      styleContent: z.string().min(1).optional(),
      orderIndex: z.number().optional(),
    })
    const body = schema.parse(request.body)
    const db = getDb()

    const found = await db.select().from(writingStyles)
      .where(and(eq(writingStyles.id, id), eq(writingStyles.userId, request.userId!)))
      .limit(1)
    if (found.length === 0) { reply.status(404).send({ error: '风格不存在或无权修改' }); return }

    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.styleContent !== undefined) updates.styleContent = body.styleContent
    if (body.orderIndex !== undefined) updates.orderIndex = body.orderIndex

    const updated = await db.update(writingStyles).set(updates).where(eq(writingStyles.id, id)).returning()
    reply.send(updated[0])
  })

  // DELETE /api/writing-styles/:id — delete own style
  app.delete('/api/writing-styles/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select().from(writingStyles)
      .where(and(eq(writingStyles.id, id), eq(writingStyles.userId, request.userId!)))
      .limit(1)
    if (found.length === 0) { reply.status(404).send({ error: '风格不存在或无权删除' }); return }

    // Unlink from any projects
    await db.delete(projectDefaultStyles).where(eq(projectDefaultStyles.styleId, id))
    await db.delete(writingStyles).where(eq(writingStyles.id, id))
    reply.status(204).send()
  })

  // GET /api/projects/:id/default-style
  app.get('/api/projects/:id/default-style', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const proj = await db.select({ userId: projects.userId }).from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    const pds = await db.select({ styleId: projectDefaultStyles.styleId })
      .from(projectDefaultStyles).where(eq(projectDefaultStyles.projectId, id)).limit(1)

    if (pds.length === 0) { reply.send(null); return }

    const ws = await db.select().from(writingStyles).where(eq(writingStyles.id, pds[0].styleId)).limit(1)
    reply.send(ws[0] || null)
  })

  // PUT /api/projects/:id/default-style — set project default style
  app.put('/api/projects/:id/default-style', async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ styleId: z.string().uuid() })
    const body = schema.parse(request.body)
    const db = getDb()

    const proj = await db.select({ userId: projects.userId }).from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    // Verify style exists and is accessible
    const style = await db.select().from(writingStyles)
      .where(and(eq(writingStyles.id, body.styleId), sql`(${writingStyles.userId} IS NULL OR ${writingStyles.userId} = ${request.userId!})`))
      .limit(1)
    if (style.length === 0) { reply.status(404).send({ error: '风格不存在' }); return }

    // Upsert
    await db.delete(projectDefaultStyles).where(eq(projectDefaultStyles.projectId, id))
    await db.insert(projectDefaultStyles).values({ projectId: id, styleId: body.styleId })

    reply.send(style[0])
  })
}
