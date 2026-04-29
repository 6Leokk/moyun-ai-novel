import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { projects, worldSettings, worldEntries, careers, characters, outlines, chapters, characterCareers, characterRelationships, organizations, organizationMembers } from '../db/schema.ts'
import { eq, sql } from 'drizzle-orm'
import { AIService } from '../services/ai/service.ts'
import { PromptService } from '../services/prompt-service.ts'
import { setupSSE, sendSSE, sendSSEHeartbeat, sendSSEDone, sendSSEError } from '../utils/sse.ts'

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```$/gm, '')
  return cleaned.trim()
}

export function registerWizardRoutes(app: FastifyInstance) {
  // ── POST /api/wizard/world-building ──
  app.post('/api/wizard/world-building', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      projectId: z.string().uuid(),
      provider: z.enum(['openai', 'anthropic', 'gemini']).optional(),
      model: z.string().optional(),
    })

    const body = schema.parse(request.body)
    const db = getDb()
    const project = await db.select().from(projects)
      .where(eq(projects.id, body.projectId)).limit(1)

    if (project.length === 0 || project[0].userId !== request.userId) {
      reply.status(404).send({ error: '项目不存在' }); return
    }

    setupSSE(reply)
    let seqId = 0
    const ai = new AIService({ userId: request.userId!, projectId: body.projectId })

    try {
      sendSSE(reply, 'progress', { step: 'world_building', currentStep: 1, totalSteps: 4, percent: 5, message: '准备 prompt...' }, seqId++)

      const template = await PromptService.getTemplate('WORLD_BUILDING', request.userId!)
      const prompt = PromptService.formatPrompt(template, {
        title: project[0].title,
        genre: project[0].genre || '通用',
        theme: project[0].theme || project[0].title,
        description: project[0].description || '暂无简介',
      })

      sendSSE(reply, 'progress', { step: 'world_building', currentStep: 1, totalSteps: 4, percent: 10, message: 'AI 生成中...' }, seqId++)

      let fullText = ''
      for await (const chunk of ai.generateStream({ prompt })) {
        fullText += chunk
        sendSSE(reply, 'chunk', { text: chunk }, seqId++)
        if (seqId % 20 === 0) sendSSEHeartbeat(reply)
      }

      const cleaned = cleanJsonResponse(fullText)
      const worldData = JSON.parse(cleaned)

      // Save world settings
      await db.insert(worldSettings).values({
        projectId: body.projectId,
        timePeriod: worldData.time_period || '',
        location: worldData.location || '',
        atmosphere: worldData.atmosphere || '',
        rules: worldData.rules || '',
      }).onConflictDoUpdate({
        target: worldSettings.projectId,
        set: {
          timePeriod: worldData.time_period || '',
          location: worldData.location || '',
          atmosphere: worldData.atmosphere || '',
          rules: worldData.rules || '',
        },
      })

      await db.update(projects).set({ wizardStep: 1 }).where(eq(projects.id, body.projectId))

      sendSSE(reply, 'result', {
        projectId: body.projectId,
        timePeriod: worldData.time_period,
        location: worldData.location,
        atmosphere: worldData.atmosphere,
        rules: worldData.rules,
      }, seqId++)
      sendSSEDone(reply)
    } catch (e: any) {
      sendSSEError(reply, `世界构建失败: ${e.message}`)
      reply.raw.end()
    }
  })

  // ── POST /api/wizard/career-system ──
  app.post('/api/wizard/career-system', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      projectId: z.string().uuid(),
      provider: z.enum(['openai', 'anthropic', 'gemini']).optional(),
      model: z.string().optional(),
    })

    const body = schema.parse(request.body)
    const db = getDb()
    const project = await db.select().from(projects)
      .where(eq(projects.id, body.projectId)).limit(1)

    if (project.length === 0 || project[0].userId !== request.userId) {
      reply.status(404).send({ error: '项目不存在' }); return
    }

    setupSSE(reply)
    let seqId = 0
    const ai = new AIService({ userId: request.userId!, projectId: body.projectId })

    try {
      // Get world settings for context
      const world = await db.select().from(worldSettings)
        .where(eq(worldSettings.projectId, body.projectId)).limit(1)

      const worldCtx = world.length > 0 ? world[0] : { timePeriod: '未设定', location: '未设定', atmosphere: '未设定', rules: '未设定' }

      sendSSE(reply, 'progress', { step: 'career_system', currentStep: 2, totalSteps: 4, percent: 5, message: '准备 prompt...' }, seqId++)

      const template = await PromptService.getTemplate('CAREER_SYSTEM_GENERATION', request.userId!)
      const prompt = PromptService.formatPrompt(template, {
        title: project[0].title,
        genre: project[0].genre || '通用',
        theme: project[0].theme || '',
        description: project[0].description || '',
        time_period: worldCtx.timePeriod || '',
        location: worldCtx.location || '',
        atmosphere: worldCtx.atmosphere || '',
        rules: worldCtx.rules || '',
      })

      sendSSE(reply, 'progress', { step: 'career_system', currentStep: 2, totalSteps: 4, percent: 10, message: 'AI 生成中...' }, seqId++)

      let fullText = ''
      for await (const chunk of ai.generateStream({ prompt })) {
        fullText += chunk
        sendSSE(reply, 'chunk', { text: chunk }, seqId++)
        if (seqId % 20 === 0) sendSSEHeartbeat(reply)
      }

      const cleaned = cleanJsonResponse(fullText)
      const careerData = JSON.parse(cleaned)

      // Save careers
      const all = [...(careerData.main_careers || []), ...(careerData.sub_careers || [])]
      for (const c of all) {
        await db.insert(careers).values({
          projectId: body.projectId,
          name: c.name || '未命名',
          type: careerData.main_careers?.includes(c) ? 'main' : 'sub',
          description: c.description || '',
          category: c.category || null,
          stages: c.stages || [],
          maxStage: c.max_stage || 10,
          source: 'ai',
        })
      }

      await db.update(projects).set({ wizardStep: 2 }).where(eq(projects.id, body.projectId))

      sendSSE(reply, 'result', {
        projectId: body.projectId,
        mainCareersCount: (careerData.main_careers || []).length,
        subCareersCount: (careerData.sub_careers || []).length,
      }, seqId++)
      sendSSEDone(reply)
    } catch (e: any) {
      sendSSEError(reply, `职业体系生成失败: ${e.message}`)
      reply.raw.end()
    }
  })

  // ── POST /api/wizard/characters ──
  app.post('/api/wizard/characters', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      projectId: z.string().uuid(),
      count: z.number().min(1).max(20).default(5),
      provider: z.enum(['openai', 'anthropic', 'gemini']).optional(),
      model: z.string().optional(),
    })

    const body = schema.parse(request.body)
    const db = getDb()
    const project = await db.select().from(projects)
      .where(eq(projects.id, body.projectId)).limit(1)

    if (project.length === 0 || project[0].userId !== request.userId) {
      reply.status(404).send({ error: '项目不存在' }); return
    }

    setupSSE(reply)
    let seqId = 0
    const ai = new AIService({ userId: request.userId!, projectId: body.projectId })

    try {
      const world = await db.select().from(worldSettings)
        .where(eq(worldSettings.projectId, body.projectId)).limit(1)
      const worldCtx = world.length > 0 ? world[0] : {}

      // Get careers for context
      const careersList = await db.select().from(careers)
        .where(eq(careers.projectId, body.projectId))
      const careersCtx = careersList.length > 0
        ? careersList.map(c => `- ${c.name}(${c.type}): ${c.description || ''}`).join('\n')
        : '未设定'

      sendSSE(reply, 'progress', { step: 'characters', currentStep: 3, totalSteps: 4, percent: 5, message: '准备 prompt...' }, seqId++)

      const template = await PromptService.getTemplate('CHARACTERS_BATCH_GENERATION', request.userId!)
      const prompt = PromptService.formatPrompt(template, {
        title: project[0].title,
        genre: project[0].genre || '通用',
        theme: project[0].theme || '',
        time_period: worldCtx.timePeriod || '未设定',
        location: worldCtx.location || '未设定',
        atmosphere: worldCtx.atmosphere || '未设定',
        rules: worldCtx.rules || '未设定',
        careers_context: careersCtx,
        count: body.count,
      })

      sendSSE(reply, 'progress', { step: 'characters', currentStep: 3, totalSteps: 4, percent: 10, message: 'AI 生成中...' }, seqId++)

      let fullText = ''
      for await (const chunk of ai.generateStream({ prompt })) {
        fullText += chunk
        sendSSE(reply, 'chunk', { text: chunk }, seqId++)
        if (seqId % 20 === 0) sendSSEHeartbeat(reply)
      }

      const cleaned = cleanJsonResponse(fullText)
      const charsData = JSON.parse(cleaned)
      const charsArray = Array.isArray(charsData) ? charsData : [charsData]
      const createdCharIds: string[] = []

      for (const cd of charsArray) {
        const result = await db.insert(characters).values({
          projectId: body.projectId,
          name: cd.name || '未命名',
          gender: cd.gender || '未设定',
          age: String(cd.age || ''),
          roleType: cd.role_type || 'supporting',
          personality: cd.personality || '',
          background: cd.background || '',
          appearance: cd.appearance || '',
          traits: cd.traits || [],
          isOrganization: cd.is_organization || false,
          organizationType: cd.organization_type || null,
          organizationPurpose: cd.organization_purpose || null,
          aiGenerated: true,
        }).returning()
        createdCharIds.push(result[0].id)
      }

      await db.update(projects).set({ wizardStep: 3, characterCount: createdCharIds.length })
        .where(eq(projects.id, body.projectId))

      sendSSE(reply, 'result', {
        projectId: body.projectId,
        count: createdCharIds.length,
      }, seqId++)
      sendSSEDone(reply)
    } catch (e: any) {
      sendSSEError(reply, `角色生成失败: ${e.message}`)
      reply.raw.end()
    }
  })

  // ── POST /api/wizard/outline ──
  app.post('/api/wizard/outline', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      projectId: z.string().uuid(),
      provider: z.enum(['openai', 'anthropic', 'gemini']).optional(),
      model: z.string().optional(),
    })

    const body = schema.parse(request.body)
    const db = getDb()
    const project = await db.select().from(projects)
      .where(eq(projects.id, body.projectId)).limit(1)

    if (project.length === 0 || project[0].userId !== request.userId) {
      reply.status(404).send({ error: '项目不存在' }); return
    }

    setupSSE(reply)
    let seqId = 0
    const ai = new AIService({ userId: request.userId!, projectId: body.projectId })

    try {
      const chars = await db.select().from(characters)
        .where(eq(characters.projectId, body.projectId))
      const charsInfo = chars.map(c => `- ${c.name}: ${c.personality?.slice(0, 50) || '暂无描述'}`).join('\n')

      const chapterCount = project[0].chapterCount || 5

      sendSSE(reply, 'progress', { step: 'outline', currentStep: 4, totalSteps: 4, percent: 5, message: '准备 prompt...' }, seqId++)

      const template = await PromptService.getTemplate('OUTLINE_CREATE', request.userId!)
      const prompt = PromptService.formatPrompt(template, {
        title: project[0].title,
        genre: project[0].genre || '通用',
        theme: project[0].theme || '',
        chapter_count: chapterCount,
        narrative_perspective: project[0].narrativePerspective || '第三人称',
        target_words: Math.round((project[0].targetWords || 50000) / chapterCount),
        characters_info: charsInfo || '暂无角色信息',
      })

      sendSSE(reply, 'progress', { step: 'outline', currentStep: 4, totalSteps: 4, percent: 10, message: 'AI 生成中...' }, seqId++)

      let fullText = ''
      for await (const chunk of ai.generateStream({ prompt })) {
        fullText += chunk
        sendSSE(reply, 'chunk', { text: chunk }, seqId++)
        if (seqId % 20 === 0) sendSSEHeartbeat(reply)
      }

      const cleaned = cleanJsonResponse(fullText)
      const outlineData = JSON.parse(cleaned)
      const outlineArray = Array.isArray(outlineData) ? outlineData : [outlineData]
      const createdOutlines: any[] = []

      for (let i = 0; i < outlineArray.length; i++) {
        const item = outlineArray[i]
        const result = await db.insert(outlines).values({
          projectId: body.projectId,
          title: item.title || `第${i + 1}章`,
          content: item.summary || '',
          structure: item,
          orderIndex: i + 1,
        }).returning()
        createdOutlines.push(result[0])

        // If one-to-one mode, auto-create chapters
        if (project[0].outlineMode === 'one-to-one') {
          await db.insert(chapters).values({
            projectId: body.projectId,
            outlineId: result[0].id,
            chapterNumber: i + 1,
            title: item.title || `第${i + 1}章`,
            content: '',
            status: 'draft',
          })
        }
      }

      await db.update(projects).set({
        wizardStep: 4,
        wizardStatus: 'completed',
        status: 'writing',
      }).where(eq(projects.id, body.projectId))

      sendSSE(reply, 'result', {
        projectId: body.projectId,
        outlineCount: createdOutlines.length,
        chapterCount: project[0].outlineMode === 'one-to-one' ? createdOutlines.length : 0,
        outlineMode: project[0].outlineMode,
        outlines: createdOutlines.map(o => ({
          id: o.id,
          orderIndex: o.orderIndex,
          title: o.title,
          content: o.content?.slice(0, 100) + '...',
        })),
      }, seqId++)
      sendSSEDone(reply)
    } catch (e: any) {
      sendSSEError(reply, `大纲生成失败: ${e.message}`)
      reply.raw.end()
    }
  })
}
