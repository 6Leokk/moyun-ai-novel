import type { Database as DatabaseType } from 'better-sqlite3'
import { projectDBManager } from '../db/sqlite/manager'
import { MemoryService } from './memory-service'

// ── Tool Interface ──

export interface AgentToolContext {
  projectId: string
  chapterId: string
  userId: string
}

export interface AgentTool<TArgs = any, TResult = any> {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (args: TArgs, ctx: AgentToolContext) => Promise<TResult>
  summarizeForAI: (result: TResult) => unknown
  summarizeForUI: (result: TResult) => string
}

// ── Tool implementations ──

function getDB(projectId: string): DatabaseType {
  return projectDBManager.open(projectId)
}

// ── Read Tools ──

export const getCharacterTool: AgentTool<{ name?: string; id?: string }, any> = {
  name: 'getCharacter',
  description: '查询角色完整档案：性格、外貌、背景、能力、职业阶段、当前状态、关系',
  inputSchema: { type: 'object', properties: { name: { type: 'string' }, id: { type: 'string' } } },
  async execute(args, ctx) {
    const db = getDB(ctx.projectId)
    if (args.id) return db.prepare('SELECT * FROM characters WHERE id = ? AND deleted_at IS NULL').get(args.id)
    if (args.name) return db.prepare('SELECT * FROM characters WHERE name = ? AND deleted_at IS NULL').get(args.name)
    return db.prepare('SELECT * FROM characters WHERE deleted_at IS NULL').all()
  },
  summarizeForAI(r) {
    if (!r) return null
    if (Array.isArray(r)) return r.map(c => ({ name: c.name, roleType: c.role_type, personality: c.personality?.slice(0, 200) }))
    return { name: r.name, roleType: r.role_type, personality: r.personality, background: r.background, appearance: r.appearance, careerStage: r.main_career_stage, traits: r.traits, gender: r.gender, age: r.age }
  },
  summarizeForUI(r) { return r?.name ? `查询角色 ${r.name}` : '列出所有角色' },
}

export const searchMemoryTool: AgentTool<{ query: string; limit?: number }, any[]> = {
  name: 'searchMemory',
  description: '搜索历史记忆和剧情事件（语义搜索），用于验证跨章节一致性',
  inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
  async execute(args, ctx) {
    // Use memory service for semantic search
    // For now, returns keyword-based results
    const db = getDB(ctx.projectId)
    const terms = args.query.split(/\s+/).filter(t => t.length > 0)
    if (terms.length === 0) return []
    const conditions = terms.map(() => `content LIKE ?`).join(' OR ')
    const params = terms.map(t => `%${t}%`)
    return db.prepare(`SELECT *, 0.5 as distance FROM memories WHERE status = 'active' AND (${conditions}) ORDER BY (importance * weight) DESC LIMIT ?`).all(...params, args.limit || 10)
  },
  summarizeForAI(r) { return r.map((m: any) => ({ title: m.title, content: m.content, category: m.category, sourceType: m.source_type, relevance: m.distance })) },
  summarizeForUI(r) { return `搜索到 ${r.length} 条相关记忆` },
}

export const getForeshadowsTool: AgentTool<{ status?: string }, any[]> = {
  name: 'getForeshadows',
  description: '查询伏笔清单，可按状态过滤',
  inputSchema: { type: 'object', properties: { status: { type: 'string' } } },
  async execute(args, ctx) {
    const db = getDB(ctx.projectId)
    if (args.status) return db.prepare('SELECT * FROM foreshadows WHERE status = ?').all(args.status)
    return db.prepare('SELECT * FROM foreshadows ORDER BY status').all()
  },
  summarizeForAI(r) { return r.map((f: any) => ({ title: f.title, description: f.description, status: f.status, plantedChapter: f.planted_chapter_id })) },
  summarizeForUI(r) { return `${r.length} 个伏笔` },
}

export const getOutlineTool: AgentTool<{ chapterId?: string }, any> = {
  name: 'getChapterOutline',
  description: '查询章节大纲和扩展计划',
  inputSchema: { type: 'object', properties: { chapterId: { type: 'string' } } },
  async execute(args, ctx) {
    const db = getDB(ctx.projectId)
    const chId = args.chapterId || ctx.chapterId
    return db.prepare('SELECT * FROM chapters WHERE id = ?').get(chId)
  },
  summarizeForAI(r) { return r ? { title: r.title, chapterNumber: r.chapter_number, outlineId: r.outline_id, expansionPlan: r.expansion_plan, targetWords: null } : null },
  summarizeForUI(r) { return r ? `大纲：${r.title}` : '无大纲' },
}

export const getPrevSummaryTool: AgentTool<{}, any> = {
  name: 'getPreviousChapterSummary',
  description: '获取上一章的 AI 摘要和关键事件，用于衔接',
  inputSchema: { type: 'object', properties: {} },
  async execute(_args, ctx) {
    const db = getDB(ctx.projectId)
    const curr = db.prepare('SELECT chapter_number FROM chapters WHERE id = ?').get(ctx.chapterId) as any
    if (!curr) return null
    return db.prepare('SELECT title, summary, summary_status, chapter_number, content FROM chapters WHERE chapter_number = ?').get(curr.chapter_number - 1)
  },
  summarizeForAI(r) {
    if (!r) return { missing: true, fallback: '无上一章' }
    if (r.summary_status === 'ready') return { number: r.chapter_number, title: r.title, summary: r.summary }
    return { number: r.chapter_number, title: r.title, fallback: r.content?.slice(-500), note: '摘要提取中，使用原文尾部' }
  },
  summarizeForUI(r) { return r ? `上一章：${r.title}` : '无上一章' },
}

export const getWorldRulesTool: AgentTool<{}, any> = {
  name: 'getWorldRules',
  description: '查询世界观规则设定',
  inputSchema: { type: 'object', properties: {} },
  async execute(_args, ctx) {
    const db = getDB(ctx.projectId)
    const ws = db.prepare('SELECT * FROM world_settings LIMIT 1').get()
    const entries = db.prepare('SELECT * FROM world_entries WHERE deleted_at IS NULL').all()
    return { worldSettings: ws, entries }
  },
  summarizeForAI(r) {
    const ws = r.worldSettings as any
    return { timePeriod: ws?.time_period, location: ws?.location, atmosphere: ws?.atmosphere, rules: ws?.rules }
  },
  summarizeForUI(r) { return '世界观规则' },
}

// ── Write Tools ──

export const saveChapterTool: AgentTool<{ content: string; wordCount: number }, any> = {
  name: 'saveChapter',
  description: '保存章节正文到数据库',
  inputSchema: { type: 'object', properties: { content: { type: 'string' }, wordCount: { type: 'number' } }, required: ['content', 'wordCount'] },
  async execute(args, ctx) {
    const db = getDB(ctx.projectId)
    const result = db.prepare(`UPDATE chapters SET content = ?, word_count = ?, status = 'done', summary_status = 'pending', updated_at = datetime('now') WHERE id = ?`)
      .run(args.content, args.wordCount, ctx.chapterId)
    if (result.changes === 0) throw new Error(`章节不存在: ${ctx.chapterId}`)
    return { success: true }
  },
  summarizeForAI() { return { saved: true } },
  summarizeForUI() { return '章节已保存' },
}

export const updateCharStateTool: AgentTool<{ characterId: string; changes: Record<string, unknown> }, any> = {
  name: 'updateCharacterState',
  description: '更新角色状态：职业阶段、关系、当前状态等',
  inputSchema: { type: 'object', properties: { characterId: { type: 'string' }, changes: { type: 'object' } }, required: ['characterId', 'changes'] },
  async execute(args, ctx) {
    const db = getDB(ctx.projectId)
    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(args.changes)) { sets.push(`${k} = ?`); params.push(v) }
    if (sets.length === 0) return { success: false, reason: 'no changes' }
    sets.push(`updated_at = datetime('now')`)
    params.push(args.characterId)
    db.prepare(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    return { success: true }
  },
  summarizeForAI() { return { updated: true } },
  summarizeForUI() { return '角色状态已更新' },
}

export const resolveForeshadowTool: AgentTool<{ foreshadowId: string; resolvedInChapter?: string }, any> = {
  name: 'resolveForeshadow',
  description: '标记伏笔为已回收',
  inputSchema: { type: 'object', properties: { foreshadowId: { type: 'string' }, resolvedInChapter: { type: 'string' } }, required: ['foreshadowId'] },
  async execute(args, ctx) {
    const db = getDB(ctx.projectId)
    db.prepare(`UPDATE foreshadows SET status = 'resolved', resolved_chapter_id = ?, resolved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(args.resolvedInChapter || ctx.chapterId, args.foreshadowId)
    return { success: true }
  },
  summarizeForAI() { return { resolved: true } },
  summarizeForUI() { return '伏笔已标记回收' },
}

// ── Tool Registry ──

export const READ_TOOLS: AgentTool[] = [
  getCharacterTool, searchMemoryTool, getForeshadowsTool,
  getOutlineTool, getPrevSummaryTool, getWorldRulesTool,
]

export const WRITE_TOOLS: AgentTool[] = [
  saveChapterTool, updateCharStateTool, resolveForeshadowTool,
]

export const ALL_TOOLS: AgentTool[] = [...READ_TOOLS, ...WRITE_TOOLS]

export function getToolsForAI(tools: AgentTool[]): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }))
}

export function findTool(name: string): AgentTool | undefined {
  return ALL_TOOLS.find(t => t.name === name)
}
