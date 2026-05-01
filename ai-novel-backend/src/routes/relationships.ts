import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { characters, characterRelationships, projects } from '../db/schema.ts'
import { eq, and, or, sql } from 'drizzle-orm'

type RelationshipRow = typeof characterRelationships.$inferSelect

function toFrontendRelationship(row: RelationshipRow) {
  return {
    ...row,
    sourceId: row.characterFromId,
    targetId: row.characterToId,
    type: row.relationshipName,
    label: row.description || row.relationshipName,
    strength: row.intimacyLevel,
  }
}

export function registerRelationshipRoutes(app: FastifyInstance) {
  const createSchema = z.object({
    sourceId: z.string().min(1),
    targetId: z.string().min(1),
    type: z.string().min(1).max(50),
    label: z.string().optional().default(''),
    strength: z.number().min(0).max(100).optional().default(50),
    description: z.string().optional().default(''),
    startedAt: z.string().nullable().optional(),
  })

  const updateSchema = createSchema.partial()

  // GET /api/projects/:id/relationships
  app.get('/api/projects/:id/relationships', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    const rows = await db.select().from(characterRelationships)
      .where(eq(characterRelationships.projectId, id))
      .orderBy(characterRelationships.createdAt)

    reply.send({ relationships: rows.map(toFrontendRelationship) })
  })

  // POST /api/projects/:id/relationships
  app.post('/api/projects/:id/relationships', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createSchema.parse(request.body)
    const db = getDb()

    if (body.sourceId === body.targetId) {
      reply.status(400).send({ error: '关系两端不能是同一角色' })
      return
    }

    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    const relChars = await db.select({ id: characters.id }).from(characters)
      .where(and(
        eq(characters.projectId, id),
        sql`${characters.deletedAt} IS NULL`,
        or(eq(characters.id, body.sourceId), eq(characters.id, body.targetId)),
      ))

    if (relChars.length !== 2) {
      reply.status(400).send({ error: '关系角色不存在或不属于当前项目' })
      return
    }

    const result = await db.insert(characterRelationships).values({
      projectId: id,
      characterFromId: body.sourceId,
      characterToId: body.targetId,
      relationshipName: body.type,
      intimacyLevel: body.strength,
      description: body.description || body.label,
      startedAt: body.startedAt || null,
      source: 'manual',
    }).returning()

    reply.status(201).send({ relationship: toFrontendRelationship(result[0]) })
  })

  // PUT /api/relationships/:id
  app.put('/api/relationships/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateSchema.parse(request.body)
    const db = getDb()

    const found = await db.select().from(characterRelationships)
      .innerJoin(projects, eq(characterRelationships.projectId, projects.id))
      .where(and(eq(characterRelationships.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) { reply.status(404).send({ error: '关系不存在' }); return }

    const updates: Partial<typeof characterRelationships.$inferInsert> = {}
    if (body.sourceId !== undefined) updates.characterFromId = body.sourceId
    if (body.targetId !== undefined) updates.characterToId = body.targetId
    if (body.type !== undefined) updates.relationshipName = body.type
    if (body.strength !== undefined) updates.intimacyLevel = body.strength
    if (body.description !== undefined) updates.description = body.description
    if (body.label !== undefined && body.description === undefined) updates.description = body.label
    if (body.startedAt !== undefined) updates.startedAt = body.startedAt

    const updated = await db.update(characterRelationships)
      .set(updates)
      .where(eq(characterRelationships.id, id))
      .returning()

    reply.send({ relationship: toFrontendRelationship(updated[0]) })
  })

  // DELETE /api/relationships/:id
  app.delete('/api/relationships/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select().from(characterRelationships)
      .innerJoin(projects, eq(characterRelationships.projectId, projects.id))
      .where(and(eq(characterRelationships.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) { reply.status(404).send({ error: '关系不存在' }); return }

    await db.delete(characterRelationships).where(eq(characterRelationships.id, id))
    reply.status(204).send()
  })
}
