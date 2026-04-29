<p align="center">
  <h1 align="center">墨韵 AI</h1>
  <p align="center">全栈 AI 小说创作 SaaS · Agent Loop 深度生成 · PG + SQLite 双层存储</p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/build-passing-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/types-0_errors-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/Fastify-5-000?style=flat-square&logo=fastify&logoColor=white" />
  <img src="https://img.shields.io/badge/Vue-3-4FC08D?style=flat-square&logo=vue.js&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
</p>

---

## 是什么

墨韵 AI 是一个全栈的 AI 小说创作助手。不是简单的「输入 prompt → 输出文本」，而是通过 **Agent Loop**（Planner→Writer→Critic→Editor）和 **向量长期记忆**（sqlite-vec），让 AI 理解数百章前的角色状态、伏笔和世界观。

底层采用 **双层存储**：PostgreSQL 管 SaaS（用户/项目元数据/社区），SQLite 每项目一个文件（章节/角色/大纲/伏笔/记忆），导出即复制文件。

---

## 架构

```
                         ┌─────────────────────────────┐
 浏览器                    │       PostgreSQL             │
  │  Vue 3 SPA            │  用户 · 项目 · 社区 · 成本    │
  │  HTTP / SSE           └─────────────┬───────────────┘
  ▼                                     │
┌──────────┐                            │
│ Fastify  │────────────────────────────┘
│   API    │
└────┬─────┘
     │
     ├──── POST /api/chapters/:id/generate        ← 快速模式
     │     POST /api/chapters/:id/generate-agent  ← 深度模式
     │
     ▼
┌──────────────────────────────────────────┐
│         Agent Orchestrator                │
│                                           │
│  Planner                                 │
│    输入: 大纲 + 角色 + 世界观 + 前章 + 伏笔  │
│    输出: { scenes[], tone, constraints }  │
│     │                                     │
│  Writer                                  │
│    tool_use 循环 ← 9 个固定工具            │
│    SSE 流式输出正文                        │
│     │                                     │
│  Critic                                   │
│    检查: 角色一致性 · 伏笔推进 · 字数       │
│    输出: { severity, issues[] }           │
│     │                                     │
│  Editor                                   │
│    自动修复 medium 级问题                  │
│    ↑ 修复后 Re-Critic 再审                 │
│                                           │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│         SQLite (每项目一个文件)            │
│                                           │
│  chapters · outlines · characters        │
│  foreshadows · careers · world_settings   │
│  memories · vec0 (向量索引)               │
│                                           │
│  物理隔离: 文件路径含 project UUID         │
│  导出: 复制文件即可                        │
│  向量: sqlite-vec 同文件检索              │
└──────────────────────────────────────────┘
```

### 数据隔离

| 层 | 存储 | 隔离方式 |
|----|------|---------|
| SaaS | PostgreSQL | `WHERE user_id` · `JOIN projects.userId` |
| 写作 | SQLite | 文件路径含 UUID · 打开即隔离 · 无 user_id 列 |

### Agent 状态机

```
queued → running → cancelling → cancelled
              → completed
              → failed
              → interrupted → running / failed
              → needs_manual_review → completed / failed
```

---

## 功能

### AI 写作
- **快速模式** — 续写/润色/扩写/重写，SSE 流式输出
- **深度模式** — Agent 四阶段生成，9 个固定工具，tool_use 循环
- **审稿修复** — Critic 检查一致性 → Editor 自动修复中等问题
- **可恢复** — 取消/重启/重连 SSE 流

### 内容系统
- **大纲** — 树形结构 + 拖拽排序 + AI 批量扩展 + 4 视图
- **角色** — 完整档案（性格/外貌/背景/关系/职业阶段）
- **伏笔** — planted→hinted→resolved 状态追踪
- **世界观** — 设定 + 条目管理
- **职业体系** — 自定义等级系统 + 角色分配

### 向量记忆
- sqlite-vec 向量检索，跨章节语义搜索
- 角色设定/大纲导出记忆权重 2x，防止 AI 风格趋同
- 章节重写自动标记旧记忆 superseded

### 社区
- **Prompt 工坊** — 浏览/搜索/一键导入模板
- **写作风格** — 自定义 + 项目默认
- **灵感模式** — AI 基于上下文批量生成创意

### 管理
- **用量统计** — 日柱状图（hover 详情）+ 按模型/提供商分布
- **管理面板** — 用户管理 + 项目审查 + 工坊审核 + 数据库迁移

### 主题
5 主题 CSS 变量驱动：`light` · `dark` · `midnight` · `forest` · `warm`

---

## 快速开始

**前置依赖**：Node.js 20+ · PostgreSQL 16+

```bash
# 数据库
sudo -u postgres psql -c "CREATE USER moyun WITH PASSWORD 'moyun' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE moyun OWNER moyun;"

# 后端
cd ai-novel-backend && cp .env.example .env && npm install
npx drizzle-kit push && npx tsx src/db/seed && npm run dev

# 前端
cd ai-novel-vue && npm install && npm run dev
```

**演示账号** `demo@example.com` / `123456`

### Docker

```bash
export DB_PASSWORD=xxx JWT_SECRET=xxx ENCRYPTION_KEY=xxx
docker compose up -d
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 后端框架 | Fastify 5 · TypeScript |
| ORM | Drizzle ORM (PG + SQLite 双驱动) |
| 数据库 | PostgreSQL 16 + SQLite (better-sqlite3) |
| 向量搜索 | sqlite-vec (vec0 虚拟表) |
| AI 提供商 | OpenAI · Anthropic · Gemini |
| 嵌入模型 | text-embedding-3-small |
| 前端 | Vue 3 · Pinia · Vite |
| 样式 | CSS 变量 · 5 主题 |
| 测试 | Vitest · 69 单元测试 |
| 部署 | Docker Compose |

---

## 项目结构

```
ai-novel-backend/       # 主后端
  src/routes/           # 18 个 API（auth/projects/chapter-ai/agent-runs/admin...）
  src/services/         # Agent 编排 · 工具 · 记忆 · AI
  src/db/               # PG schema + SQLite 管理
  src/workers/          # 后处理队列
ai-novel-vue/           # 前端
  src/views/            # 10 个页面
  src/components/       # 13 个组件
  src/stores/           # 5 个 Pinia store
docker-compose.yml      # 一键部署
```

---

## Author

**[6Leokk](https://github.com/6Leokk)**

## License

MIT
