import { getDb } from '../db/connection.ts'
import { projects, worldSettings, characters, outlines, chapters, foreshadows, writingStyles, projectDefaultStyles } from '../db/schema.ts'
import { eq, and, sql } from 'drizzle-orm'

export interface ChapterContext {
  projectInfo: string
  worldInfo: string
  characters: string
  outline: string
  previousChapterEnding: string
  foreshadows: string
  style: string
  targetWords: number
}

export class ChapterContextBuilder {
  static async gather(projectId: string, chapterId?: string): Promise<ChapterContext> {
    const db = getDb()

    // Project info
    const proj = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
    const p = proj[0]
    const projectInfo = `小说标题：${p.title}\n类型：${p.genre}\n主题：${p.theme}\n简介：${p.description}\n叙事视角：${p.narrativePerspective || '未设定'}`

    // World info
    const world = await db.select().from(worldSettings).where(eq(worldSettings.projectId, projectId)).limit(1)
    let worldInfo = ''
    if (world.length > 0) {
      const w = world[0]
      worldInfo = `时代背景：${w.timePeriod || '未设定'}\n主要地点：${w.location || '未设定'}\n整体氛围：${w.atmosphere || '未设定'}\n核心规则：${w.rules || '未设定'}`
    }

    // Characters
    const chars = await db.select().from(characters)
      .where(and(eq(characters.projectId, projectId), sql`${characters.deletedAt} IS NULL`))
    const charsText = chars.map(c =>
      `- ${c.name}（${c.gender}, ${c.roleType === 'protagonist' ? '主角' : c.roleType === 'antagonist' ? '反派' : '配角'}）：${c.personality?.slice(0, 100) || '暂无描述'}`
    ).join('\n')

    // Outline for this chapter
    let outlineText = ''
    if (chapterId) {
      const ch = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1)
      if (ch.length > 0 && ch[0].outlineId) {
        const ol = await db.select().from(outlines).where(eq(outlines.id, ch[0].outlineId)).limit(1)
        if (ol.length > 0) outlineText = `大纲：${ol[0].title}\n${ol[0].content}`
      }
    }

    // Previous chapter summary
    let previousChapterEnding = '无（这是第一章）'
    if (chapterId) {
      const ch = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1)
      if (ch.length > 0 && ch[0].chapterNumber > 1) {
        const prev = await db.select().from(chapters)
          .where(and(
            eq(chapters.projectId, projectId),
            eq(chapters.chapterNumber, ch[0].chapterNumber - 1),
          )).limit(1)
        if (prev.length > 0) {
          previousChapterEnding = prev[0].content?.slice(-500) || '无内容'
        }
      }
    }

    // Unresolved foreshadows
    const fs = await db.select().from(foreshadows)
      .where(and(eq(foreshadows.projectId, projectId), eq(foreshadows.status, 'planted')))
    const foreshadowsText = fs.length > 0
      ? fs.map(f => `- ${f.title}：${f.description?.slice(0, 100)}`).join('\n')
      : '暂无'

    // Writing style
    let style = ''
    const pds = await db.select({ styleId: projectDefaultStyles.styleId })
      .from(projectDefaultStyles).where(eq(projectDefaultStyles.projectId, projectId))
    if (pds.length > 0) {
      const ws = await db.select().from(writingStyles).where(eq(writingStyles.id, pds[0].styleId)).limit(1)
      if (ws.length > 0) style = ws[0].styleContent
    }

    return {
      projectInfo,
      worldInfo,
      characters: charsText,
      outline: outlineText,
      previousChapterEnding,
      foreshadows: foreshadowsText,
      style,
      targetWords: p.maxWordsPerChapter || 2000,
    }
  }

  static formatContext(ctx: ChapterContext): string {
    return `【项目信息】${ctx.projectInfo}

【世界观】${ctx.worldInfo}

【角色列表】${ctx.characters}

【当前大纲】${ctx.outline}

【前一章结尾】${ctx.previousChapterEnding}

【未回收伏笔】${ctx.foreshadows}

【写作风格】${ctx.style || '默认风格'}`
  }
}
