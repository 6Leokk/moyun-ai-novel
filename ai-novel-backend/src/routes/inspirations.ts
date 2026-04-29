import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { inspirations, projects } from '../db/schema.ts'
import { eq, and } from 'drizzle-orm'
import { AIService } from '../services/ai/service.ts'
import { ChapterContextBuilder } from '../services/chapter-context.ts'

export function registerInspirationRoutes(app: FastifyInstance) {
  // GET /api/projects/:id/inspirations
  app.get('/api/projects/:id/inspirations', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const proj = await db.select({ userId: projects.userId })
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    return db.select().from(inspirations)
      .where(eq(inspirations.projectId, id))
      .orderBy(inspirations.createdAt)
  })

  // POST /api/projects/:id/inspirations/generate
  app.post('/api/projects/:id/inspirations/generate', async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      category: z.enum(['idea', 'plot_twist', 'dialogue', 'scene', 'character']).optional().default('idea'),
      count: z.number().min(1).max(5).optional().default(3),
    })
    const body = schema.parse(request.body)
    const db = getDb()

    const proj = await db.select()
      .from(projects).where(eq(projects.id, id)).limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }
    if (proj[0].userId !== request.userId) { reply.status(403).send({ error: '无权访问' }); return }

    // Gather project context
    const ctx = await ChapterContextBuilder.gather(id)
    const contextText = ChapterContextBuilder.formatContext(ctx)

    const categoryLabels: Record<string, string> = {
      idea: '剧情创意',
      plot_twist: '情节反转',
      dialogue: '对话片段',
      scene: '场景描写',
      character: '角色发展',
    }

    const prompt = `你是小说创作灵感助手。请根据以下小说设定，生成 ${body.count} 个${categoryLabels[body.category] || '创意'}类灵感。

${contextText}

请以 JSON 数组格式返回，每个灵感包含：
- "content": 灵感内容（100-300字的具体描述）
- "category": "${body.category}"

只返回 JSON 数组，不要其他内容。`

    const ai = new AIService({ userId: request.userId!, projectId: id })

    try {
      const result = await ai.generateJSON<Array<{ content: string; category: string }>>({
        prompt,
        systemPrompt: '你是专业的小说创作灵感助手，提供具体、有创意的写作灵感。',
        temperature: 0.9,
      })

      const saved: any[] = []
      for (const item of result) {
        const [row] = await db.insert(inspirations).values({
          userId: request.userId!,
          projectId: id,
          content: item.content,
          category: item.category || body.category,
        }).returning()
        saved.push(row)
      }

      reply.status(201).send(saved)
    } catch (e: any) {
      reply.status(500).send({ error: `灵感生成失败: ${e.message}` })
    }
  })

  // DELETE /api/inspirations/:id
  app.delete('/api/inspirations/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select().from(inspirations)
      .where(and(eq(inspirations.id, id), eq(inspirations.userId, request.userId!)))
      .limit(1)

    if (found.length === 0) { reply.status(404).send({ error: '灵感不存在' }); return }

    await db.delete(inspirations).where(eq(inspirations.id, id))
    reply.status(204).send()
  })
}
