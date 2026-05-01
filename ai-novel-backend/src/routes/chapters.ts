import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { chapters, projects } from '../db/schema.ts'
import { eq, and } from 'drizzle-orm'

export function registerChapterRoutes(app: FastifyInstance) {
  const createSchema = z.object({
    title: z.string().min(1).max(200),
    content: z.string().optional().default(''),
    wordCount: z.number().optional().default(0),
    status: z.enum(['draft', 'writing', 'done', 'archived']).optional().default('draft'),
    charactersPresent: z.array(z.string()).optional().default([]),
  })

  const updateSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    content: z.string().optional(),
    wordCount: z.number().optional(),
    status: z.enum(['draft', 'writing', 'done', 'archived']).optional(),
    charactersPresent: z.array(z.string()).optional(),
  })

  // GET /api/projects/:id/chapters
  app.get('/api/projects/:id/chapters', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    // Verify project ownership
    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    const rows = await db.select().from(chapters)
      .where(eq(chapters.projectId, id))
      .orderBy(chapters.chapterNumber)
    return { chapters: rows }
  })

  // POST /api/projects/:id/chapters
  app.post('/api/projects/:id/chapters', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createSchema.parse(request.body)
    const db = getDb()

    // Verify project ownership
    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    const all = await db.select().from(chapters).where(eq(chapters.projectId, id))
    const maxNum = Math.max(0, ...all.map(c => c.chapterNumber))

    const result = await db.insert(chapters).values({
      projectId: id,
      chapterNumber: maxNum + 1,
      title: body.title,
      content: body.content,
      wordCount: body.wordCount,
      status: body.status as 'draft' | 'writing' | 'done' | 'archived',
      charactersPresent: body.charactersPresent,
    }).returning()

    reply.status(201).send({ chapter: result[0] })
  })

  // GET /api/chapters/:id — MUST verify project ownership through chapter chain
  app.get('/api/chapters/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select()
      .from(chapters)
      .innerJoin(projects, eq(chapters.projectId, projects.id))
      .where(and(eq(chapters.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) {
      reply.status(404).send({ error: '章节不存在' })
      return
    }
    reply.send({ chapter: found[0].chapters })
  })

  // PUT /api/chapters/:id — MUST verify project ownership
  app.put('/api/chapters/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateSchema.parse(request.body)
    const db = getDb()

    const found = await db.select()
      .from(chapters)
      .innerJoin(projects, eq(chapters.projectId, projects.id))
      .where(and(eq(chapters.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) {
      reply.status(404).send({ error: '章节不存在' })
      return
    }

    const updates: Record<string, unknown> = {}
    if (body.title !== undefined) updates.title = body.title
    if (body.content !== undefined) updates.content = body.content
    if (body.wordCount !== undefined) updates.wordCount = body.wordCount
    if (body.status !== undefined) updates.status = body.status
    if (body.charactersPresent !== undefined) updates.charactersPresent = body.charactersPresent

    const updated = await db.update(chapters)
      .set(updates)
      .where(eq(chapters.id, id))
      .returning()

    reply.send({ chapter: updated[0] })
  })

  // DELETE /api/chapters/:id — MUST verify project ownership
  app.delete('/api/chapters/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select()
      .from(chapters)
      .innerJoin(projects, eq(chapters.projectId, projects.id))
      .where(and(eq(chapters.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) {
      reply.status(404).send({ error: '章节不存在' })
      return
    }

    await db.delete(chapters).where(eq(chapters.id, id))
    reply.status(204).send()
  })
}
