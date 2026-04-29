import { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import {
  projects, chapters, characters, outlines, worldSettings, worldEntries,
  foreshadows, careers, characterRelationships, projectDefaultStyles, writingStyles,
  userAiKeys,
} from '../db/schema.ts'
import { eq, and, sql } from 'drizzle-orm'
import { ProjectPathResolver } from '../utils/project-path.ts'

export function registerProjectRoutes(app: FastifyInstance) {
  const createSchema = z.object({
    title: z.string().min(1, '项目名称不能为空').max(200),
    genre: z.string().optional().default(''),
    theme: z.string().optional().default(''),
    description: z.string().optional().default(''),
    targetWords: z.number().optional().default(0),
    coverGradient: z.string().optional(),
    deadline: z.string().optional(),
    narrativePerspective: z.string().optional(),
    chapterCount: z.number().optional().default(0),
    maxWordsPerChapter: z.number().optional(),
    outlineMode: z.enum(['one-to-one', 'one-to-many']).optional().default('one-to-many'),
  })

  const updateSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    genre: z.string().optional(),
    theme: z.string().optional(),
    description: z.string().optional(),
    targetWords: z.number().optional(),
    coverGradient: z.string().optional(),
    deadline: z.string().nullable().optional(),
    narrativePerspective: z.string().optional(),
    maxWordsPerChapter: z.number().nullable().optional(),
    outlineMode: z.enum(['one-to-one', 'one-to-many']).optional(),
    aiKeyId: z.string().uuid().nullable().optional(),
    aiModel: z.string().nullable().optional(),
  })

  // GET /api/projects
  app.get('/api/projects', async (request) => {
    const db = getDb()
    return db.select()
      .from(projects)
      .where(and(
        eq(projects.userId, request.userId!),
        sql`${projects.deletedAt} IS NULL`,
      ))
      .orderBy(sql`${projects.updatedAt} DESC`)
  })

  // POST /api/projects
  app.post('/api/projects', async (request, reply) => {
    const body = createSchema.parse(request.body)
    const db = getDb()

    // Phase 1: Insert PG record with 'creating' status
    const result = await db.insert(projects).values({
      userId: request.userId!,
      title: body.title,
      genre: body.genre,
      theme: body.theme,
      description: body.description,
      targetWords: body.targetWords,
      coverGradient: body.coverGradient,
      deadline: body.deadline ? new Date(body.deadline) : null,
      narrativePerspective: body.narrativePerspective,
      chapterCount: body.chapterCount,
      maxWordsPerChapter: body.maxWordsPerChapter,
      outlineMode: body.outlineMode as 'one-to-one' | 'one-to-many',
      storageBackend: 'sqlite',
      sqliteStatus: 'creating',
    } as any).returning()

    const projectId = result[0].id

    // Phase 2: Initialize SQLite
    try {
      const { projectDBManager } = await import('../db/sqlite/manager')
      projectDBManager.initNew(projectId)

      const sqlitePath = ProjectPathResolver.getDBPath(projectId)
      await db.update(projects).set({
        sqliteStatus: 'ready',
        sqlitePath,
      } as any).where(eq(projects.id, projectId))

      result[0].sqliteStatus = 'ready'
      result[0].sqlitePath = sqlitePath
    } catch (e: any) {
      // SQLite init failed — mark as error, project still usable via PG fallback
      await db.update(projects).set({
        sqliteStatus: 'error',
        storageBackend: 'pg_legacy',
      } as any).where(eq(projects.id, projectId))

      result[0].sqliteStatus = 'error'
      app.log.error(`Failed to init SQLite for project ${projectId}: ${e.message}`)
    }

    reply.status(201).send(result[0])
  })

  // GET /api/projects/:id
  app.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()
    const found = await db.select().from(projects)
      .where(and(
        eq(projects.id, id),
        eq(projects.userId, request.userId!),
        sql`${projects.deletedAt} IS NULL`,
      ))
      .limit(1)
    if (found.length === 0) {
      reply.status(404).send({ error: '项目不存在' })
      return
    }
    reply.send(found[0])
  })

  // PUT /api/projects/:id
  app.put('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateSchema.parse(request.body)
    const db = getDb()

    const found = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.userId!)))
      .limit(1)
    if (found.length === 0) {
      reply.status(404).send({ error: '项目不存在' })
      return
    }

    const updateData: Record<string, unknown> = {}
    if (body.title !== undefined) updateData.title = body.title
    if (body.genre !== undefined) updateData.genre = body.genre
    if (body.theme !== undefined) updateData.theme = body.theme
    if (body.description !== undefined) updateData.description = body.description
    if (body.targetWords !== undefined) updateData.targetWords = body.targetWords
    if (body.coverGradient !== undefined) updateData.coverGradient = body.coverGradient
    if (body.deadline !== undefined) updateData.deadline = body.deadline ? new Date(body.deadline) : null
    if (body.narrativePerspective !== undefined) updateData.narrativePerspective = body.narrativePerspective
    if (body.maxWordsPerChapter !== undefined) updateData.maxWordsPerChapter = body.maxWordsPerChapter
    if (body.outlineMode !== undefined) updateData.outlineMode = body.outlineMode
    if (body.aiKeyId !== undefined) {
      // Verify key belongs to user
      const key = await db.select({ id: userAiKeys.id }).from(userAiKeys)
        .where(and(eq(userAiKeys.id, body.aiKeyId as any), eq(userAiKeys.userId, request.userId!)))
        .limit(1)
      if (key.length === 0) { reply.status(400).send({ error: 'API key 不属于当前用户' }); return }
      updateData.aiKeyId = body.aiKeyId
    }
    if (body.aiModel !== undefined) updateData.aiModel = body.aiModel

    const updated = await db.update(projects)
      .set(updateData)
      .where(eq(projects.id, id))
      .returning()

    reply.send(updated[0])
  })

  // GET /api/projects/:id/chapter-graph — chapter relationship graph data
  app.get('/api/projects/:id/chapter-graph', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const proj = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.userId!)))
      .limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }

    const [chs, ols, fs, chars] = await Promise.all([
      db.select().from(chapters).where(eq(chapters.projectId, id)).orderBy(chapters.chapterNumber),
      db.select().from(outlines).where(eq(outlines.projectId, id)).orderBy(outlines.orderIndex),
      db.select().from(foreshadows).where(eq(foreshadows.projectId, id)),
      db.select().from(characters)
        .where(and(eq(characters.projectId, id), sql`${characters.deletedAt} IS NULL`)),
    ])

    // Build outline tree
    const outlineMap = new Map<string, any>()
    const roots: any[] = []
    for (const o of ols) {
      outlineMap.set(o.id, { ...o, children: [] })
    }
    for (const o of ols) {
      const node = outlineMap.get(o.id)!
      if (o.parentId && outlineMap.has(o.parentId)) {
        outlineMap.get(o.parentId).children.push(node)
      } else {
        roots.push(node)
      }
    }

    // Map chapters to outlines
    const chapterNodes = chs.map(ch => {
      const plantedFs = fs.filter(f => f.plantedChapterId === ch.id)
      const resolvedFs = fs.filter(f => f.resolvedChapterId === ch.id)
      const chapterChars = chars.filter(c =>
        (ch.charactersPresent as string[] | null)?.includes(c.id)
      )
      return {
        id: ch.id,
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        status: ch.status,
        wordCount: ch.wordCount,
        outlineId: ch.outlineId,
        foreshadowsPlanted: plantedFs.length,
        foreshadowsResolved: resolvedFs.length,
        characterCount: chapterChars.length,
      }
    })

    reply.send({
      chapters: chapterNodes,
      outlines: roots,
      foreshadowStats: {
        total: fs.length,
        unresolved: fs.filter(f => f.status !== 'resolved').length,
      },
      characterCount: chars.length,
    })
  })

  // DELETE /api/projects/:id (soft delete)
  app.delete('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const found = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.userId!)))
      .limit(1)
    if (found.length === 0) {
      reply.status(404).send({ error: '项目不存在' })
      return
    }

    await db.update(projects)
      .set({ deletedAt: new Date() })
      .where(eq(projects.id, id))

    reply.status(204).send()
  })

  // GET /api/projects/:id/stats
  app.get('/api/projects/:id/stats', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const project = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.userId!)))
      .limit(1)
    if (project.length === 0) {
      reply.status(404).send({ error: '项目不存在' })
      return
    }

    const chs = await db.select().from(chapters).where(eq(chapters.projectId, id))
    const chars = await db.select().from(characters)
      .where(and(eq(characters.projectId, id), sql`${characters.deletedAt} IS NULL`))
    const nodes = await db.select().from(outlines).where(eq(outlines.projectId, id))

    const totalWords = chs.reduce((s, c) => s + c.wordCount, 0)
    const done = chs.filter(c => c.status === 'done').length
    const writing = chs.filter(c => c.status === 'writing').length
    const draft = chs.filter(c => c.status === 'draft').length
    const arcs = nodes.filter(n => !n.parentId)
    const scenesWithChapter = chs.filter(c => c.outlineId).length

    reply.send({
      totalWords,
      chapterStats: { total: chs.length, done, writing, draft },
      characterCount: chars.length,
      plotArcs: arcs.length,
      completionRate: project[0].targetWords > 0
        ? Math.round((totalWords / project[0].targetWords) * 100) : 0,
    })
  })

  // POST /api/projects/import — Import project from JSON package
  app.post('/api/projects/import', async (request, reply) => {
    const db = getDb()
    const body = request.body as Record<string, any>

    if (!body || !body.project || typeof body.project.title !== 'string') {
      reply.status(400).send({ error: '无效的导入数据：缺少项目信息' })
      return
    }

    const p = body.project as Record<string, any>

    // Create project
    const [newProject] = await db.insert(projects).values({
      userId: request.userId!,
      title: p.title || '导入的项目',
      genre: p.genre || '',
      theme: p.theme || '',
      description: p.description || '',
      targetWords: p.targetWords || 0,
      narrativePerspective: p.narrativePerspective || null,
      maxWordsPerChapter: p.maxWordsPerChapter || null,
      outlineMode: (p.outlineMode as 'one-to-one' | 'one-to-many') || 'one-to-many',
      coverGradient: p.coverGradient || 'linear-gradient(135deg,#0e0e10,#1a1a1c)',
    }).returning()
    const newProjectId = newProject.id

    // ID remapping
    const idMap = new Map<string, string>()
    const newId = () => crypto.randomUUID()

    // World settings
    if (body.worldSettings) {
      const ws = body.worldSettings as Record<string, any>
      await db.insert(worldSettings).values({
        projectId: newProjectId,
        timePeriod: ws.timePeriod || null,
        location: ws.location || null,
        atmosphere: ws.atmosphere || null,
        rules: ws.rules || null,
      })
    }

    // Careers (no cross-references)
    const careersArr = Array.isArray(body.careers) ? body.careers : []
    for (const c of careersArr) {
      const cid = newId()
      idMap.set(c.id, cid)
      await db.insert(careers).values({
        id: cid,
        projectId: newProjectId,
        name: c.name || '',
        type: c.type || 'main',
        description: c.description || null,
        category: c.category || null,
        stages: c.stages || [],
        maxStage: c.maxStage || 10,
        requirements: c.requirements || null,
        specialAbilities: c.specialAbilities || null,
        source: 'import',
      } as any)
    }

    // Characters
    const charsArr = Array.isArray(body.characters) ? body.characters : []
    for (const c of charsArr) {
      const cid = newId()
      idMap.set(c.id, cid)
      await db.insert(characters).values({
        id: cid,
        projectId: newProjectId,
        name: c.name || '',
        avatarChar: c.avatarChar || '?',
        role: c.role || '配角',
        roleType: c.roleType || 'supporting',
        color: c.color || '#5a7d94',
        alias: c.alias || '',
        gender: c.gender || '未设定',
        age: c.age || null,
        personality: c.personality || '',
        background: c.background || '',
        appearance: c.appearance || '',
        isOrganization: c.isOrganization || false,
        organizationType: c.organizationType || null,
        organizationPurpose: c.organizationPurpose || null,
        mainCareerId: c.mainCareerId ? idMap.get(c.mainCareerId) || null : null,
        mainCareerStage: c.mainCareerStage || null,
        traits: c.traits || [],
        source: 'import',
      } as any)
    }

    // Character relationships
    const relsArr = Array.isArray(body.relationships) ? body.relationships : []
    for (const r of relsArr) {
      const fromId = idMap.get(r.characterFromId) || r.characterFromId
      const toId = idMap.get(r.characterToId) || r.characterToId
      await db.insert(characterRelationships).values({
        projectId: newProjectId,
        characterFromId: fromId,
        characterToId: toId,
        relationshipTypeId: r.relationshipTypeId || null,
        relationshipName: r.relationshipName || '',
        intimacyLevel: r.intimacyLevel || 50,
        description: r.description || '',
        startedAt: r.startedAt || null,
        source: 'import',
      } as any)
    }

    // Outlines (parentId needs remapping)
    const outlinesArr = Array.isArray(body.outlines) ? body.outlines : []
    for (const o of outlinesArr) {
      const oid = newId()
      idMap.set(o.id, oid)
      await db.insert(outlines).values({
        id: oid,
        projectId: newProjectId,
        parentId: o.parentId ? (idMap.get(o.parentId) || null) : null,
        title: o.title || '',
        content: o.content || '',
        structure: o.structure || {},
        orderIndex: o.orderIndex || 0,
      })
    }

    // Chapters (outlineId needs remapping)
    const chaptersArr = Array.isArray(body.chapters) ? body.chapters : []
    for (const ch of chaptersArr) {
      const chid = newId()
      idMap.set(ch.id, chid)
      await db.insert(chapters).values({
        id: chid,
        projectId: newProjectId,
        outlineId: ch.outlineId ? (idMap.get(ch.outlineId) || null) : null,
        chapterNumber: ch.chapterNumber || 1,
        title: ch.title || '',
        content: ch.content || '',
        wordCount: ch.wordCount || 0,
        status: (ch.status as 'draft' | 'writing' | 'done' | 'archived') || 'draft',
        charactersPresent: ch.charactersPresent || [],
        expansionPlan: ch.expansionPlan || null,
      })
    }

    // Foreshadows (chapter IDs need remapping)
    const fsArr = Array.isArray(body.foreshadows) ? body.foreshadows : []
    for (const f of fsArr) {
      await db.insert(foreshadows).values({
        projectId: newProjectId,
        title: f.title || '',
        description: f.description || '',
        plantedChapterId: f.plantedChapterId ? (idMap.get(f.plantedChapterId) || null) : null,
        plantedAt: f.plantedAt || null,
        resolvedChapterId: f.resolvedChapterId ? (idMap.get(f.resolvedChapterId) || null) : null,
        resolvedAt: f.resolvedAt || null,
        status: f.status || 'planted',
        color: f.color || '#f0a040',
      } as any)
    }

    // World entries
    const weArr = Array.isArray(body.worldEntries) ? body.worldEntries : []
    for (const we of weArr) {
      await db.insert(worldEntries).values({
        projectId: newProjectId,
        category: we.category || 'location',
        icon: we.icon || '📦',
        name: we.name || '',
        description: we.description || '',
        iconBg: we.iconBg || 'linear-gradient(135deg,#1a1a1c,#2a2a2d)',
        tags: we.tags || [],
      })
    }

    reply.status(201).send({ id: newProjectId, title: newProject.title })
  })

  // GET /api/projects/:id/export — Export project as JSON package
  app.get('/api/projects/:id/export', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const proj = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.userId!)))
      .limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }

    const p = proj[0]

    const [world, wentries, chars, rels, careersList, ols, chs, fs, pds] = await Promise.all([
      db.select().from(worldSettings).where(eq(worldSettings.projectId, id)).limit(1),
      db.select().from(worldEntries).where(eq(worldEntries.projectId, id)),
      db.select().from(characters)
        .where(and(eq(characters.projectId, id), sql`${characters.deletedAt} IS NULL`)),
      db.select().from(characterRelationships).where(eq(characterRelationships.projectId, id)),
      db.select().from(careers).where(eq(careers.projectId, id)),
      db.select().from(outlines).where(eq(outlines.projectId, id)).orderBy(outlines.orderIndex),
      db.select().from(chapters).where(eq(chapters.projectId, id)).orderBy(chapters.chapterNumber),
      db.select().from(foreshadows).where(eq(foreshadows.projectId, id)),
      db.select({ styleId: projectDefaultStyles.styleId })
        .from(projectDefaultStyles).where(eq(projectDefaultStyles.projectId, id)).limit(1),
    ])

    let styleContent = null
    if (pds.length > 0) {
      const ws = await db.select().from(writingStyles)
        .where(eq(writingStyles.id, pds[0].styleId)).limit(1)
      if (ws.length > 0) styleContent = ws[0]
    }

    const pkg = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      project: {
        title: p.title,
        genre: p.genre,
        theme: p.theme,
        description: p.description,
        targetWords: p.targetWords,
        narrativePerspective: p.narrativePerspective,
        maxWordsPerChapter: p.maxWordsPerChapter,
        outlineMode: p.outlineMode,
        coverGradient: p.coverGradient,
      },
      worldSettings: world[0] || null,
      worldEntries: wentries,
      characters: chars,
      relationships: rels,
      careers: careersList,
      outlines: ols,
      chapters: chs,
      foreshadows: fs,
      writingStyle: styleContent ? { name: styleContent.name, content: styleContent.styleContent } : null,
    }

    const json = JSON.stringify(pkg, null, 2)
    reply.header('Content-Type', 'application/json; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(p.title)}.json"`)
    reply.send(json)
  })

  // POST /api/projects/:id/migrate-to-sqlite — Migrate PG project to SQLite
  app.post('/api/projects/:id/migrate-to-sqlite', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const proj = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.userId!)))
      .limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }

    const { migrateProjectToSQLite } = await import('../services/migration-service')
    const result = await migrateProjectToSQLite(id)

    if (result.success) {
      reply.send({ message: '迁移成功', storageBackend: 'sqlite' })
    } else {
      reply.status(500).send({ error: result.error })
    }
  })


  // GET /api/projects/:id/export-db — Download SQLite file directly
  app.get('/api/projects/:id/export-db', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const proj = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.userId!)))
      .limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }

    const p = proj[0]
    if (p.storageBackend !== 'sqlite' || !p.sqlitePath) {
      reply.status(400).send({ error: '仅 SQLite 项目支持此导出方式，请先迁移' }); return
    }

    const fs = await import('fs')
    const path = await import('path')
    const dbPath = ProjectPathResolver.getDBPath(id)
    if (!fs.existsSync(dbPath)) {
      reply.status(404).send({ error: '数据库文件不存在' }); return
    }

    const stream = fs.createReadStream(dbPath)
    reply.header('Content-Type', 'application/octet-stream')
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(p.title)}.db"`)
    reply.send(stream)
  })

  // GET /api/projects/:id/export-zip — Download project as zip (metadata.json + data.db)
  app.get('/api/projects/:id/export-zip', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = getDb()

    const proj = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, request.userId!)))
      .limit(1)
    if (proj.length === 0) { reply.status(404).send({ error: '项目不存在' }); return }

    const p = proj[0]
    const archiver = (await import('archiver')).default
    const archive = archiver('zip', { zlib: { level: 9 } })

    reply.header('Content-Type', 'application/zip')
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(p.title)}-project.zip"`)

    archive.on('error', () => { reply.raw.end() })

    // Add metadata.json
    archive.append(JSON.stringify({
      version: '1.0', exportedAt: new Date().toISOString(),
      project: { title: p.title, genre: p.genre, theme: p.theme, description: p.description, narrativePerspective: p.narrativePerspective, maxWordsPerChapter: p.maxWordsPerChapter, outlineMode: p.outlineMode },
    }, null, 2), { name: 'metadata.json' })

    // Add SQLite file if available
    const fs = await import('fs')
    const path = await import('path')
    const dbPath = ProjectPathResolver.getDBPath(id)
    if (fs.existsSync(dbPath)) {
      archive.file(dbPath, { name: 'data.db' })
    }

    archive.finalize()
    reply.send(archive)
  })
}
