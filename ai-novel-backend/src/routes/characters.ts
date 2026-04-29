import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { characters, characterRelationships, projects } from '../db/schema.ts'
import { eq, and, or, sql } from 'drizzle-orm'

export function registerCharacterRoutes(app: FastifyInstance) {
  const createSchema = z.object({
    name: z.string().min(1).max(100),
    avatarChar: z.string().optional().default('?'),
    role: z.string().optional().default('配角'),
    roleType: z.string().optional().default('supporting'),
    color: z.string().optional().default('#5a7d94'),
    alias: z.string().optional().default(''),
    gender: z.string().optional().default('未设定'),
    age: z.string().optional(),
    personality: z.string().optional().default(''),
    background: z.string().optional().default(''),
    appearance: z.string().optional().default(''),
    isOrganization: z.boolean().optional().default(false),
    organizationType: z.string().optional(),
    organizationPurpose: z.string().optional(),
    traits: z.array(z.string()).optional().default([]),
    aiGenerated: z.boolean().optional().default(false),
  })

  const updateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    avatarChar: z.string().optional(),
    role: z.string().optional(),
    roleType: z.string().optional(),
    color: z.string().optional(),
    alias: z.string().optional(),
    gender: z.string().optional(),
    age: z.string().nullable().optional(),
    personality: z.string().optional(),
    background: z.string().optional(),
    appearance: z.string().optional(),
    isOrganization: z.boolean().optional(),
    organizationType: z.string().nullable().optional(),
    organizationPurpose: z.string().nullable().optional(),
    traits: z.array(z.string()).optional(),
    aiGenerated: z.boolean().optional(),
  })

  // GET /api/projects/:id/characters
  app.get('/api/projects/:id/characters', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    // Verify project ownership
    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    return db.select().from(characters)
      .where(and(
        eq(characters.projectId, id),
        sql`${characters.deletedAt} IS NULL`,
      ))
      .orderBy(characters.createdAt)
  })

  // POST /api/projects/:id/characters
  app.post('/api/projects/:id/characters', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createSchema.parse(request.body)
    const db = getDb()

    // Verify project ownership
    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    const result = await db.insert(characters).values({
      projectId: id,
      name: body.name,
      avatarChar: body.avatarChar,
      role: body.role,
      roleType: body.roleType,
      color: body.color,
      alias: body.alias,
      gender: body.gender,
      age: body.age,
      personality: body.personality,
      background: body.background,
      appearance: body.appearance,
      isOrganization: body.isOrganization,
      organizationType: body.organizationType,
      organizationPurpose: body.organizationPurpose,
      traits: body.traits,
      aiGenerated: body.aiGenerated,
    }).returning()

    reply.status(201).send(result[0])
  })

  // GET /api/characters/:id — MUST verify project ownership
  app.get('/api/characters/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select()
      .from(characters)
      .innerJoin(projects, eq(characters.projectId, projects.id))
      .where(and(eq(characters.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) {
      reply.status(404).send({ error: '角色不存在' })
      return
    }
    reply.send(found[0].characters)
  })

  // PUT /api/characters/:id — MUST verify project ownership
  app.put('/api/characters/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateSchema.parse(request.body)
    const db = getDb()

    const found = await db.select()
      .from(characters)
      .innerJoin(projects, eq(characters.projectId, projects.id))
      .where(and(eq(characters.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) {
      reply.status(404).send({ error: '角色不存在' })
      return
    }

    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.avatarChar !== undefined) updates.avatarChar = body.avatarChar
    if (body.role !== undefined) updates.role = body.role
    if (body.roleType !== undefined) updates.roleType = body.roleType
    if (body.color !== undefined) updates.color = body.color
    if (body.alias !== undefined) updates.alias = body.alias
    if (body.gender !== undefined) updates.gender = body.gender
    if (body.age !== undefined) updates.age = body.age
    if (body.personality !== undefined) updates.personality = body.personality
    if (body.background !== undefined) updates.background = body.background
    if (body.appearance !== undefined) updates.appearance = body.appearance
    if (body.isOrganization !== undefined) updates.isOrganization = body.isOrganization
    if (body.organizationType !== undefined) updates.organizationType = body.organizationType
    if (body.organizationPurpose !== undefined) updates.organizationPurpose = body.organizationPurpose
    if (body.traits !== undefined) updates.traits = body.traits
    if (body.aiGenerated !== undefined) updates.aiGenerated = body.aiGenerated

    const updated = await db.update(characters)
      .set(updates)
      .where(eq(characters.id, id))
      .returning()

    reply.send(updated[0])
  })

  // DELETE /api/characters/:id — soft delete + cleanup relationships
  app.delete('/api/characters/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select()
      .from(characters)
      .innerJoin(projects, eq(characters.projectId, projects.id))
      .where(and(eq(characters.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) {
      reply.status(404).send({ error: '角色不存在' })
      return
    }

    // Remove relationships involving this character
    await db.delete(characterRelationships).where(or(
      eq(characterRelationships.characterFromId, id),
      eq(characterRelationships.characterToId, id),
    ))

    // Soft delete
    await db.update(characters)
      .set({ deletedAt: new Date() })
      .where(eq(characters.id, id))

    reply.status(204).send()
  })
}
