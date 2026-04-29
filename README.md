<p align="center">
  <h1 align="center">墨韵 AI 小说创作系统</h1>
  <p align="center">全栈 AI 小说创作 SaaS · 深度 Agent Loop 生成 · 向量长期记忆</p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vue-3-4FC08D?style=flat&logo=vue.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Fastify-5-000000?style=flat&logo=fastify&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-per_project-003B57?style=flat&logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat" />
</p>

---

## 项目结构

```
ai-novel-backend/
├── src/
│   ├── routes/               # 16 个 REST API 模块
│   │   ├── auth.ts           #   登录/注册/OAuth
│   │   ├── projects.ts       #   项目 CRUD + 导出/导入
│   │   ├── chapters.ts       #   章节 CRUD
│   │   ├── chapter-ai.ts     #   AI 生成/续写/润色/重写 + Agent
│   │   ├── characters.ts     #   角色管理
│   │   ├── foreshadows.ts    #   伏笔追踪
│   │   ├── careers.ts        #   职业体系
│   │   ├── inspirations.ts   #   灵感生成
│   │   ├── writing-styles.ts #   写作风格
│   │   ├── prompt-templates.ts  # Prompt 模板
│   │   ├── prompt-workshop.ts   # 社区工坊
│   │   ├── agent-runs.ts     #   Agent 运行时
│   │   ├── analyze-book.ts   #   拆书分析
│   │   ├── wizard.ts         #   分步创作向导
│   │   ├── ai-settings.ts    #   AI 配置
│   │   └── health.ts         #   健康检查
│   ├── services/
│   │   ├── agent-orchestrator.ts  # Agent Loop (Planner→Writer→Critic)
│   │   ├── agent-tools.ts         # 9 个固定工具（getCharacter/searchMemory...）
│   │   ├── memory-service.ts      # 向量记忆（embed + search + supersede）
│   │   ├── migration-service.ts   # PG → SQLite 懒迁移
│   │   ├── chapter-context.ts     # 快速生成上下文构建
│   │   ├── prompt-service.ts      # Prompt 模板引擎
│   │   └── ai/                    # AI 服务（3 个 provider + 4 个 client）
│   ├── db/
│   │   ├── schema.ts              # PG Drizzle schema（22 张表）
│   │   ├── sqlite/                # SQLite schema + 管理
│   │   │   ├── schema.ts          #   16 张写作层表
│   │   │   ├── connection.ts      #   WAL + initProjectDB + vec0
│   │   │   └── manager.ts         #   LRU 缓存 + 写锁
│   │   ├── connection.ts          # PG 连接
│   │   └── seed.ts                # 种子数据（demo 账号 + 模板）
│   ├── workers/
│   │   └── post-processor.ts      # 后处理队列消费者
│   ├── middleware/                 # JWT 认证 + 错误处理
│   └── utils/                     # SSE · 加密 · 路径安全
├── tests/                         # 51 个单元测试
├── drizzle/                       # PG 迁移 SQL
└── vitest.config.ts

ai-novel-vue/
├── src/
│   ├── views/              # 8 个页面
│   │   ├── LoginView.vue   #   登录/注册
│   │   ├── DashboardView.vue  # 项目列表 + 统计 + 灵感
│   │   ├── EditorView.vue     # 章节编辑器 + Agent 深度生成
│   │   ├── PlotView.vue       # 剧情大纲（4 视图含伏笔）
│   │   ├── CharactersView.vue #  角色管理
│   │   ├── WorldView.vue      # 世界观
│   │   ├── SettingsView.vue   # AI 配置/风格/Prompt/工坊/拆书/主题
│   │   └── StatsView.vue      # 写作统计
│   ├── components/         # 12 个通用组件
│   ├── stores/             # 5 个 Pinia store（含 agentStore）
│   ├── api/                # API 层 + SSE 客户端
│   └── assets/styles/      # CSS 变量 · 5 主题
└── vite.config.js

docker-compose.yml           # Docker 部署
```

---

## 架构

```
┌─ PostgreSQL（SaaS 层）──┐     ┌─ SQLite（写作层：每项目一个文件）──┐
│                          │     │                                    │
│  用户体系 / 项目元数据     │     │  章节正文 · 大纲 · 角色 · 世界观    │
│  AI keys · 成本统计       │     │  伏笔追踪 · 职业体系 · 向量记忆    │
│  社区工坊 · 管理面板       │     │  章节分析报告                      │
│                          │     │                                    │
└──────────────────────────┘     └────────────────────────────────────┘
             ↑                                    ↑
      跨用户查询 + 统计                       Agent 工具直接操作
                                              打开文件 = 物理隔离
```

## AI 生成流程

```
Planner ──→ Writer ──→ Critic
 规划场景     流式写作     审稿检查
```

| Agent | 职责 | 工具 |
|-------|------|------|
| Planner | 把大纲变成可执行的场景规划 | 查角色 · 查伏笔 · 搜记忆 |
| Writer | 按规划写作，SSE 流式返给前端 | 查角色 · 搜记忆 · 查世界观 |
| Critic | 检查角色一致性、伏笔推进、字数 | 查角色 · 查伏笔 · 搜记忆 |

## 特性

### 已实现

| 模块 | 特性 | 状态 |
|------|------|:--:|
| **AI 写作** | 快速生成（续写/润色/扩写/重写） | ✅ |
| | Agent 深度生成（Planner → Writer → Critic） | ✅ |
| | SSE 流式输出 + 事件持久化 | ✅ |
| | 9 个固定工具（getCharacter/searchMemory…） | ✅ |
| | 36/run 工具调用预算 | ✅ |
| **项目系统** | CRUD + 软删除 + 两阶段创建 | ✅ |
| | JSON 导出/导入 + SQLite 导出 | ✅ |
| | PG → SQLite 懒迁移 | ✅ |
| **角色系统** | 完整档案（性格/外貌/背景/职业） | ✅ |
| | 角色关系 + 组织/派系 | ✅ |
| **大纲系统** | 大纲树 + 4 视图（时间线/看板/树状图/伏笔） | ✅ |
| **伏笔管理** | planted → hinted → resolved 状态追踪 | ✅ |
| **职业体系** | 自定义等级 + 角色分配 + 阶段晋升 | ✅ |
| **世界观** | 设定 + 条目管理 | ✅ |
| **向量记忆** | sqlite-vec · source_type 权重 · superseded 清理 | ✅ |
| **后处理管道** | AI 摘要提取 → 记忆提取 → embedding → 角色更新 | ✅ |
| **Prompt 工坊** | 社区模板浏览/搜索/一键导入 | ✅ |
| **灵感模式** | 5 种类别 · AI 批量生成 | ✅ |
| **拆书分析** | 上传小说 → AI 提取角色/结构/文风 | ✅ |
| **写作风格** | 自定义 + 项目默认 + 分 Agent 可覆写 | ✅ |
| **认证** | 邮箱注册/登录 + Linux DO OAuth | ✅ |
| **主题** | 5 主题 CSS 变量驱动（light/dark/midnight/forest/warm） | ✅ |
| **Agent 运行时** | 8 状态机 · checkpoint · 取消/恢复 · 事件持久化 | ✅ |
| **Worker** | 独立进程 · lock lease · 10min 超时回收 · 指数退避 | ✅ |
| **测试** | 51 个单元测试（工具/记忆/状态机/SQLite/路径安全） | ✅ |

### 路线图

| 优先级 | 计划 | 说明 |
|:------:|------|------|
| 🔴 | Agent 前端完善 | AgentTimeline 组件 · AIPanel 过程展示 · 取消按钮 |
| 🔴 | 实际运行调优 | 真机测试 Agent Loop 效果 · prompt 迭代 |
| 🟡 | 章节 Diff 对比 | 润色/重写后可视化差异 |
| 🟡 | 大纲拖拽排序 | 批量扩展（1 大纲 → N 章节计划） |
| 🟡 | 邮件验证 | 注册验证码 · 密码重置 |
| 🟢 | Go Worker 分支 | Agent 执行层用 Go 重写 · 支持多机部署 |
| 🟢 | 项目 Zip 导出 | metadata.json + data.db 打包下载 |

## 快速开始

```bash
# 1. PostgreSQL
sudo apt install postgresql
sudo -u postgres psql -c "CREATE USER moyun WITH PASSWORD 'moyun' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE moyun OWNER moyun;"

# 2. 后端 (http://localhost:3000)
cd ai-novel-backend
cp .env.example .env && npm install
npx drizzle-kit push && npx tsx src/db/seed
npm run dev

# 3. 前端 (http://localhost:5173)
cd ai-novel-vue
npm install && npm run dev

# 演示账号: demo@example.com / 123456
```

```bash
# Docker 一键部署
docker compose up -d
```

## 技术栈

| 层 | 技术 |
|----|------|
| 后端框架 | Fastify 5 + TypeScript |
| ORM | Drizzle ORM（PG + SQLite 双驱动） |
| 数据库 | PostgreSQL 16（SaaS 层）+ SQLite per-project（写作层） |
| 向量搜索 | sqlite-vec |
| AI 提供商 | OpenAI · Anthropic · Gemini |
| 嵌入模型 | text-embedding-3-small |
| 前端 | Vue 3 + Pinia |
| 样式 | 手写 CSS · CSS 变量驱动 |
| 测试 | Vitest · 51 个单元测试 |
| 部署 | Docker Compose |

## Author

**[6Leokk](https://github.com/6Leokk)**

## License

MIT
