import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AIService } from '../services/ai/service.ts'

export function registerAnalyzeBookRoutes(app: FastifyInstance) {
  app.post('/api/ai/analyze-book', async (request, reply) => {
    const schema = z.object({
      text: z.string().min(100, '请至少提供100字的内容用于分析'),
      title: z.string().optional(),
      genre: z.string().optional(),
    })
    const body = schema.parse(request.body)

    // Trim to avoid token limits — take first 15000 chars as sample
    const sample = body.text.slice(0, 15000)

    const prompt = `你是专业的小说分析师。请仔细分析以下小说内容，提取关键要素。

${body.title ? `小说标题：${body.title}` : ''}
${body.genre ? `类型：${body.genre}` : ''}

【待分析内容】
${sample}
${body.text.length > 15000 ? '\n（注：以上为小说开头部分的采样分析）' : ''}

请以 JSON 格式返回分析结果：

{
  "project": {
    "title": "推测的小说标题",
    "genre": "类型",
    "theme": "核心主题（50字内）",
    "description": "内容简介（100-200字）",
    "narrativePerspective": "第一人称/第三人称/多视角"
  },
  "characters": [
    {
      "name": "角色名",
      "gender": "男/女/其他",
      "age": "推测年龄",
      "roleType": "protagonist/supporting/antagonist",
      "personality": "性格描述（100字内）",
      "background": "背景描述（100字内）",
      "appearance": "外貌特征",
      "traits": ["标签1", "标签2"]
    }
  ],
  "worldBuilding": {
    "timePeriod": "时代背景",
    "location": "主要地点",
    "atmosphere": "整体氛围",
    "rules": "世界观规则"
  },
  "plotStructure": [
    {
      "title": "章节/段落标题",
      "summary": "内容摘要（100字内）",
      "keyEvents": ["关键事件"],
      "charactersInvolved": ["角色名"]
    }
  ],
  "foreshadows": [
    {
      "title": "伏笔标题",
      "description": "伏笔描述",
      "status": "planted/resolved"
    }
  ],
  "writingStyle": {
    "styleContent": "写作风格描述（100-200字）：包括语言特点、句式偏好、描写风格、节奏感等"
  }
}

要求：
1. 只返回 JSON，不要用 markdown 代码块包裹
2. 角色数量不超过 10 个，取主要角色
3. 情节结构不超过 15 个节点
4. 如有不确定的字段，使用合理推测或留空字符串`

    const ai = new AIService({ userId: request.userId! })

    try {
      const result = await ai.generateJSON<any>({
        prompt,
        systemPrompt: '你是专业的小说分析师，擅长从文本中提取结构化信息。只返回JSON，不要任何额外文字。',
        temperature: 0.3,
      })

      reply.send({
        analysis: result,
        sampleLength: sample.length,
        totalLength: body.text.length,
      })
    } catch (e: any) {
      reply.status(500).send({ error: `分析失败: ${e.message}` })
    }
  })
}
