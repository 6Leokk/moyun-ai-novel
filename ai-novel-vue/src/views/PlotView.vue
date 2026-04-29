<template>
  <div class="plot-page">
    <div class="plot-toolbar">
      <h2 class="page-title">🗺️ 剧情大纲</h2>
      <div class="toolbar-right">
        <div class="view-toggle">
          <button
            v-for="v in views"
            :key="v.key"
            class="view-btn"
            :class="{ active: activeView === v.key }"
            @click="activeView = v.key"
          >
            <span class="view-btn-icon">{{ v.icon }}</span>
            {{ v.label }}
          </button>
        </div>
        <button class="btn-primary" @click="showNewPlot = true">✨ AI生成剧情</button>
      </div>
    </div>

    <!-- Timeline View -->
    <div v-if="activeView === 'timeline'" class="plot-timeline">
      <div v-for="(arc, idx) in arcs" :key="arc.id" class="plot-arc" :style="{ animationDelay: idx * 0.1 + 's' }">
        <div class="plot-arc-dot" :style="{ borderColor: arc.color }"></div>
        <div class="plot-arc-header">
          <span class="plot-arc-title">{{ arc.emoji }} {{ arc.title }}</span>
          <span class="plot-arc-label" :class="'arc-' + arc.type">{{ arc.label }}</span>
        </div>
        <div class="plot-arc-cards">
          <div v-for="card in arc.cards" :key="card.id" class="plot-card" :class="{ 'plot-card-selected': selectedCardId === card.id }" @click="onPlotCardClick(card)">
            <div class="plot-card-chapter">{{ card.chapter }}</div>
            <h4 class="plot-card-title">{{ card.title }}</h4>
            <p class="plot-card-desc">{{ card.desc }}</p>
          </div>
          <div class="plot-card-add" @click="showNewPlot = true">
            <span class="add-icon">✨</span>
            <span class="add-text">AI生成后续</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Foreshadows View -->
    <div v-else-if="activeView === 'foreshadows'" class="foreshadow-view">
      <div class="fs-header-row">
        <span class="fs-count">共 {{ foreshadowsList.length }} 个伏笔 · {{ fsStats.unresolved }} 个待回收</span>
        <button class="btn-primary" @click="showNewFS = !showNewFS">{{ showNewFS ? '取消' : '+ 新增伏笔' }}</button>
      </div>
      <div v-if="showNewFS" class="fs-form">
        <input v-model="fsForm.title" class="form-input" placeholder="伏笔标题" />
        <textarea v-model="fsForm.description" class="form-input" rows="2" placeholder="描述"></textarea>
        <div class="fs-form-actions">
          <button class="btn-primary" @click="onCreateForeshadow">创建</button>
        </div>
      </div>
      <div class="fs-list">
        <div v-for="fs in foreshadowsList" :key="fs.id" class="fs-card" :class="'fs-' + fs.status">
          <div class="fs-dot" :style="{ background: fs.color }"></div>
          <div class="fs-body">
            <div class="fs-title">{{ fs.title }}</div>
            <div v-if="fs.description" class="fs-desc">{{ fs.description }}</div>
          </div>
          <div class="fs-status-badge" :class="fs.status">
            {{ fs.status === 'planted' ? '已埋' : fs.status === 'hinted' ? '暗示' : '已回收' }}
          </div>
          <button v-if="fs.status !== 'resolved'" class="btn-sm" @click="resolveForeshadow(fs.id)">标记回收</button>
          <button class="btn-sm btn-danger-sm" @click="deleteForeshadowAction(fs.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- Kanban View -->
    <div v-else-if="activeView === 'kanban'" class="plot-kanban">
      <div v-for="col in kanbanColumns" :key="col.key" class="kanban-column">
        <div class="kanban-col-header" :style="{ borderColor: col.color }">
          <span class="kanban-col-icon">{{ col.icon }}</span>
          <span class="kanban-col-title">{{ col.title }}</span>
          <span class="kanban-col-count">{{ col.items.length }}</span>
        </div>
        <div class="kanban-col-body">
          <div v-for="item in col.items" :key="item.id" class="kanban-card" @click="onPlotCardClick(item)">
            <div class="kanban-card-arc" :style="{ background: item.color }">{{ item.arcTitle }}</div>
            <h4 class="kanban-card-title">{{ item.title }}</h4>
            <p class="kanban-card-desc">{{ item.desc }}</p>
            <div v-if="item.chapterId" class="kanban-card-badge">📄 关联章节</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tree Diagram View -->
    <div v-else class="tree-container">
      <TreeDiagram :tree-data="plotTree" @select="onTreeNodeSelect" />
    </div>

    <Teleport to="body">
      <NewPlotModal
        v-if="showNewPlot"
        @close="showNewPlot = false"
        @ai-generate="onAIGeneratePlot"
      />
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useNovelStore } from '../stores/novel'
import { storeToRefs } from 'pinia'
import NewPlotModal from '../components/NewPlotModal.vue'
import TreeDiagram from '../components/TreeDiagram.vue'
import { getForeshadows, createForeshadow as apiCreateForeshadow, updateForeshadow, deleteForeshadow, getForeshadowStats } from '../api/novel.js'
import { useToastStore } from '../stores/toast.js'

const store = useNovelStore()
const { plotNodes, chapters } = storeToRefs(store)
const plotTree = computed(() => store.plotTree)

const showNewPlot = ref(false)
const activeView = ref('timeline')
const selectedCardId = ref(null)
const toast = useToastStore()

// ── Foreshadows ──
const foreshadowsList = ref([])
const fsStats = ref({ total: 0, unresolved: 0 })
const showNewFS = ref(false)
const fsForm = ref({ title: '', description: '' })

async function loadForeshadows() {
  const pid = store.project?.id
  if (!pid) return
  try {
    const [list, stats] = await Promise.all([
      getForeshadows(pid),
      getForeshadowStats(pid),
    ])
    foreshadowsList.value = list
    fsStats.value = stats
  } catch { /* offline */ }
}

async function onCreateForeshadow() {
  const pid = store.project?.id
  if (!pid || !fsForm.value.title) return
  try {
    await apiCreateForeshadow(pid, { ...fsForm.value })
    fsForm.value = { title: '', description: '' }
    showNewFS.value = false
    await loadForeshadows()
    toast.success('伏笔已创建')
  } catch (e) { toast.error('创建失败: ' + e.message) }
}

async function resolveForeshadow(id) {
  try {
    await updateForeshadow(id, { status: 'resolved' })
    await loadForeshadows()
    toast.success('已标记为回收')
  } catch (e) { toast.error('操作失败: ' + e.message) }
}

async function deleteForeshadowAction(id) {
  try {
    await deleteForeshadow(id)
    await loadForeshadows()
  } catch { /* offline */ }
}

onMounted(() => { loadForeshadows() })

function onAIGeneratePlot(form) {
  showNewPlot.value = false
  store.addPlotNode({
    id: 'plot' + Date.now(),
    parentId: null,
    title: form.type + '：由AI生成',
    desc: form.direction || 'AI生成的剧情节点',
    type: form.type === '主线推进' ? 'main' : form.type === '情感暗线' ? 'romance' : 'sub',
    chapterId: null,
    emoji: '✨',
    color: '#5a7d94'
  })
}

const views = [
  { key: 'timeline', icon: '📋', label: '时间线' },
  { key: 'kanban', icon: '📊', label: '看板' },
  { key: 'tree', icon: '🌳', label: '树状图' },
  { key: 'foreshadows', icon: '🔮', label: '伏笔' },
]

// Build timeline arcs from plotNodes
const arcs = computed(() => {
  const arcNodes = plotNodes.value.filter(n => !n.parentId)
  const typeLabels = { main: '主线', sub: '支线', romance: '情感' }
  const typeEmojis = { main: '🔱', sub: '🦋', romance: '💫' }
  return arcNodes.map(arc => {
    const scenes = plotNodes.value.filter(n => n.parentId === arc.id)
    return {
      id: arc.id,
      title: arc.title,
      type: arc.type,
      label: typeLabels[arc.type] || arc.type,
      emoji: arc.emoji || typeEmojis[arc.type] || '📌',
      color: arc.color,
      cards: scenes.map(scene => ({
        id: scene.id,
        title: scene.title,
        desc: scene.desc,
        chapter: scene.chapterId
          ? `第${chapters.value.find(c => c.id === scene.chapterId)?.num || '?'}章`
          : '未关联章节'
      }))
    }
  })
})

// Build kanban columns grouped by arc
const kanbanColumns = computed(() => {
  const arcNodes = plotNodes.value.filter(n => !n.parentId)
  const typeConfig = {
    main: { icon: '🔱', color: '#5a7d94' },
    sub: { icon: '🦋', color: '#2b6ea5' },
    romance: { icon: '💫', color: '#8a3a4a' }
  }
  const defaultConf = { icon: '📌', color: '#64748b' }
  return arcNodes.map(arc => {
    const conf = typeConfig[arc.type] || defaultConf
    const scenes = plotNodes.value.filter(n => n.parentId === arc.id)
    return {
      key: arc.id,
      title: arc.title,
      ...conf,
      items: scenes.map(s => ({
        id: s.id,
        title: s.title,
        desc: s.desc,
        color: arc.color,
        arcTitle: arc.title.split('：').pop() || arc.title,
        chapterId: s.chapterId
      }))
    }
  })
})

function onPlotCardClick(card) {
  const chapterId = card.chapterId
  if (chapterId) {
    // 高亮选中的卡片 — 用 router 跳转到编辑器
    // 因为编辑器现在只支持固定章节，这里先标记选中
    selectedCardId.value = card.id
  }
}

function onTreeNodeSelect(node) {
  if (node.chapterId) {
    selectedCardId.value = node.id
  }
}
</script>

<style scoped>
.plot-page {
  animation: fadeIn 0.3s ease;
}

.plot-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 26px;
}

.page-title {
  font-size: 15px;
  font-weight: 600;
}

.toolbar-right {
  display: flex;
  gap: 15px;
  align-items: center;
}

.view-toggle {
  display: flex;
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.view-btn {
  padding: 5px 16px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 15px;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: inherit;
}

.view-btn.active {
  background: var(--accent);
  color: white;
}

.view-btn-icon {
  font-size: 15px;
}

.btn-primary {
  padding: 7px 16px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  border: none;
  color: white;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

.btn-primary:hover {
  background: var(--accent-light);
  
}

/* Timeline */
.plot-timeline {
  position: relative;
  padding-left: 28px;
}

.plot-timeline::before {
  content: '';
  position: absolute;
  left: 11px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--border-color);
}

.plot-arc {
  margin-bottom: 28px;
  position: relative;
  animation: slideUp 0.4s ease both;
}

.plot-arc-dot {
  position: absolute;
  left: -24px;
  top: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  background: var(--bg-deepest);
}

.plot-arc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 15px;
}

.plot-arc-title {
  font-size: 15px;
  font-weight: 600;
}

.plot-arc-label {
  padding: 2px 12px;
  border-radius: var(--radius-sm);
  font-size: 15px;
  font-weight: 600;
}

.arc-main { background: rgba(74,109,122,0.15); color: var(--accent-light); }
.arc-sub { background: rgba(43,110,165,0.15); color: var(--accent-blue); }
.arc-romance { background: rgba(138,58,74,0.15); color: var(--accent-rose); }

.plot-arc-cards {
  display: flex;
  gap: 15px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.plot-card {
  min-width: 190px;
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  padding: 16px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all var(--transition-normal);
  flex-shrink: 0;
}

.plot-card:hover {
  border-color: var(--accent);
  transform: none;
  box-shadow: none;
}

.plot-card-selected {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 2px rgba(74, 109, 122, 0.2) !important;
}

.plot-card-chapter {
  font-size: 15px;
  color: var(--text-muted);
  margin-bottom: 5px;
  font-weight: 500;
}

.plot-card-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 5px;
}

.plot-card-desc {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.65;
}

.plot-card-add {
  min-width: 140px;
  background: var(--bg-secondary);
  border: 2px dashed var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  padding: 16px;
  transition: all var(--transition-normal);
  flex-shrink: 0;
}

.plot-card-add:hover {
  border-color: var(--accent);
  color: var(--accent-light);
}

.add-icon { font-size: 15px; }
.add-text { font-size: 15px; }

/* Kanban View */
.plot-kanban {
  display: flex;
  gap: 18px;
  overflow-x: auto;
  padding-bottom: 8px;
  min-height: 400px;
}

.kanban-column {
  min-width: 260px;
  flex: 1;
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.kanban-col-header {
  padding: 16px 18px;
  border-bottom: 2px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 8px;
}

.kanban-col-icon {
  font-size: 15px;
}

.kanban-col-title {
  font-size: 15px;
  font-weight: 600;
  flex: 1;
}

.kanban-col-count {
  padding: 1px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  font-size: 15px;
  color: var(--text-muted);
}

.kanban-col-body {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.kanban-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  padding: 15px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all var(--transition-normal);
}

.kanban-card:hover {
  border-color: var(--accent);
  transform: none;
}

.kanban-card-arc {
  display: inline-block;
  padding: 1px 8px;
  border-radius: var(--radius-sm);
  font-size: 15px;
  color: white;
  margin-bottom: 6px;
  font-weight: 500;
}

.kanban-card-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}

.kanban-card-desc {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.6;
}

.kanban-card-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: rgba(74, 109, 122, 0.12);
  color: var(--accent-light);
  font-size: 15px;
  margin-top: 6px;
}

/* Tree Container */
.tree-container {
  height: calc(100vh - 180px);
  min-height: 500px;
}

/* Foreshadows */
.foreshadow-view {
  animation: fadeSlideUp 0.3s ease;
}

.fs-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.fs-count {
  font-size: 14px;
  color: var(--text-muted);
}

.fs-form {
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  padding: 14px;
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fs-form-actions {
  display: flex;
  justify-content: flex-end;
}

.fs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fs-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  transition: all var(--transition-fast);
}

.fs-card.fs-resolved {
  opacity: 0.5;
}

.fs-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.fs-body {
  flex: 1;
  min-width: 0;
}

.fs-title {
  font-size: 14px;
  font-weight: 500;
}

.fs-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.fs-status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  flex-shrink: 0;
}

.fs-status-badge.planted { background: rgba(240,160,64,0.12); color: #f0a040; }
.fs-status-badge.hinted { background: rgba(100,160,220,0.12); color: #64a0dc; }
.fs-status-badge.resolved { background: rgba(100,200,100,0.12); color: #64c864; }
</style>
