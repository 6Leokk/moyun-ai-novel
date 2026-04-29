<p align="center">
  <img src="./ai-novel-vue/public/favicon.svg" width="88" height="88" alt="墨韵 AI Logo" />
</p>

<h1 align="center">墨韵 AI</h1>

<p align="center">
  面向长篇小说创作的全栈 AI 写作系统
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?style=flat-square&logo=vuedotjs&logoColor=white" alt="Vue 3.5" />
  <img src="https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify&logoColor=white" alt="Fastify 5" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.8" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/SQLite-vec-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite vec" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License" />
</p>

---

## ✨ 项目定位

墨韵 AI 不是简单的「输入 prompt、返回正文」工具，而是围绕长篇小说的持续创作流程设计：它把大纲、角色、世界观、伏笔、章节和长期记忆放进同一个创作系统里，再通过 Agent Loop 完成规划、写作、审稿和修订。

项目采用 **PostgreSQL + SQLite 双层存储**：

- **PostgreSQL** 保存 SaaS 侧数据，例如用户、项目、社区内容和用量统计。
- **SQLite** 为每个小说项目保存独立文件，承载章节、大纲、角色、伏笔、世界观和向量记忆。

这种设计让平台数据和作品数据边界清晰，也让单个项目具备更好的隔离、迁移和导出能力。

## 🧩 核心能力

| 能力 | 说明 |
| --- | --- |
| 快速写作 | 续写、润色、扩写、重写，支持 SSE 流式返回 |
| 深度生成 | Planner、Writer、Critic、Editor 四阶段 Agent Loop |
| 长期记忆 | 基于 sqlite-vec 的跨章节语义检索 |
| 内容管理 | 大纲、角色、伏笔、世界观、职业体系统一维护 |
| 社区功能 | Prompt 工坊、写作风格、灵感生成 |
| 管理后台 | 用户管理、项目审查、工坊审核、用量统计 |

## 🏗️ 系统架构

```text
┌─────────────────────┐
│      Vue 3 SPA       │
│  编辑器 / 项目 / 社区 │
└──────────┬──────────┘
           │ HTTP / SSE
           ▼
┌─────────────────────┐
│     Fastify API      │
│  Auth / Project / AI │
└──────┬────────┬──────┘
       │        │
       │        ▼
       │  ┌─────────────────────┐
       │  │   Agent Runtime      │
       │  │ Plan / Write / Check │
       │  └──────────┬──────────┘
       │             │
       ▼             ▼
┌──────────────┐  ┌─────────────────────┐
│ PostgreSQL   │  │ Project SQLite File  │
│ SaaS 数据     │  │ 作品数据 + 向量记忆   │
└──────────────┘  └─────────────────────┘
```

### 存储边界

| 层级 | 数据 | 隔离方式 |
| --- | --- | --- |
| SaaS 层 | 用户、项目元数据、社区、用量 | PostgreSQL 行级关联，按 `user_id` / `project_id` 查询 |
| 创作层 | 章节、大纲、角色、伏笔、世界观、记忆 | 每个项目一个 SQLite 文件，文件路径包含项目 UUID |
| 检索层 | 语义记忆、章节片段、角色设定 | sqlite-vec 与项目数据同文件存储 |

## 🤖 Agent 生成流程

```text
用户触发深度生成
      │
      ▼
Planner
读取大纲、角色、世界观、前文和伏笔，生成章节计划
      │
      ▼
Writer
通过固定工具读取项目上下文，并以 SSE 流式输出正文
      │
      ▼
Critic
检查角色一致性、伏笔推进、上下文衔接和字数约束
      │
      ▼
Editor
自动修复中等严重度问题，必要时重新进入 Critic
```

Agent Run 状态流转：

```text
queued -> running -> completed
                  -> failed
                  -> cancelling -> cancelled
                  -> interrupted -> running / failed
                  -> needs_manual_review -> completed / failed
```

## 🛠️ 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 | Vue 3.5、Vue Router、Pinia、Vite |
| 后端 | Fastify 5、TypeScript、Zod |
| 主数据库 | PostgreSQL、Drizzle ORM |
| 项目数据库 | SQLite、better-sqlite3、sqlite-vec |
| AI 接入 | OpenAI、Anthropic、Gemini |
| 流式输出 | Server-Sent Events |
| 测试 | Vitest |
| 部署 | Docker Compose |

## 🚀 快速开始

前置依赖：

- Node.js 20+
- PostgreSQL 16+
- npm

创建数据库：

```bash
sudo -u postgres psql -c "CREATE USER moyun WITH PASSWORD 'moyun' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE moyun OWNER moyun;"
```

启动后端：

```bash
cd ai-novel-backend
cp .env.example .env
npm install
npx drizzle-kit push
npx tsx src/db/seed
npm run dev
```

启动前端：

```bash
cd ai-novel-vue
npm install
npm run dev
```

演示账号：

```text
demo@example.com / 123456
```

## 📦 部署

前端 API 默认使用同源 `/api`，因此生产环境建议把前端静态资源和后端 API 放在同一个域名下，通过 Nginx、Caddy 或网关将 `/api` 反向代理到后端服务。

### 直接部署

适合已有服务器、数据库和进程管理工具的场景。

后端：

```bash
cd ai-novel-backend
cp .env.example .env
npm ci
npm run db:push
ADMIN_PASSWORD='your-secure-admin-password' npx tsx src/db/seed.ts
npm run build
npm run start
```

> 部署前必须把 `ADMIN_PASSWORD` 改成你自己的强密码，并妥善保存。管理员密码不会写进代码；seed 脚本只会读取环境变量来创建或更新唯一管理员账号。

生产环境至少需要检查这些变量：

```env
DATABASE_URL=postgres://moyun:your-password@127.0.0.1:5432/moyun
JWT_SECRET=replace-with-a-random-string-at-least-32-chars
ENCRYPTION_KEY=replace-with-exactly-32-bytes-key
NODE_ENV=production
ALLOWED_ORIGINS=https://your-domain.com
PROJECTS_DATA_DIR=/var/lib/moyun/projects
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=your-secure-admin-password
```

系统只保留一个管理员账号：`admin`。`trustLevel` 只表示普通用户等级和免费 token 档位，不会授予后台管理权限。

前端：

```bash
cd ai-novel-vue
npm ci
npm run build
```

将 `ai-novel-vue/dist` 部署为静态站点，并配置反向代理：

```nginx
location / {
  try_files $uri $uri/ /index.html;
}

location /api/ {
  proxy_pass http://127.0.0.1:3000/api/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Docker 部署

适合快速拉起 PostgreSQL 和后端服务的场景。当前 `docker-compose.yml` 包含 PostgreSQL 与后端，前端仍需要按“直接部署”的方式构建并发布静态资源。

```bash
export DB_PASSWORD=replace-with-strong-password
export JWT_SECRET=replace-with-a-random-string-at-least-32-chars
export ENCRYPTION_KEY=replace-with-exactly-32-bytes-key
export ADMIN_EMAIL=admin@your-domain.com
export ADMIN_PASSWORD=your-secure-admin-password
docker compose up -d
docker compose exec backend npx tsx src/db/seed.ts
```

> Docker 部署同样需要先替换 `ADMIN_PASSWORD`。如果后续要修改管理员密码，重新设置该环境变量后再执行一次 `docker compose exec backend npx tsx src/db/seed.ts`。

如需持久化每个项目的 SQLite 文件，建议在 Compose 中为后端增加数据卷，并设置 `PROJECTS_DATA_DIR` 指向该挂载目录。

## 📁 项目结构

```text
ai-novel-backend/
  src/app.ts              # Fastify 应用入口
  src/routes/             # Auth、Project、Chapter AI、Agent Runs、Admin 等 API
  src/services/           # Agent 编排、AI 接入、工具调用、记忆系统
  src/db/                 # PostgreSQL schema 与 SQLite 项目库管理
  src/workers/            # 后处理任务

ai-novel-vue/
  src/views/              # 页面视图
  src/components/         # 业务组件
  src/stores/             # Pinia 状态
  src/api/                # API 客户端
  public/favicon.svg      # 项目标识

docker-compose.yml        # 本地容器化部署
```

## 📄 协议

本项目采用 MIT 协议，详见 [LICENSE](./LICENSE)。
