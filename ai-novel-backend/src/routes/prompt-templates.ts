import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { promptTemplates } from '../db/schema.ts'
import { eq, and, sql } from 'drizzle-orm'

export function registerPromptTemplateRoutes(app: FastifyInstance) {
  const createSchema = z.object({
    templateKey: z.string().min(1).max(100),
    name: z.string().min(1).max(100),
    content: z.string().min(1, '模板内容不能为空'),
    variables: z.array(z.string()).optional().default([]),
    forkFromId: z.string().uuid().nullable().optional(),
  })

  const updateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    content: z.string().min(1).optional(),
    variables: z.array(z.string()).optional(),
  })

  // GET /api/prompt-templates — list user's + system templates
  app.get('/api/prompt-templates', async (request) => {
    const db = getDb()
    return db.select().from(promptTemplates)
      .where(sql`${promptTemplates.userId} IS NULL OR ${promptTemplates.userId} = ${request.userId!}`)
      .orderBy(promptTemplates.templateKey, promptTemplates.userId)
  })

  // GET /api/prompt-templates/:id
  app.get('/api/prompt-templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()
    const found = await db.select().from(promptTemplates)
      .where(and(eq(promptTemplates.id, id), sql`(${promptTemplates.userId} IS NULL OR ${promptTemplates.userId} = ${request.userId!})`))
      .limit(1)
    if (found.length === 0) { reply.status(404).send({ error: '模板不存在' }); return }
    reply.send(found[0])
  })

  // POST /api/prompt-templates — create custom template
  app.post('/api/prompt-templates', async (request, reply) => {
    const body = createSchema.parse(request.body)
    const db = getDb()

    // If forking from a system template, verify it exists
    if (body.forkFromId) {
      const original = await db.select().from(promptTemplates)
        .where(eq(promptTemplates.id, body.forkFromId)).limit(1)
      if (original.length === 0) {
        reply.status(400).send({ error: '原始模板不存在' })
        return
      }
    }

    // Prevent duplicate user template for same key
    const existing = await db.select({ id: promptTemplates.id })
      .from(promptTemplates)
      .where(and(eq(promptTemplates.templateKey, body.templateKey), eq(promptTemplates.userId, request.userId!)))
      .limit(1)

    if (existing.length > 0) {
      reply.status(409).send({ error: '你已自定义过此模板，请直接修改现有模板' })
      return
    }

    const result = await db.insert(promptTemplates).values({
      userId: request.userId!,
      templateKey: body.templateKey,
      name: body.name,
      content: body.content,
      variables: body.variables,
      forkFromId: body.forkFromId || null,
      isPublic: false,
    }).returning()

    reply.status(201).send(result[0])
  })

  // PUT /api/prompt-templates/:id — update own template
  app.put('/api/prompt-templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateSchema.parse(request.body)
    const db = getDb()

    const found = await db.select().from(promptTemplates)
      .where(and(eq(promptTemplates.id, id), eq(promptTemplates.userId, request.userId!)))
      .limit(1)
    if (found.length === 0) { reply.status(404).send({ error: '模板不存在或无权修改' }); return }

    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.content !== undefined) updates.content = body.content
    if (body.variables !== undefined) updates.variables = body.variables

    const updated = await db.update(promptTemplates).set(updates).where(eq(promptTemplates.id, id)).returning()
    reply.send(updated[0])
  })

  // DELETE /api/prompt-templates/:id — delete own template
  app.delete('/api/prompt-templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select().from(promptTemplates)
      .where(and(eq(promptTemplates.id, id), eq(promptTemplates.userId, request.userId!)))
      .limit(1)
    if (found.length === 0) { reply.status(404).send({ error: '模板不存在或无权删除' }); return }

    await db.delete(promptTemplates).where(eq(promptTemplates.id, id))
    reply.status(204).send()
  })

  // POST /api/prompt-templates/:id/reset — reset user template to system default
  app.post('/api/prompt-templates/:id/reset', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select().from(promptTemplates)
      .where(and(eq(promptTemplates.id, id), eq(promptTemplates.userId, request.userId!)))
      .limit(1)
    if (found.length === 0) { reply.status(404).send({ error: '模板不存在' }); return }

    await db.delete(promptTemplates).where(eq(promptTemplates.id, id))
    reply.status(204).send()
  })
}
