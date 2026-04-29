<template>
  <div class="dashboard">
    <!-- Hero Banner -->
    <div class="dashboard-hero">
      <div class="hero-content">
        <h1 class="hero-title">欢迎回来，创作者 <span class="hero-sparkle">✨</span></h1>
        <p class="hero-subtitle">让AI成为你的写作伙伴，一起构建属于你的文学世界</p>
        <div class="hero-actions">
          <button class="hero-btn primary" @click="showNewProject = true">
            <span>✨</span> 开始创作
          </button>
          <button class="hero-btn" @click="$router.push('/editor')">
            <span>📖</span> 继续写作
          </button>
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div v-for="stat in stats" :key="stat.label" class="stat-card">
        <div class="stat-icon-wrapper" :style="{ background: stat.iconBg }">
          <span class="stat-icon">{{ stat.icon }}</span>
        </div>
        <div class="stat-info">
          <div class="stat-label">{{ stat.label }}</div>
          <div class="stat-value">{{ stat.displayValue }}</div>
          <div class="stat-change" :class="stat.trend">{{ stat.change }}</div>
        </div>
      </div>
    </div>

    <!-- Projects -->
    <div class="section-header">
      <h2 class="section-title">📚 我的作品</h2>
      <button class="section-action" @click="showNewProject = true">+ 新建</button>
    </div>
    <div class="projects-grid">
      <div
        v-for="project in projects"
        :key="project.name"
        class="project-card"
        @click="onSelectProject(project)"
      >
        <div class="project-cover" :style="{ background: project.coverGradient }">
          <div class="cover-genre" :class="project.genreClass">{{ project.genre }}</div>
        </div>
        <div class="project-body">
          <h3 class="project-name">{{ project.name }}</h3>
          <p class="project-desc">{{ project.desc }}</p>
          <div class="project-progress">
            <div class="progress-track">
              <div class="progress-bar" :style="{ width: project.progress + '%' }"></div>
            </div>
          </div>
          <div class="project-meta">
            <span>{{ project.chapters }}</span>
            <span>{{ project.words }}字</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Activity -->
    <div class="recent-section">
      <div class="recent-card">
        <h3 class="recent-title">🕐 最近编辑</h3>
        <div v-for="item in recentEdits" :key="item.title" class="recent-item">
          <div class="recent-item-icon" :style="{ background: item.bg }">{{ item.icon }}</div>
          <div class="recent-item-info">
            <div class="recent-item-title">{{ item.title }}</div>
            <div class="recent-item-sub">{{ item.sub }}</div>
          </div>
        </div>
      </div>
      <div class="recent-card">
        <h3 class="recent-title">🤖 AI助手最近</h3>
        <div v-for="item in recentAI" :key="item.title" class="recent-item">
          <div class="recent-item-icon ai-icon" :style="{ background: item.bg }">{{ item.icon }}</div>
          <div class="recent-item-info">
            <div class="recent-item-title">{{ item.title }}</div>
            <div class="recent-item-sub">{{ item.sub }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Inspiration Panel -->
    <div v-if="novelStore.project" class="inspiration-section">
      <div class="section-header">
        <h2 class="section-title">💡 创作灵感</h2>
      </div>
      <div class="inspiration-controls">
        <select v-model="inspCategory" class="insp-select">
          <option value="idea">剧情创意</option>
          <option value="plot_twist">情节反转</option>
          <option value="dialogue">对话片段</option>
          <option value="scene">场景描写</option>
          <option value="character">角色发展</option>
        </select>
        <select v-model="inspCount" class="insp-select insp-count">
          <option :value="1">1个</option>
          <option :value="2">2个</option>
          <option :value="3">3个</option>
          <option :value="5">5个</option>
        </select>
        <button class="hero-btn primary" :disabled="inspGenerating" @click="onGenerateInspirations">
          {{ inspGenerating ? '生成中...' : '✨ 生成灵感' }}
        </button>
      </div>
      <div v-if="inspirations.length > 0" class="inspiration-list">
        <div v-for="insp in inspirations" :key="insp.id" class="inspiration-card">
          <div class="inspiration-content">{{ insp.content }}</div>
          <button class="inspiration-delete" @click="onDeleteInspiration(insp.id)">✕</button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <NewProjectModal
        v-if="showNewProject"
        @close="showNewProject = false"
        @create="onCreateProject"
        @ai-generate="onAIGenerateProject"
      />
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import NewProjectModal from '../components/NewProjectModal.vue'
import { useNovelStore } from '../stores/novel'
import * as novelApi from '../api/novel.js'

const router = useRouter()
const showNewProject = ref(false)
const novelStore = useNovelStore()
const projectsList = ref([])
const loading = ref(true)

const genreClassMap = { '科幻': 'genre-scifi', '奇幻': 'genre-fantasy', '悬疑': 'genre-mystery' }

const stats = computed(() => {
  const p = novelStore.project
  const cs = novelStore.chapterStats
  return [
    { icon: '📝', label: '总字数', displayValue: (novelStore.totalWords || 0).toLocaleString(), change: p ? `目标 ${((p.targetWords || 0) / 10000).toFixed(0)}万` : '', trend: 'up', iconBg: 'rgba(74,109,122,0.12)' },
    { icon: '📖', label: '已完成章节', displayValue: `${cs.done || 0}`, change: `共 ${cs.total || 0} 章`, trend: 'up', iconBg: 'rgba(43,110,165,0.12)' },
    { icon: '👤', label: '角色数量', displayValue: `${novelStore.characters.length}`, change: `${novelStore.relationships.length} 关系`, trend: 'up', iconBg: 'rgba(42,122,138,0.12)' },
    { icon: '🔥', label: '完成度', displayValue: `${novelStore.completionRate || 0}%`, change: novelStore.completionRate > 0 ? '持续推进' : '刚刚开始', trend: 'up', iconBg: 'rgba(154,107,30,0.12)' }
  ]
})

const recentEdits = computed(() => {
  return novelStore.chapters.slice(-3).reverse().map(ch => ({
    icon: '📄', title: `第${ch.num}章：${ch.title}`, sub: novelStore.project?.title || '', bg: 'rgba(74,109,122,0.12)'
  }))
})

const recentAI = [
  { icon: '💬', title: '为角色生成对话风格', sub: 'AI创作 · 刚刚', bg: 'linear-gradient(135deg, rgba(74,109,122,0.15), rgba(61,90,110,0.15))' },
  { icon: '✨', title: '续写章节内容', sub: 'AI续写 · 最近', bg: 'linear-gradient(135deg, rgba(74,109,122,0.15), rgba(61,90,110,0.15))' },
  { icon: '🔧', title: '优化世界观设定', sub: 'AI润色 · 最近', bg: 'linear-gradient(135deg, rgba(74,109,122,0.15), rgba(61,90,110,0.15))' }
]

const projects = computed(() => {
  return projectsList.value.map(p => ({
    name: p.title,
    desc: `${p.genre || '未分类'}小说`,
    genre: p.genre || '未分类',
    genreClass: genreClassMap[p.genre] || 'genre-scifi',
    coverGradient: p.coverGradient || 'linear-gradient(135deg, #0e0e10, #1a1a1c, #2a2a2d)',
    progress: p.targetWords ? Math.round(((p.id === novelStore.project?.id ? novelStore.totalWords : 0) / p.targetWords) * 100) : 0,
    chapters: `${p.id === novelStore.project?.id ? novelStore.chapterStats.total : '?'}章`,
    words: (p.id === novelStore.project?.id ? novelStore.totalWords : 0).toLocaleString(),
    id: p.id
  }))
})

onMounted(async () => {
  try {
    const data = await novelApi.getProjects()
    projectsList.value = data.projects || []
    if (projectsList.value.length > 0) {
      await novelStore.loadAll(projectsList.value[0].id)
    }
  } catch (e) {
    console.error('Failed to load projects:', e)
  } finally {
    loading.value = false
  }
})

async function onCreateProject(form) {
  showNewProject.value = false
  try {
    const data = await novelApi.createProject({ title: form.name, genre: form.genre })
    projectsList.value.push(data.project)
    await novelStore.loadAll(data.project.id)
    router.push('/editor')
  } catch (e) {
    console.error('Failed to create project:', e)
  }
}

async function onSelectProject(project) {
  if (project.id && project.id !== novelStore.project?.id) {
    await novelStore.loadAll(project.id)
  }
  router.push('/editor')
}

function onAIGenerateProject(form) {
  showNewProject.value = false
}

// ── Inspirations ──
const inspirations = ref([])
const inspCategory = ref('idea')
const inspCount = ref(3)
const inspGenerating = ref(false)

async function loadInspirations() {
  const pid = novelStore.project?.id
  if (!pid) return
  try {
    inspirations.value = await novelApi.getInspirations(pid)
  } catch { /* offline */ }
}

async function onGenerateInspirations() {
  const pid = novelStore.project?.id
  if (!pid) return
  inspGenerating.value = true
  try {
    const data = await novelApi.generateInspirations(pid, inspCategory.value, inspCount.value)
    if (Array.isArray(data)) {
      inspirations.value = [...data.reverse(), ...inspirations.value]
    }
  } catch (e) {
    console.error('Inspiration generation failed:', e)
  } finally {
    inspGenerating.value = false
  }
}

async function onDeleteInspiration(id) {
  try {
    await novelApi.deleteInspiration(id)
    inspirations.value = inspirations.value.filter(i => i.id !== id)
  } catch { /* offline */ }
}

onMounted(() => { loadInspirations() })
</script>

<style scoped>
.dashboard {
  animation: fadeIn 0.3s ease;
}

/* Hero */
.dashboard-hero {
  background: var(--gradient-hero);
  border-radius: var(--radius-sm);
  padding: 36px 32px;
  margin-bottom: 26px;
  border: 1px solid var(--border-color);
}

.hero-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
}

.hero-sparkle {
  display: inline-block;
  animation: float 2s ease-in-out infinite;
}

.hero-subtitle {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 22px;
}

.hero-actions {
  display: flex;
  gap: 12px;
}

.hero-btn {
  padding: 11px 20px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
}

.hero-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.hero-btn.primary {
  background: var(--gradient-brand);
  border-color: transparent;
  color: white;
}

.hero-btn.primary:hover {
  box-shadow: var(--shadow-md);
}

/* Stats */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 28px;
}

.stat-card {
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  padding: 20px;
  border: 1px solid var(--border-color);
  display: flex;
  gap: 16px;
  align-items: flex-start;
  transition: border-color 0.15s;
  cursor: default;
}

.stat-card:hover {
  border-color: var(--accent);
}

.stat-icon-wrapper {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon {
  font-size: 15px;
}

.stat-info {
  flex: 1;
  min-width: 0;
}

.stat-label {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 4px;
  font-weight: 500;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--text-primary), var(--text-accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1.2;
}

.stat-change {
  font-size: 13px;
  margin-top: 4px;
  font-weight: 500;
}

.stat-change.up { color: var(--accent-green); }
.stat-change.down { color: var(--accent-rose); }

/* Section Header */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
}

.section-action {
  padding: 5px 15px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: border-color 0.12s;
  font-family: inherit;
}

.section-action:hover {
  border-color: var(--accent);
  color: var(--text-accent);
}

/* Projects */
.projects-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin-bottom: 28px;
}

.project-card {
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s;
}

.project-card:hover {
  border-color: var(--accent);
}

.project-cover {
  height: 110px;
  position: relative;
  padding: 12px;
}

.cover-genre {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 3px 12px;
  border-radius: var(--radius-sm);
  font-size: 15px;
  font-weight: 600;
  z-index: 1;
  /* backdrop-filter: blur(8px); */
}

.genre-scifi { background: rgba(42,122,138,0.2); color: var(--accent-cyan); }
.genre-fantasy { background: rgba(74,109,122,0.2); color: var(--accent-light); }
.genre-mystery { background: rgba(154,107,30,0.2); color: var(--accent-amber); }

.project-body {
  padding: 18px 20px 20px;
}

.project-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.project-desc {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.6;
  margin-bottom: 15px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.project-progress {
  margin-bottom: 6px;
}

.progress-track {
  height: 3px;
  background: var(--bg-hover);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 2px;
  background: var(--gradient-brand);
}

.project-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-muted);
}

/* Recent */
.recent-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.recent-card {
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  padding: 20px;
  border: 1px solid var(--border-color);
}

.recent-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 15px;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: padding-left 0.12s;
}

.recent-item:last-child { border-bottom: none; }
.recent-item:hover { padding-left: 4px; }

.recent-item-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}

.recent-item-info { flex: 1; min-width: 0; }

.recent-item-title {
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-item-sub {
  font-size: 14px;
  color: var(--text-muted);
  margin-top: 1px;
}

/* Inspiration Panel */
.inspiration-section {
  margin-bottom: 26px;
}

.inspiration-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 14px;
}

.insp-select {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
}

.insp-count {
  width: 70px;
}

.inspiration-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inspiration-card {
  background: linear-gradient(135deg, rgba(74,109,122,0.08), rgba(61,90,110,0.04));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  animation: fadeSlideUp 0.3s ease;
}

.inspiration-content {
  flex: 1;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
}

.inspiration-delete {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.inspiration-delete:hover {
  background: rgba(200, 80, 80, 0.1);
  color: rgba(220, 100, 100, 0.8);
}
</style>