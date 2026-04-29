import bcrypt from 'bcryptjs'
import { getDb } from './connection.ts'
import { relationshipTypes, promptTemplates, writingStyles, users, userAiPreferences } from './schema.ts'
import { eq, sql } from 'drizzle-orm'

export async function seedSystemData() {
  const db = getDb()

  // Demo user
  const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, 'demo@example.com')).limit(1)
  if (existingUser.length === 0) {
    const passwordHash = await bcrypt.hash('123456', 10)
    const [user] = await db.insert(users).values({
      username: 'demo',
      email: 'demo@example.com',
      passwordHash,
    }).returning({ id: users.id })
    await db.insert(userAiPreferences).values({ userId: user.id })
  }

  // Relationship types — use raw SQL insert to avoid Drizzle type issues
  const relTypes = [
    { name: '亲人', category: 'positive', icon: '❤️' },
    { name: '朋友', category: 'positive', icon: '🤝' },
    { name: '恋人', category: 'positive', icon: '💕' },
    { name: '师徒', category: 'positive', icon: '📚' },
    { name: '上下级', category: 'neutral', icon: '👔' },
    { name: '敌人', category: 'negative', icon: '⚔️' },
    { name: '竞争对手', category: 'negative', icon: '🏆' },
    { name: '盟友', category: 'positive', icon: '🛡️' },
    { name: '族人', category: 'positive', icon: '🏠' },
    { name: '陌生', category: 'neutral', icon: '👤' },
  ]

  for (const rt of relTypes) {
    await db.execute(sql`INSERT INTO relationship_types (name, category, icon) VALUES (${rt.name}, ${rt.category}, ${rt.icon}) ON CONFLICT (name) DO NOTHING`)
  }

  // Default prompt templates (system level)
  const templates = [
    {
      templateKey: 'WORLD_BUILDING',
      name: '世界观构建',
      content: `你是资深的世界观设计师，擅长为{genre}类型的小说构建真实、自洽的世界观。

小说信息：
- 标题：{title}
- 类型：{genre}
- 主题：{theme}
- 简介：{description}

请生成以下世界观设定，以 JSON 格式返回：
{
  "time_period": "时代背景（100-300字）",
  "location": "主要地点及环境描写（100-300字）",
  "atmosphere": "整体氛围和基调（100-300字）",
  "rules": "世界观核心规则和设定（100-300字）"
}`,
      variables: ['genre', 'title', 'theme', 'description'],
    },
    {
      templateKey: 'CAREER_SYSTEM_GENERATION',
      name: '职业体系生成',
      content: `你是职业体系设计师，为小说设计完整的职业/等级系统。

小说信息：
- 标题：{title}
- 类型：{genre}
- 主题：{theme}
- 简介：{description}
- 世界观：时代={time_period}，地点={location}，氛围={atmosphere}，规则={rules}

请生成职业体系，以 JSON 格式返回：
{
  "main_careers": [
    {
      "name": "职业名称",
      "description": "职业描述",
      "category": "分类",
      "stages": [{"stage": 1, "name": "阶段名", "abilities": ["能力"], "requirements": "晋升条件"}],
      "max_stage": 10
    }
  ],
  "sub_careers": [
    {
      "name": "副职业名称",
      "description": "描述",
      "category": "分类",
      "stages": [{"stage": 1, "name": "阶段名", "abilities": ["能力"]}],
      "max_stage": 5
    }
  ]
}`,
      variables: ['title', 'genre', 'theme', 'description', 'time_period', 'location', 'atmosphere', 'rules'],
    },
    {
      templateKey: 'CHARACTERS_BATCH_GENERATION',
      name: '角色批量生成',
      content: `你是角色设计师，为小说创建生动、立体的角色。

小说信息：
- 标题：{title}
- 类型：{genre}
- 主题：{theme}
- 世界观：时代={time_period}，地点={location}，氛围={atmosphere}，规则={rules}
- 职业体系参考：{careers_context}

请生成 {count} 个角色，每个角色包含以下字段，以 JSON 数组返回：
[{
  "name": "角色名",
  "gender": "男/女/其他",
  "age": "年龄",
  "role_type": "protagonist/supporting/antagonist",
  "personality": "性格描述（100-200字）",
  "background": "背景故事（100-200字）",
  "appearance": "外貌描写（50-100字）",
  "traits": ["标签1", "标签2"],
  "is_organization": false,
  "relationships_array": [
    {"target_character_name": "关联角色名", "relationship_type": "关系类型", "description": "描述", "intimacy_level": 50}
  ],
  "career_assignment": {
    "main_career": "主职业名",
    "main_stage": 2,
    "sub_careers": [{"career": "副职业名", "stage": 1}]
  }
}]`,
      variables: ['title', 'genre', 'theme', 'time_period', 'location', 'atmosphere', 'rules', 'careers_context', 'count'],
    },
    {
      templateKey: 'OUTLINE_CREATE',
      name: '大纲创建',
      content: `你是小说大纲设计师，为小说创作结构清晰的章节目录。

小说信息：
- 标题：{title}
- 类型：{genre}
- 主题：{theme}
- 目标章节数：{chapter_count}
- 叙事视角：{narrative_perspective}
- 目标字数/章：{target_words}
- 角色信息：{characters_info}

请生成 {chapter_count} 个大纲节点，以 JSON 数组返回：
[
  {
    "title": "章节标题",
    "summary": "章节摘要（100-200字）",
    "key_events": ["关键事件1", "关键事件2"],
    "characters_involved": ["角色名1", "角色名2"],
    "foreshadow_plant": "本章埋下的伏笔（可选）"
  }
]`,
      variables: ['title', 'genre', 'theme', 'chapter_count', 'narrative_perspective', 'target_words', 'characters_info'],
    },
    {
      templateKey: 'CHAPTER_GENERATE',
      name: '章节生成',
      content: `你是小说作家，根据提供的信息创作章节内容。

{context}

请根据以上信息写出本章内容。要求：
1. 文笔流畅，描写生动
2. 符合指定的写作风格
3. 字数控制在 {target_words} 字左右
4. 不要输出章节标题，只输出正文内容`,
      variables: ['context', 'target_words'],
    },
    {
      templateKey: 'CHAPTER_CONTINUE',
      name: '章节续写',
      content: `你是小说作家，请从现有内容的结尾处自然接续写下去。

{context}

【当前章节已有内容（请从结尾处续写，不要重复）】
{existing_content}

请从以上内容的结尾处自然接续，保持风格、语气和节奏一致。不要重复已有内容，不要输出章节标题。`,
      variables: ['context', 'existing_content'],
    },
  ]

  for (const tmpl of templates) {
    await db.execute(sql`INSERT INTO prompt_templates (template_key, name, content, variables, user_id)
      VALUES (${tmpl.templateKey}, ${tmpl.name}, ${tmpl.content}, ${JSON.stringify(tmpl.variables)}, NULL)
      ON CONFLICT DO NOTHING`)
  }

  // Default writing style
  await db.execute(sql`INSERT INTO writing_styles (user_id, name, description, style_content, order_index)
    VALUES (NULL, '默认风格', '通用写作风格，适合大多数类型小说',
    '使用流畅优美的中文写作，注重细节描写和情感表达，保持节奏感和张力，对话自然生动。', 1)
    ON CONFLICT DO NOTHING`)

  console.log('Seed data inserted successfully')
}

// Execute directly
seedSystemData()
  .then(() => process.exit(0))
  .catch(err => { console.error('Seed failed:', err); process.exit(1) })
