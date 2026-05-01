import crypto from 'crypto'
import { AIService } from './ai/service'
import { getDb } from '../db/connection'
import { agentRuns, agentRunEvents, projects, postProcessingTasks, userAiPreferences } from '../db/schema.ts'
import { projectDBManager } from '../db/sqlite/manager'
import { READ_TOOLS, WRITE_TOOLS, getToolsForAI, findTool, type AgentToolContext } from './agent-tools'
import { eq } from 'drizzle-orm'

const MAX_PLANNER_RETRIES = 3
const MAX_WRITER_RETRIES = 2
const MAX_CRITIC_RETRIES = 2
const MAX_PLANNER_CALLBACKS = 2
const MAX_TOOLS_PER_RUN = 36
const MAX_TOOLS_PER_SCENE = 6

interface PlannerOutput {
  schema_version: number
  chapterGoal: string
  tone: string
  scenes: Array<{
    id: string; title: string; goal: string; location?: string; time?: string
    characters: string[]; beats: string[]; requiredFacts?: string[]
    foreshadows?: string[]; expectedWords: number; exitState: string
  }>
  constraints: string[]
  writerBrief: string
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        return asString(obj.action) || asString(obj.description) || asString(obj.title)
      }
      return ''
    })
    .filter(Boolean)
}

function parseExpectedWords(value: unknown, fallback = 800): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value)
  if (typeof value === 'string') {
    const nums = value.match(/\d+/g)?.map(Number).filter(n => Number.isFinite(n) && n > 0) || []
    if (nums.length >= 2) return Math.round((nums[0] + nums[1]) / 2)
    if (nums.length === 1) return nums[0]
  }
  return fallback
}

function buildPlannerScene(scene: any, index: number, overrides: Record<string, unknown> = {}) {
  const normalized: Record<string, unknown> = {
    id: asString(overrides.id, asString(scene.id, `scene-${index + 1}`)),
    title: asString(overrides.title, asString(scene.title, `场景 ${index + 1}`)),
    goal: asString(overrides.goal, asString(scene.goal)),
    characters: asStringArray(overrides.characters ?? scene.characters),
    beats: asStringArray(overrides.beats ?? scene.beats),
    expectedWords: parseExpectedWords(overrides.expectedWords ?? scene.expectedWords),
    exitState: asString(overrides.exitState, asString(scene.exitState)),
  }

  const location = asString(overrides.location, asString(scene.location))
  const time = asString(overrides.time, asString(scene.time))
  const requiredFacts = asStringArray(overrides.requiredFacts ?? scene.requiredFacts)
  const foreshadows = asStringArray(overrides.foreshadows ?? scene.foreshadows)

  if (location) normalized.location = location
  if (time) normalized.time = time
  if (requiredFacts.length > 0) normalized.requiredFacts = requiredFacts
  if (foreshadows.length > 0) normalized.foreshadows = foreshadows

  return normalized as PlannerOutput['scenes'][number]
}

function validatePlannerOutput(plan: Partial<PlannerOutput> | null | undefined): PlannerOutput | null {
  if (!plan || !Array.isArray(plan.scenes) || plan.scenes.length === 0) return null

  const scenes = plan.scenes.map((scene: any, index) => buildPlannerScene(scene, index))

  if (scenes.some(scene => !scene.goal || scene.beats.length === 0 || !scene.exitState)) return null

  return {
    schema_version: Number(plan.schema_version) || 1,
    chapterGoal: asString(plan.chapterGoal, scenes[0].goal),
    tone: asString(plan.tone, '冷静'),
    scenes,
    constraints: asStringArray(plan.constraints),
    writerBrief: asString(plan.writerBrief, asString(plan.chapterGoal, scenes[0].goal)),
  }
}

export function normalizePlannerOutput(raw: any): PlannerOutput | null {
  const source = raw?.chapter && typeof raw.chapter === 'object' ? raw.chapter : raw
  const direct = validatePlannerOutput(source)
  if (direct) return direct
  if (!source || !Array.isArray(source.scenes) || source.scenes.length === 0) return null

  const fallbackExitState = asString(source.worldRuleCompliance)
    || asString(source.worldRuleApplication)
    || asString(source.foreshadowHandling)
    || asString(source.summary)
    || '完成当前场景目标，保持后续衔接。'

  const scenes = source.scenes.map((scene: any, index: number) => {
    const sceneGoal = asString(scene.goal)
      || asString(scene.description)
      || asString(scene.summary)
      || asString(scene.title)
      || `完成场景 ${index + 1} 的剧情推进。`
    const beats = asStringArray(scene.beats).length > 0
      ? asStringArray(scene.beats)
      : asStringArray(scene.keyActions).length > 0
        ? asStringArray(scene.keyActions)
        : asStringArray(scene.actions).length > 0
          ? asStringArray(scene.actions)
          : [sceneGoal]

    return buildPlannerScene(scene, index, {
      id: asString(scene.id, `scene-${index + 1}`),
      title: asString(scene.title, `场景 ${index + 1}`),
      goal: sceneGoal,
      location: asString(scene.location),
      time: asString(scene.time),
      characters: asStringArray(scene.characters),
      beats,
      requiredFacts: asStringArray(scene.requiredFacts),
      foreshadows: asStringArray(scene.foreshadows),
      expectedWords: parseExpectedWords(scene.expectedWords ?? scene.expectedWordCount),
      exitState: asString(scene.exitState, fallbackExitState),
    })
  })

  return validatePlannerOutput({
    schema_version: Number(source.schema_version) || 1,
    chapterGoal: asString(source.chapterGoal, asString(source.summary, asString(source.title, scenes[0].goal))),
    tone: asString(source.tone, asString(source.atmosphere, '冷静')),
    scenes,
    constraints: asStringArray(source.constraints),
    writerBrief: asString(source.writerBrief, asString(source.summary, scenes[0].goal)),
  })
}

interface SSESink {
  emit(event: string, data: Record<string, unknown>): void
}

type AutoPlanApprovalMode = 'manual' | 'auto_confirm'
type AutoResultHandlingMode = 'manual' | 'auto_accept_safe' | 'auto_accept_all'

export function hasHighSeverityIssue(issues: any[]): boolean {
  return issues.some((i: any) => i.severity === 'high')
}

export function shouldAutoAcceptResult(mode: AutoResultHandlingMode, issues: any[]): boolean {
  if (mode === 'auto_accept_all') return true
  if (mode === 'auto_accept_safe') return !hasHighSeverityIssue(issues)
  return false
}

export function selectFinalRunState(mode: AutoResultHandlingMode, issues: any[]): { status: string; phase: string | null } {
  if (shouldAutoAcceptResult(mode, issues)) return { status: 'completed', phase: null }
  if (hasHighSeverityIssue(issues)) return { status: 'needs_manual_review', phase: 'needs_manual_review' }
  return { status: 'completed', phase: null }
}

export class AgentOrchestrator {
  private aiService: AIService
  private ctx: AgentToolContext
  private runId: string
  private sse: SSESink
  private seq = 0
  private toolCallsTotal = 0
  private toolCallsThisScene = 0
  private plannerCallbacks = 0

  constructor(opts: {
    aiService: AIService
    ctx: AgentToolContext
    runId: string
    sse: SSESink
  }) {
    this.aiService = opts.aiService
    this.ctx = opts.ctx
    this.runId = opts.runId
    this.sse = opts.sse
  }

  async execute(mode: string): Promise<{ content: string; wordCount: number; issues?: any[] }> {
    await this.emitPhase('planning', 'started', '正在规划章节结构...')

    // ── Phase 1: Planner ──
    const plan = await this.runPlanner(mode)
    if (!plan) throw new Error('Planner 失败')

    await this.savePlannerOutput(plan)

    const preferences = await this.getAutomationPreferences()
    let confirmedPlan: PlannerOutput

    if (preferences.autoPlanApprovalMode === 'auto_confirm') {
      confirmedPlan = plan
      await this.confirmPlan(confirmedPlan)
    } else {
      this.emit('agent:plan_ready', { plan, runId: this.runId })
      this.emit('agent:phase', { phase: 'planning', status: 'awaiting_review', message: '规划完成，等待确认' })
      const userConfirmedPlan = await this.waitForPlanConfirmation()
      if (!userConfirmedPlan) { throw new Error('规划审核超时或取消') }
      confirmedPlan = userConfirmedPlan
    }

    await this.saveCheckpoint({ phase: 'planning', plan, confirmedPlan })

    // ── Phase 2: Writer ──
    await this.emitPhase('writing', 'started', '正在写作...')

    let content = mode === 'continue' ? await this.getExistingContent() : ''
    let wordCount = content.length

    for (let si = 0; si < confirmedPlan.scenes.length; si++) {
      if (await this.isCancelled()) { await this.savePartial(content); throw new Error('已取消') }

      const scene = confirmedPlan.scenes[si]
      this.toolCallsThisScene = 0
      await this.emitScene(si, scene)

      const contentBefore = content
      const sceneContent = await this.runWriterScene(scene, confirmedPlan, content)
      content += sceneContent
      wordCount += sceneContent.length

      // Self-check for hard conflicts
      const conflict = await this.writerSelfCheck(scene, sceneContent, confirmedPlan)
      if (conflict.hasHardConflict && this.plannerCallbacks < MAX_PLANNER_CALLBACKS) {
        this.plannerCallbacks++
        const patch = await this.runPlannerPatch(scene, conflict, confirmedPlan)
        if (patch) {
          await this.emitPlanPatch(patch)
          if (patch.action === 'rewrite') {
            content = contentBefore // Rollback failed scene content
            si-- // Re-do this scene
            continue
          }
        }
      }
    }

    // ── Phase 3: Critic ──
    await this.emitPhase('reviewing', 'started', '正在审稿...')
    let issues = await this.runCritic(content, confirmedPlan)

    // ── Phase 3b: Editor → Re-Critic loop (max 2 rounds) ──
    for (let round = 0; round < 2; round++) {
      const mediumIssues = issues.filter((i: any) => i.severity === 'medium')
      if (mediumIssues.length === 0) break
      await this.emitPhase('editing', 'started', `自动修复中 (第${round + 1}轮)...`)
      content = await this.runEditor(content, mediumIssues)
      issues = await this.runCritic(content, confirmedPlan)
    }

    // ── Save ──
    const chineseChars = (content.match(/[一-鿿]/g) || []).length
    const englishWords = (content.replace(/[一-鿿]/g, '').match(/\b[a-zA-Z]+\b/g) || []).length
    const finalWordCount = chineseChars + englishWords

    await this.saveChapter(content, finalWordCount)
    await this.createPostProcessingTasks(content)
    await this.markCompleted(content, finalWordCount, issues, preferences.autoResultHandlingMode)

    return { content, wordCount: finalWordCount, issues }
  }

  // ── Planner ──

  private async runPlanner(mode: string): Promise<PlannerOutput | null> {
    for (let attempt = 0; attempt < MAX_PLANNER_RETRIES; attempt++) {
      try {
        const systemPrompt = `你是小说章节规划师。只负责规划章节结构，不写正文。输出严格 JSON，不要输出 markdown。`
        const prompt = `为${mode === 'continue' ? '续写' : '新写'}本章做规划。\n\n${await this.buildPlannerContext()}\n\n请只输出符合以下 TypeScript 结构的 JSON，不要增减顶层字段：\n{\n  \"schema_version\": 1,\n  \"chapterGoal\": \"本章目标\",\n  \"tone\": \"语气\",\n  \"scenes\": [{\n    \"id\": \"scene-1\",\n    \"title\": \"场景标题\",\n    \"goal\": \"场景目标\",\n    \"location\": \"可选地点\",\n    \"time\": \"可选时间\",\n    \"characters\": [\"角色名\"],\n    \"beats\": [\"动作节拍\"],\n    \"requiredFacts\": [\"必须遵守的事实\"],\n    \"foreshadows\": [\"伏笔处理\"],\n    \"expectedWords\": 800,\n    \"exitState\": \"场景结束状态\"\n  }],\n  \"constraints\": [\"约束\"],\n  \"writerBrief\": \"给 Writer 的简要说明\"\n}`

        const result = await this.aiService.generateJSON<PlannerOutput>({
          prompt, systemPrompt, temperature: 0.3,
        })

        const normalized = normalizePlannerOutput(result)
        if (normalized) return normalized
      } catch (e) { /* retry */ }
    }
    return null
  }

  private async runPlannerPatch(scene: any, conflict: any, plan: PlannerOutput): Promise<any | null> {
    try {
      const prompt = `原规划中 scene "${scene.title}" 遇到硬冲突：${conflict.reason}。请输出 patch JSON: { action: "rewrite"|"keep"|"trim_and_continue", reason: "...", newScenePlan: {...} }`
      return await this.aiService.generateJSON({ prompt, temperature: 0.3 })
    } catch { return null }
  }

  // ── Writer ──

  private async runWriterScene(scene: any, plan: PlannerOutput, fullContent: string): Promise<string> {
    const tools = getToolsForAI(READ_TOOLS)
    let sceneText = ''

    for (let attempt = 0; attempt < MAX_WRITER_RETRIES; attempt++) {
      try {
        const systemPrompt = `你是小说写手。严格按规划写作。可以用工具查询角色、记忆、世界观。`
        const prompt = `规划：${JSON.stringify({ sceneGoal: scene.goal, tone: plan.tone, characters: scene.characters, beats: scene.beats, expectedWords: scene.expectedWords })}\n\n已写内容：${fullContent.slice(-1000)}\n\n请写 scene: ${scene.title}`

        for await (const event of this.aiService.generateWithTools({
          prompt, systemPrompt, tools,
          onToolCall: async (name, args) => {
            return await this.executeTool(name, args)
          },
        })) {
          if (event.type === 'chunk' && event.text) {
            sceneText += event.text
            this.emit('chunk', { text: event.text, sceneIndex: plan.scenes.indexOf(scene) })
          } else if (event.type === 'tool_call') {
            this.emit('agent:tool', { tool: event.tool, action: 'call', args: event.args })
          } else if (event.type === 'tool_result') {
            this.emit('agent:tool', { tool: event.tool, action: 'result', summary: event.result })
          }
          if (this.seq % 10 === 0) {
            this.emit('heartbeat', {})
          }
        }
        return sceneText
      } catch (e) { /* retry */ }
    }
    return sceneText
  }

  private async writerSelfCheck(scene: any, sceneText: string, plan: PlannerOutput): Promise<any> {
    try {
      const prompt = `检查刚写的 scene 是否违反设定：\n角色设定说明\n世界观规则说明\n\nscene 内容：${sceneText.slice(0, 2000)}\n\n输出 JSON: { hasHardConflict: boolean, conflictType: string|null, reason: string, needsPlannerCallback: boolean }`
      return await this.aiService.generateJSON({ prompt, temperature: 0.1 })
    } catch {
      return { hasHardConflict: false, needsPlannerCallback: false }
    }
  }

  // ── Critic ──

  private async runCritic(content: string, plan: PlannerOutput): Promise<any[]> {
    for (let attempt = 0; attempt < MAX_CRITIC_RETRIES; attempt++) {
      try {
        const prompt = `检查这个章节：\n角色：${JSON.stringify(plan.scenes.flatMap(s => s.characters))}\n正文：${content.slice(0, 5000)}\n\n输出 JSON: { severity: "low"|"medium"|"high", issues: [{ type, detail, suggestion }] }`
        const result = await this.aiService.generateJSON<{ severity: string; issues: any[] }>({ prompt, temperature: 0.2 })

        if (result?.issues) {
          for (const issue of result.issues) {
            this.emit('agent:issue', { issue })
          }
        }
        return result?.issues || []
      } catch { /* retry */ }
    }
    return []
  }

  // ── Editor ──

  private async runEditor(content: string, issues: any[]): Promise<string> {
    try {
      const prompt = `根据审稿意见修改文章。只修改问题指向的地方，不要重写整章。\n\n审稿意见：${JSON.stringify(issues)}\n\n原文：${content.slice(0, 8000)}\n\n请输出修改后的完整内容。`
      const result = await this.aiService.generateText({ prompt, temperature: 0.3 })
      this.emit('agent:phase', { phase: 'editing', status: 'completed', message: '自动修复完成' })
      return result.content
    } catch {
      return content
    }
  }

  // ── Planner Review ──

  private async waitForPlanConfirmation(): Promise<PlannerOutput | null> {
    const db = getDb()
    const timeout = parseInt(process.env.PLANNER_REVIEW_TIMEOUT || '300', 10) // 5 min default
    const maxChecks = Math.ceil(timeout / 5) // Check every 5 seconds
    for (let i = 0; i < maxChecks; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const rows = await db.select({
        planStatus: agentRuns.planStatus,
        confirmedPlan: agentRuns.confirmedPlan,
      }).from(agentRuns)
        .where(eq(agentRuns.id, this.runId)).limit(1)
      if (rows[0]?.planStatus === 'confirmed') return rows[0].confirmedPlan as PlannerOutput
      if (await this.isCancelled()) return null
    }
    return null // timeout: throw
  }

  // ── Helpers ──

  private async buildPlannerContext(): Promise<string> {
    const prevTool = findTool('getPreviousChapterSummary')
    const outlineTool = findTool('getChapterOutline')
    const charTool = findTool('getCharacter')
    const fsTool = findTool('getForeshadows')
    const worldTool = findTool('getWorldRules')

    const [prev, outlines, chars, fs, world] = await Promise.all([
      prevTool?.execute({}, this.ctx) ?? null,
      outlineTool?.execute({}, this.ctx) ?? null,
      charTool?.execute({}, this.ctx) ?? [],
      fsTool?.execute({ status: 'planted' }, this.ctx) ?? [],
      worldTool?.execute({}, this.ctx) ?? null,
    ])

    // Search vector memory for Planner
    const memTool = findTool('searchMemory')
    let relevantMemories = null
    if (memTool) {
      try {
        const mems = await memTool.execute({ query: (outlines as any)?.title || (outlines as any)?.expansion_plan || '章节规划', limit: 5 }, this.ctx)
        relevantMemories = memTool.summarizeForAI(mems)
      } catch { /* memory search optional */ }
    }

    return JSON.stringify({
      prevChapter: prevTool?.summarizeForAI(prev),
      outline: outlines ? { title: (outlines as any).title, expansionPlan: (outlines as any).expansion_plan } : null,
      characters: charTool?.summarizeForAI(chars),
      foreshadows: fsTool?.summarizeForAI(fs),
      worldRules: worldTool?.summarizeForAI(world),
      relevantMemories,
    })
  }

  private async getExistingContent(): Promise<string> {
    const db = projectDBManager.open(this.ctx.projectId)
    const ch = db.prepare('SELECT content FROM chapters WHERE id = ?').get(this.ctx.chapterId) as any
    return ch?.content || ''
  }

  private async saveChapter(content: string, wordCount: number): Promise<void> {
    await findTool('saveChapter')!.execute({ content, wordCount }, this.ctx)
  }

  private async savePartial(content: string): Promise<void> {
    try { await this.saveChapter(content, content.length) } catch { /* best effort */ }
  }

  private async createPostProcessingTasks(content: string): Promise<void> {
    const contentHash = crypto.createHash('sha256').update(content.slice(0, 10000)).digest('hex')
    const db = getDb()
    const tasks = [
      { type: 'extract_summary', priority: 10, dependsOn: null },
      { type: 'extract_memories', priority: 10, dependsOn: null },
      { type: 'embed_memories', priority: 5, dependsOn: 'extract_memories' },
      { type: 'update_character_states', priority: 3, dependsOn: 'extract_summary' },
    ]

    for (const t of tasks) {
      const taskKey = `${this.ctx.projectId}:${this.ctx.chapterId}:${contentHash}:${t.type}`
      await db.insert(postProcessingTasks).values({
        runId: this.runId,
        projectId: this.ctx.projectId,
        chapterId: this.ctx.chapterId,
        taskType: t.type,
        taskKey,
        priority: t.priority,
        payload: { contentHash },
      } as any).execute().catch(() => { /* ON CONFLICT DO NOTHING */ })
    }
  }

  private async saveCheckpoint(data: Record<string, unknown>): Promise<void> {
    const db = getDb()
    await db.update(agentRuns).set({
      checkpoint: data,
      phase: data.phase as string,
    } as any).where(eq(agentRuns.id, this.runId))
    this.emit('agent:checkpoint', data)
  }

  private async getAutomationPreferences(): Promise<{
    autoPlanApprovalMode: AutoPlanApprovalMode
    autoResultHandlingMode: AutoResultHandlingMode
  }> {
    const db = getDb()
    const rows = await db.select({
      autoPlanApprovalMode: userAiPreferences.autoPlanApprovalMode,
      autoResultHandlingMode: userAiPreferences.autoResultHandlingMode,
    }).from(userAiPreferences)
      .where(eq(userAiPreferences.userId, this.ctx.userId))
      .limit(1)

    return {
      autoPlanApprovalMode: (rows[0]?.autoPlanApprovalMode || 'manual') as AutoPlanApprovalMode,
      autoResultHandlingMode: (rows[0]?.autoResultHandlingMode || 'manual') as AutoResultHandlingMode,
    }
  }

  private async savePlannerOutput(plan: PlannerOutput): Promise<void> {
    const db = getDb()
    await db.update(agentRuns).set({
      plan,
      planStatus: 'pending_review',
    } as any).where(eq(agentRuns.id, this.runId))
  }

  private async confirmPlan(confirmedPlan: PlannerOutput): Promise<void> {
    const db = getDb()
    await db.update(agentRuns).set({
      confirmedPlan,
      planStatus: 'confirmed',
    } as any).where(eq(agentRuns.id, this.runId))
  }

  private async markCompleted(_content: string, wordCount: number, issues: any[], mode: AutoResultHandlingMode): Promise<void> {
    const db = getDb()
    const finalState = selectFinalRunState(mode, issues)

    await db.update(agentRuns).set({
      status: finalState.status,
      phase: finalState.phase,
      wordCount,
      resultData: { issues, wordCount },
      finishedAt: new Date(),
    } as any).where(eq(agentRuns.id, this.runId))

    this.emit('result', { runId: this.runId, issues, wordCount, status: finalState.status, phase: finalState.phase })
    this.emit('done', {})
  }

  private async isCancelled(): Promise<boolean> {
    const db = getDb()
    const rows = await db.select({ status: agentRuns.status }).from(agentRuns).where(eq(agentRuns.id, this.runId)).limit(1)
    return rows[0]?.status === 'cancelling'
  }

  // ── SSE ──

  private async emitPhase(phase: string, status: string, message: string): Promise<void> {
    const db = getDb()
    await db.update(agentRuns).set({ phase } as any).where(eq(agentRuns.id, this.runId))
    this.emit('agent:phase', { phase, status, message })
  }

  private async emitScene(index: number, scene: any): Promise<void> {
    this.emit('agent:scene', { index, title: scene.title, expectedWords: scene.expectedWords })
  }

  private async emitPlanPatch(patch: any): Promise<void> {
    this.emit('agent:plan_patch', { patch })
  }

  private emit(event: string, data: Record<string, unknown>): void {
    const seq = ++this.seq
    // Persist event to PG
    getDb().insert(agentRunEvents).values({
      runId: this.runId,
      seq,
      eventType: event,
      payload: data,
    }).execute().catch(() => { /* non-critical */ })

    // Push SSE
    this.sse.emit(event, { runId: this.runId, seq, ts: Date.now(), ...data })
  }

  private async executeTool(toolName: string, args: any): Promise<any> {
    if (this.toolCallsTotal >= MAX_TOOLS_PER_RUN || this.toolCallsThisScene >= MAX_TOOLS_PER_SCENE) {
      return { error: 'tool_budget_exceeded' }
    }

    const tool = findTool(toolName)
    if (!tool) return { error: 'unknown_tool' }

    this.emit('agent:tool', { tool: toolName, action: 'call', args })
    this.toolCallsTotal++
    this.toolCallsThisScene++

    try {
      const result = await tool.execute(args, this.ctx)
      this.emit('agent:tool', { tool: toolName, action: 'result', summary: tool.summarizeForUI(result) })
      return tool.summarizeForAI(result)
    } catch (e: any) {
      this.emit('agent:tool', { tool: toolName, action: 'result', summary: `错误: ${e.message}` })
      return { error: e.message }
    }
  }
}
