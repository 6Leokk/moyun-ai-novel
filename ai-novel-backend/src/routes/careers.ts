import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { careers, characterCareers, characters, projects } from '../db/schema.ts'
import { eq, and } from 'drizzle-orm'

export function registerCareerRoutes(app: FastifyInstance) {
  const createSchema = z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['main', 'sub']).optional().default('main'),
    description: z.string().optional(),
    category: z.string().optional(),
    stages: z.array(z.object({
      stage: z.number(),
      name: z.string(),
      abilities: z.array(z.string()).optional().default([]),
      requirements: z.string().optional(),
    })).optional().default([]),
    maxStage: z.number().min(1).optional().default(10),
    requirements: z.string().optional(),
    specialAbilities: z.string().optional(),
  })

  const updateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    type: z.enum(['main', 'sub']).optional(),
    description: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    stages: z.array(z.object({
      stage: z.number(),
      name: z.string(),
      abilities: z.array(z.string()).optional().default([]),
      requirements: z.string().optional(),
    })).optional(),
    maxStage: z.number().min(1).optional(),
    requirements: z.string().nullable().optional(),
    specialAbilities: z.string().nullable().optional(),
  })

  // GET /api/projects/:id/careers
  app.get('/api/projects/:id/careers', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()
    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }
    return db.select().from(careers).where(eq(careers.projectId, id)).orderBy(careers.createdAt)
  })

  // POST /api/projects/:id/careers
  app.post('/api/projects/:id/careers', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createSchema.parse(request.body)
    const db = getDb()

    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    const result = await db.insert(careers).values({
      projectId: id,
      name: body.name,
      type: body.type,
      description: body.description || null,
      category: body.category || null,
      stages: body.stages,
      maxStage: body.maxStage,
      requirements: body.requirements || null,
      specialAbilities: body.specialAbilities || null,
      source: 'manual',
    }).returning()

    reply.status(201).send(result[0])
  })

  // PUT /api/careers/:id
  app.put('/api/careers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateSchema.parse(request.body)
    const db = getDb()

    const found = await db.select().from(careers)
      .innerJoin(projects, eq(careers.projectId, projects.id))
      .where(and(eq(careers.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) { reply.status(404).send({ error: '职业不存在' }); return }

    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.type !== undefined) updates.type = body.type
    if (body.description !== undefined) updates.description = body.description
    if (body.category !== undefined) updates.category = body.category
    if (body.stages !== undefined) updates.stages = body.stages
    if (body.maxStage !== undefined) updates.maxStage = body.maxStage
    if (body.requirements !== undefined) updates.requirements = body.requirements
    if (body.specialAbilities !== undefined) updates.specialAbilities = body.specialAbilities

    const updated = await db.update(careers).set(updates).where(eq(careers.id, id)).returning()
    reply.send(updated[0])
  })

  // DELETE /api/careers/:id
  app.delete('/api/careers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select().from(careers)
      .innerJoin(projects, eq(careers.projectId, projects.id))
      .where(and(eq(careers.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) { reply.status(404).send({ error: '职业不存在' }); return }

    // Remove character assignments
    await db.delete(characterCareers).where(eq(characterCareers.careerId, id))
    await db.delete(careers).where(eq(careers.id, id))
    reply.status(204).send()
  })

  // GET /api/characters/:id/careers
  app.get('/api/characters/:id/careers', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const char = await db.select().from(characters)
      .innerJoin(projects, eq(characters.projectId, projects.id))
      .where(and(eq(characters.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (char.length === 0) { reply.status(404).send({ error: '角色不存在' }); return }

    return db.select().from(characterCareers)
      .innerJoin(careers, eq(characterCareers.careerId, careers.id))
      .where(eq(characterCareers.characterId, id))
  })

  // POST /api/characters/:id/careers — assign career
  app.post('/api/characters/:id/careers', async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      careerId: z.string().uuid(),
      careerType: z.enum(['main', 'sub']).optional().default('main'),
      currentStage: z.number().min(1).optional().default(1),
    })
    const body = schema.parse(request.body)
    const db = getDb()

    const char = await db.select().from(characters)
      .innerJoin(projects, eq(characters.projectId, projects.id))
      .where(and(eq(characters.id, id), eq(projects.userId, request.userId!)))
      .limit(1)
    if (char.length === 0) { reply.status(404).send({ error: '角色不存在' }); return }

    // Verify career belongs to same project
    const career = await db.select().from(careers)
      .where(and(eq(careers.id, body.careerId), eq(careers.projectId, char[0].characters.projectId)))
      .limit(1)
    if (career.length === 0) { reply.status(400).send({ error: '职业不属于此项目' }); return }

    // Update character's mainCareerId if this is a main career
    if (body.careerType === 'main') {
      await db.update(characters).set({
        mainCareerId: body.careerId,
        mainCareerStage: body.currentStage,
      }).where(eq(characters.id, id))
    }

    const result = await db.insert(characterCareers).values({
      characterId: id,
      careerId: body.careerId,
      careerType: body.careerType,
      currentStage: body.currentStage,
      stageProgress: 0,
    }).returning()

    reply.status(201).send(result[0])
  })

  // PUT /api/character-careers/:id — update progress
  app.put('/api/character-careers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      currentStage: z.number().min(1).optional(),
      stageProgress: z.number().min(0).max(100).optional(),
    })
    const body = schema.parse(request.body)
    const db = getDb()

    const cc = await db.select().from(characterCareers)
      .innerJoin(characters, eq(characterCareers.characterId, characters.id))
      .innerJoin(projects, eq(characters.projectId, projects.id))
      .where(and(eq(characterCareers.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (cc.length === 0) { reply.status(404).send({ error: '职业分配不存在' }); return }

    const updates: Record<string, unknown> = {}
    if (body.currentStage !== undefined) updates.currentStage = body.currentStage
    if (body.stageProgress !== undefined) updates.stageProgress = body.stageProgress

    const updated = await db.update(characterCareers).set(updates).where(eq(characterCareers.id, id)).returning()

    // Sync character mainCareerStage if this is the main career
    if (body.currentStage !== undefined && cc[0].character_careers.careerType === 'main') {
      await db.update(characters).set({
        mainCareerStage: body.currentStage,
      }).where(eq(characters.id, cc[0].character_careers.characterId))
    }

    reply.send(updated[0])
  })

  // DELETE /api/character-careers/:id
  app.delete('/api/character-careers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const cc = await db.select().from(characterCareers)
      .innerJoin(characters, eq(characterCareers.characterId, characters.id))
      .innerJoin(projects, eq(characters.projectId, projects.id))
      .where(and(eq(characterCareers.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (cc.length === 0) { reply.status(404).send({ error: '职业分配不存在' }); return }

    // Clear mainCareerId if this was the main career
    const charId = cc[0].character_careers.characterId
    const careerId = cc[0].character_careers.careerId
    const char = await db.select().from(characters).where(eq(characters.id, charId)).limit(1)
    if (char.length > 0 && char[0].mainCareerId === careerId) {
      await db.update(characters).set({ mainCareerId: null, mainCareerStage: null }).where(eq(characters.id, charId))
    }

    await db.delete(characterCareers).where(eq(characterCareers.id, id))
    reply.status(204).send()
  })
}
