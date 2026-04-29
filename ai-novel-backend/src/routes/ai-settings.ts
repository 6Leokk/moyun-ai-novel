import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { userAiKeys, userAiPreferences } from '../db/schema.ts'
import { encryptApiKey } from '../utils/crypto.ts'
import { eq, and } from 'drizzle-orm'

export function registerAISettingsRoutes(app: FastifyInstance) {
  // ── API Keys ──

  // GET /api/ai/keys
  app.get('/api/ai/keys', async (request) => {
    const db = getDb()
    return db.select({
      id: userAiKeys.id,
      provider: userAiKeys.provider,
      label: userAiKeys.label,
      apiBaseUrl: userAiKeys.apiBaseUrl,
      isDefault: userAiKeys.isDefault,
      createdAt: userAiKeys.createdAt,
    }).from(userAiKeys)
      .where(eq(userAiKeys.userId, request.userId!))
      .orderBy(userAiKeys.createdAt)
  })

  // POST /api/ai/keys
  app.post('/api/ai/keys', async (request, reply) => {
    const schema = z.object({
      provider: z.enum(['openai', 'anthropic', 'gemini']),
      label: z.string().max(100).optional().default(''),
      apiKey: z.string().min(1, 'API key 不能为空'),
      apiBaseUrl: z.string().url().refine(u => u.startsWith('https://'), '只允许 HTTPS URL').optional(),
      isDefault: z.boolean().optional().default(false),
    })

    const body = schema.parse(request.body)
    const db = getDb()

    // If setting as default, unset other defaults for this provider
    if (body.isDefault) {
      await db.update(userAiKeys)
        .set({ isDefault: false })
        .where(and(
          eq(userAiKeys.userId, request.userId!),
          eq(userAiKeys.provider, body.provider),
        ))
    }

    const apiKeyEnc = encryptApiKey(body.apiKey)
    const result = await db.insert(userAiKeys).values({
      userId: request.userId!,
      provider: body.provider,
      label: body.label,
      apiKeyEnc,
      apiBaseUrl: body.apiBaseUrl || null,
      isDefault: body.isDefault,
    }).returning({ id: userAiKeys.id, provider: userAiKeys.provider, label: userAiKeys.label })

    reply.status(201).send(result[0])
  })

  // DELETE /api/ai/keys/:id
  app.delete('/api/ai/keys/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const key = await db.select().from(userAiKeys)
      .where(and(eq(userAiKeys.id, id), eq(userAiKeys.userId, request.userId!)))
      .limit(1)

    if (key.length === 0) {
      reply.status(404).send({ error: 'API key 不存在' })
      return
    }

    await db.delete(userAiKeys).where(eq(userAiKeys.id, id))
    reply.status(204).send()
  })

  // ── Preferences ──

  // GET /api/ai/preferences
  app.get('/api/ai/preferences', async (request, reply) => {
    const db = getDb()
    const prefs = await db.select().from(userAiPreferences)
      .where(eq(userAiPreferences.userId, request.userId!))
      .limit(1)

    reply.send(prefs[0] || {
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o',
      defaultTemp: 0.8,
      defaultMaxTokens: 4096,
    })
  })

  // PUT /api/ai/preferences
  app.put('/api/ai/preferences', async (request, reply) => {
    const schema = z.object({
      defaultProvider: z.enum(['openai', 'anthropic', 'gemini']).optional(),
      defaultModel: z.string().max(100).optional(),
      defaultTemp: z.number().min(0).max(2).optional(),
      defaultMaxTokens: z.number().min(1).max(128000).optional(),
    })

    const body = schema.parse(request.body)
    const db = getDb()

    const existing = await db.select().from(userAiPreferences)
      .where(eq(userAiPreferences.userId, request.userId!))
      .limit(1)

    if (existing.length === 0) {
      const result = await db.insert(userAiPreferences).values({
        userId: request.userId!,
        defaultProvider: body.defaultProvider ?? 'openai',
        defaultModel: body.defaultModel ?? 'gpt-4o',
        defaultTemp: body.defaultTemp ?? 0.8,
        defaultMaxTokens: body.defaultMaxTokens ?? 4096,
      }).returning()
      reply.send(result[0])
    } else {
      const updates: Record<string, unknown> = {}
      if (body.defaultProvider !== undefined) updates.defaultProvider = body.defaultProvider
      if (body.defaultModel !== undefined) updates.defaultModel = body.defaultModel
      if (body.defaultTemp !== undefined) updates.defaultTemp = body.defaultTemp
      if (body.defaultMaxTokens !== undefined) updates.defaultMaxTokens = body.defaultMaxTokens

      const result = await db.update(userAiPreferences)
        .set(updates)
        .where(eq(userAiPreferences.userId, request.userId!))
        .returning()
      reply.send(result[0])
    }
  })
}
