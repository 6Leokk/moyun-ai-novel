import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import crypto from 'crypto'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { chapters, projects, agentRuns } from '../db/schema.ts'
import { eq, and, sql } from 'drizzle-orm'
import { AIService } from '../services/ai/service.ts'
import { PromptService } from '../services/prompt-service.ts'
import { ChapterContextBuilder, ChapterContext } from '../services/chapter-context.ts'
import { setupSSE, sendSSE, sendSSEHeartbeat, sendSSEDone, sendSSEError } from '../utils/sse.ts'
import { AgentOrchestrator } from '../services/agent-orchestrator.ts'

export function registerChapterAIRoutes(app: FastifyInstance) {
  // ── POST /api/chapters/:id/generate ──
  app.post('/api/chapters/:id/generate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const ch = await db.select().from(chapters)
      .innerJoin(projects, eq(chapters.projectId, projects.id))
      .where(and(eq(chapters.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (ch.length === 0) { reply.status(404).send({ error: '章节不存在' }); return }

    const chapter = ch[0].chapters
    const ctx = await ChapterContextBuilder.gather(chapter.projectId, id)
    const contextText = ChapterContextBuilder.formatContext(ctx)

    setupSSE(reply)
    let seqId = 0
    const ai = new AIService({ userId: request.userId!, projectId: chapter.projectId })

    try {
      const template = await PromptService.getTemplate('CHAPTER_GENERATE', request.userId!)
      const prompt = PromptService.formatPrompt(template, {
        context: contextText,
        target_words: ctx.targetWords,
      })

      let fullText = ''
      for await (const chunk of ai.generateStream({ prompt, systemPrompt: ctx.style || undefined }, 'chapter_generate')) {
        fullText += chunk
        sendSSE(reply, 'chunk', { text: chunk }, seqId++)
        if (seqId % 20 === 0) sendSSEHeartbeat(reply)
      }

      const wordCount = fullText.replace(/\s/g, '').length
      await db.update(chapters).set({
        content: fullText,
        wordCount,
        status: 'done',
      }).where(eq(chapters.id, id))

      // Update project current words
      await db.update(projects)
        .set({ currentWords: sql`${projects.currentWords} + ${wordCount}` } as any)
        .where(eq(projects.id, chapter.projectId))

      sendSSE(reply, 'result', { chapterId: id, wordCount }, seqId++)
      sendSSEDone(reply)
    } catch (e: any) {
      sendSSEError(reply, `章节生成失败: ${e.message}`)
      reply.raw.end()
    }
  })

  // ── POST /api/chapters/:id/continue ──
  app.post('/api/chapters/:id/continue', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const ch = await db.select().from(chapters)
      .innerJoin(projects, eq(chapters.projectId, projects.id))
      .where(and(eq(chapters.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (ch.length === 0) { reply.status(404).send({ error: '章节不存在' }); return }

    const chapter = ch[0].chapters
    const ctx = await ChapterContextBuilder.gather(chapter.projectId, id)
    const contextText = ChapterContextBuilder.formatContext(ctx)

    setupSSE(reply)
    let seqId = 0
    const ai = new AIService({ userId: request.userId!, projectId: chapter.projectId })

    try {
      const template = await PromptService.getTemplate('CHAPTER_CONTINUE', request.userId!)
      const prompt = PromptService.formatPrompt(template, {
        context: contextText,
        existing_content: chapter.content?.slice(-300) || '（新章节，无已有内容）',
      })

      let fullText = chapter.content || ''
      for await (const chunk of ai.generateStream({ prompt, systemPrompt: ctx.style || undefined }, 'chapter_continue')) {
        fullText += chunk
        sendSSE(reply, 'chunk', { text: chunk }, seqId++)
        if (seqId % 20 === 0) sendSSEHeartbeat(reply)
      }

      const wordCount = fullText.replace(/\s/g, '').length
      const addedWords = wordCount - (chapter.wordCount || 0)
      await db.update(chapters).set({
        content: fullText,
        wordCount,
        status: 'done',
      }).where(eq(chapters.id, id))

      await db.update(projects)
        .set({ currentWords: sql`${projects.currentWords} + ${addedWords}` } as any)
        .where(eq(projects.id, chapter.projectId))

      sendSSE(reply, 'result', { chapterId: id, wordCount }, seqId++)
      sendSSEDone(reply)
    } catch (e: any) {
      sendSSEError(reply, `续写失败: ${e.message}`)
      reply.raw.end()
    }
  })

  // ── POST /api/chapters/:id/polish ──
  app.post('/api/chapters/:id/polish', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      instruction: z.string().optional().default('润色优化文笔，保持内容不变'),
    })

    const body = schema.parse(request.body)
    const db = getDb()

    const ch = await db.select().from(chapters)
      .innerJoin(projects, eq(chapters.projectId, projects.id))
      .where(and(eq(chapters.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (ch.length === 0) { reply.status(404).send({ error: '章节不存在' }); return }

    const chapter = ch[0].chapters
    const ctx = await ChapterContextBuilder.gather(chapter.projectId, id)

    setupSSE(reply)
    let seqId = 0
    const ai = new AIService({ userId: request.userId!, projectId: chapter.projectId })

    try {
      const systemPrompt = `你是专业的小说编辑。请${body.instruction}。严格保持原文的内容、情节和结构，优化文笔和表达。字数浮动控制在±10%。`
      const prompt = `原文内容：\n\n${chapter.content}\n\n请返回润色后的完整内容，不要添加章节标题或其他说明。`

      let fullText = ''
      for await (const chunk of ai.generateStream({ prompt, systemPrompt }, 'chapter_polish')) {
        fullText += chunk
        sendSSE(reply, 'chunk', { text: chunk }, seqId++)
        if (seqId % 20 === 0) sendSSEHeartbeat(reply)
      }

      const wordCount = fullText.replace(/\s/g, '').length
      await db.update(chapters).set({
        content: fullText,
        wordCount,
      }).where(eq(chapters.id, id))

      sendSSE(reply, 'result', { chapterId: id, wordCount }, seqId++)
      sendSSEDone(reply)
    } catch (e: any) {
      sendSSEError(reply, `润色失败: ${e.message}`)
      reply.raw.end()
    }
  })

  // ── POST /api/chapters/:id/regenerate ──
  app.post('/api/chapters/:id/regenerate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      feedback: z.string().min(1, '请描述需要改进的方面'),
    })

    const body = schema.parse(request.body)
    const db = getDb()

    const ch = await db.select().from(chapters)
      .innerJoin(projects, eq(chapters.projectId, projects.id))
      .where(and(eq(chapters.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (ch.length === 0) { reply.status(404).send({ error: '章节不存在' }); return }

    const chapter = ch[0].chapters
    const ctx = await ChapterContextBuilder.gather(chapter.projectId, id)
    const contextText = ChapterContextBuilder.formatContext(ctx)

    setupSSE(reply)
    let seqId = 0
    const ai = new AIService({ userId: request.userId!, projectId: chapter.projectId })

    try {
      const systemPrompt = ctx.style || undefined
      const prompt = `你需要根据反馈重新写本章内容。\n\n${contextText}\n\n【上一版内容】${chapter.content?.slice(0, 500)}...\n\n【修改反馈】${body.feedback}\n\n请写完整章内容，不要包含章节标题。`

      let fullText = ''
      for await (const chunk of ai.generateStream({ prompt, systemPrompt }, 'chapter_regenerate')) {
        fullText += chunk
        sendSSE(reply, 'chunk', { text: chunk }, seqId++)
        if (seqId % 20 === 0) sendSSEHeartbeat(reply)
      }

      const wordCount = fullText.replace(/\s/g, '').length
      const diff = wordCount - (chapter.wordCount || 0)
      await db.update(chapters).set({
        content: fullText,
        wordCount,
        status: 'done',
      }).where(eq(chapters.id, id))

      await db.update(projects)
        .set({ currentWords: sql`${projects.currentWords} + ${diff}` } as any)
        .where(eq(projects.id, chapter.projectId))

      sendSSE(reply, 'result', { chapterId: id, wordCount }, seqId++)
      sendSSEDone(reply)
    } catch (e: any) {
      sendSSEError(reply, `重写失败: ${e.message}`)
      reply.raw.end()
    }
  })

  // ── POST /api/chapters/:id/generate-agent ──
  app.post('/api/chapters/:id/generate-agent', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      mode: z.enum(['generate', 'continue']).optional().default('generate'),
      instruction: z.string().optional(),
      styleId: z.string().uuid().optional(),
      targetWords: z.number().min(100).optional(),
      idempotencyKey: z.string().uuid(),
    })
    const body = schema.parse(request.body)
    const db = getDb()

    const ch = await db.select().from(chapters)
      .innerJoin(projects, eq(chapters.projectId, projects.id))
      .where(and(eq(chapters.id, id), eq(projects.userId, request.userId!)))
      .limit(1)

    if (ch.length === 0) { reply.status(404).send({ error: '章节不存在' }); return }
    const chapter = ch[0].chapters

    // Idempotency check
    const existing = await db.select().from(agentRuns)
      .where(eq(agentRuns.idempotencyKey, body.idempotencyKey as any))
      .limit(1)

    if (existing.length > 0) {
      const run = existing[0]
      if (run.status === 'running' || run.status === 'queued' || run.status === 'cancelling') {
        reply.send({ runId: run.id, status: run.status, message: '已有运行中的 run' }); return
      }
      if (run.status === 'completed') {
        reply.send({ runId: run.id, status: run.status, result: run.resultData }); return
      }
      if (run.status === 'failed' || run.status === 'cancelled') {
        reply.status(409).send({ error: '请使用新的 idempotencyKey 重试' }); return
      }
    }

    // Create agent run
    const runId = crypto.randomUUID()
    await db.insert(agentRuns).values({
      id: runId,
      userId: request.userId!,
      projectId: chapter.projectId,
      chapterId: id,
      idempotencyKey: body.idempotencyKey,
      mode: body.mode,
      status: 'running',
      phase: 'planning',
      startedAt: new Date(),
    } as any)

    // Setup SSE
    setupSSE(reply)
    const sseSink = {
      emit(event: string, data: Record<string, unknown>) {
        sendSSE(reply, event, data)
      },
    }

    const ai = new AIService({ userId: request.userId!, projectId: chapter.projectId })

    const orchestrator = new AgentOrchestrator({
      aiService: ai,
      ctx: { projectId: chapter.projectId, chapterId: id, userId: request.userId! },
      runId,
      sse: sseSink,
    })

    // Heartbeat
    const heartbeat = setInterval(() => { sendSSEHeartbeat(reply) }, 15000)

    try {
      const result = await orchestrator.execute(body.mode)

      // Sync word count to PG
      await db.update(projects)
        .set({ currentWords: sql`${projects.currentWords} + ${result.wordCount}` } as any)
        .where(eq(projects.id, chapter.projectId))

      sendSSEDone(reply)
    } catch (e: any) {
      await db.update(agentRuns).set({
        status: 'failed',
        errorMessage: e.message,
        finishedAt: new Date(),
      } as any).where(eq(agentRuns.id, runId))

      sendSSEError(reply, `Agent 生成失败: ${e.message}`)
      reply.raw.end()
    } finally {
      clearInterval(heartbeat)
    }
  })
}
