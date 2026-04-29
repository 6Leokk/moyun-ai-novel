import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { promptTemplates } from '../db/schema.ts'
import { eq, and, sql, desc, like } from 'drizzle-orm'

export function registerPromptWorkshopRoutes(app: FastifyInstance) {
  // GET /api/prompt-workshop — browse public templates
  app.get('/api/prompt-workshop', async (request) => {
    const { search, sort, key } = request.query as {
      search?: string; sort?: string; key?: string;
    }
    const db = getDb()

    const conditions: any[] = [eq(promptTemplates.isPublic, true)]
    if (key) conditions.push(eq(promptTemplates.templateKey, key))
    if (search) {
      conditions.push(
        sql`(${promptTemplates.name} ILIKE ${'%' + search + '%'} OR ${promptTemplates.content} ILIKE ${'%' + search + '%'})`
      )
    }

    const base = db.select().from(promptTemplates).where(and(...conditions))

    if (sort === 'downloads') return base.orderBy(desc(promptTemplates.downloads)).limit(50)
    if (sort === 'rating') return base.orderBy(desc(promptTemplates.rating)).limit(50)
    return base.orderBy(desc(promptTemplates.createdAt)).limit(50)
  })

  // GET /api/prompt-workshop/:id
  app.get('/api/prompt-workshop/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()
    const found = await db.select().from(promptTemplates)
      .where(and(eq(promptTemplates.id, id), eq(promptTemplates.isPublic, true)))
      .limit(1)
    if (found.length === 0) { reply.status(404).send({ error: '模板不存在' }); return }
    reply.send(found[0])
  })

  // POST /api/prompt-workshop/:id/fork — fork a public template
  app.post('/api/prompt-workshop/:id/fork', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const original = await db.select().from(promptTemplates)
      .where(and(eq(promptTemplates.id, id), eq(promptTemplates.isPublic, true)))
      .limit(1)
    if (original.length === 0) { reply.status(404).send({ error: '模板不存在' }); return }

    const src = original[0]

    // Check if user already forked this
    const existing = await db.select({ id: promptTemplates.id })
      .from(promptTemplates)
      .where(and(
        eq(promptTemplates.templateKey, src.templateKey),
        eq(promptTemplates.userId, request.userId!),
      ))
      .limit(1)

    if (existing.length > 0) {
      reply.status(409).send({ error: '你已导入过此模板', existingId: existing[0].id })
      return
    }

    // Increment download count
    await db.update(promptTemplates)
      .set({ downloads: sql`${promptTemplates.downloads} + 1` })
      .where(eq(promptTemplates.id, id))

    const result = await db.insert(promptTemplates).values({
      userId: request.userId!,
      templateKey: src.templateKey,
      name: src.name,
      content: src.content,
      variables: src.variables,
      forkFromId: id,
      isPublic: false,
    }).returning()

    reply.status(201).send(result[0])
  })

  // POST /api/prompt-workshop/:id/rate — rate a template (1-5)
  app.post('/api/prompt-workshop/:id/rate', async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ rating: z.number().min(1).max(5) })
    const body = schema.parse(request.body)
    const db = getDb()

    const found = await db.select().from(promptTemplates)
      .where(and(eq(promptTemplates.id, id), eq(promptTemplates.isPublic, true)))
      .limit(1)
    if (found.length === 0) { reply.status(404).send({ error: '模板不存在' }); return }

    // Simple averaging: store accumulated rating as integer (sum of ratings),
    // downloads as count of ratings. This is a simplified approach.
    const newRating = Math.round((found[0].rating * (found[0].downloads || 1) + body.rating) / ((found[0].downloads || 1) + 1))

    await db.update(promptTemplates)
      .set({ rating: sql`${promptTemplates.rating} + ${body.rating}`, downloads: sql`${promptTemplates.downloads} + 1` })
      .where(eq(promptTemplates.id, id))

    reply.send({ rating: newRating })
  })

  // POST /api/prompt-templates/:id/publish — make template public
  app.post('/api/prompt-templates/:id/publish', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select().from(promptTemplates)
      .where(and(eq(promptTemplates.id, id), eq(promptTemplates.userId, request.userId!)))
      .limit(1)
    if (found.length === 0) { reply.status(404).send({ error: '模板不存在' }); return }

    await db.update(promptTemplates).set({ isPublic: true }).where(eq(promptTemplates.id, id))
    reply.send({ success: true })
  })

  // POST /api/prompt-templates/:id/unpublish — make template private
  app.post('/api/prompt-templates/:id/unpublish', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select().from(promptTemplates)
      .where(and(eq(promptTemplates.id, id), eq(promptTemplates.userId, request.userId!)))
      .limit(1)
    if (found.length === 0) { reply.status(404).send({ error: '模板不存在' }); return }

    await db.update(promptTemplates).set({ isPublic: false }).where(eq(promptTemplates.id, id))
    reply.send({ success: true })
  })
}
