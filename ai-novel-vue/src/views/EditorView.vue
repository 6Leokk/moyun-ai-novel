<template>
  <div class="editor-layout">
    <!-- Chapter Sidebar -->
    <div class="editor-sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">📖 章节目录</span>
        <button class="add-btn" @click="showNewChapter = true">+</button>
      </div>
      <div class="chapter-list">
        <div
          v-for="ch in chapters"
          :key="ch.id"
          class="chapter-item"
          :class="{ active: activeChapterId === ch.id }"
          @click="activeChapterId = ch.id"
        >
          <span class="chapter-num">{{ String(ch.num).padStart(2, '0') }}</span>
          <span class="chapter-name">{{ ch.name }}</span>
          <span class="chapter-status" :class="ch.status"></span>
        </div>
      </div>
      <div class="sidebar-stats">
        <div class="sidebar-stat">
          <span class="stat-dot green"></span>
          已完成 {{ chapterStats.done }}
        </div>
        <div class="sidebar-stat">
          <span class="stat-dot amber"></span>
          写作中 {{ chapterStats.writing }}
        </div>
        <div class="sidebar-stat">
          <span class="stat-dot gray"></span>
          草稿 {{ chapterStats.draft }}
        </div>
      </div>
    </div>

    <!-- Plan Review Banner -->
    <div v-if="showPlanReview" class="plan-review-banner">
      <div class="plan-review-header">📋 规划审核 — 请确认场景规划</div>
      <div class="plan-review-body">
        <div v-if="agentStore.currentPlan">
          <div class="plan-goal">{{ agentStore.currentPlan.chapterGoal }}</div>
          <div v-for="s in (agentStore.currentPlan.scenes || [])" :key="s.id" class="plan-scene">
            <strong>{{ s.title }}</strong> ({{ s.expectedWords }}字) — {{ s.characters?.join(', ') }}
            <div class="plan-beats">{{ s.beats?.join(' → ') }}</div>
          </div>
        </div>
      </div>
      <div class="plan-review-actions">
        <button class="btn btn-primary" @click="confirmPlan">✅ 确认规划，开始写作</button>
        <button class="btn" @click="showPlanReview = false">暂不确认（稍后自动继续）</button>
      </div>
    </div>

    <!-- Agent Progress Bar -->
    <AgentProgressBar
      @accept="onAcceptRun"
      @discard="onDiscardRun"
    />

    <!-- Editor Main -->
    <div class="editor-main">
      <div class="editor-toolbar">
        <div class="toolbar-left">
          <button
            v-for="tab in editorTabs"
            :key="tab"
            class="toolbar-btn"
            :class="{ active: activeTab === tab }"
            @click="activeTab = tab"
          >{{ tab }}</button>
          <div class="toolbar-divider"></div>
          <button class="toolbar-btn ai-action" @click="aiAction('续写')">快速续写</button>
          <button class="toolbar-btn ai-action" @click="aiAction('润色')">✨ 润色</button>
          <button class="toolbar-btn ai-action" @click="aiAction('扩写')">📖 扩写</button>
          <div class="toolbar-divider"></div>
          <button
            class="toolbar-btn ai-action deep"
            :disabled="agentStore.isActive && agentStore.phase !== 'writing'"
            @click="agentStore.isActive ? onCancelDeepGenerate() : onDeepGenerate()"
            :title="agentStore.isActive ? '点击取消深度生成' : '启动 AI Agent 深度生成'"
          >{{ agentStore.isActive ? '⏹ 取消 (' + (agentStore.phase || '...') + ')' : '🤖 深度生成' }}</button>
          <div class="toolbar-divider"></div>
          <button class="toolbar-btn" @click="undo">↩️</button>
          <button class="toolbar-btn" @click="redo">↪️</button>
        </div>
        <div class="toolbar-right">
          <button class="toolbar-btn" @click="toggleFullscreen">⛶ 全屏</button>
        </div>
      </div>

      <div class="editor-content">
        <div class="editor-paper">
          <input
            v-model="chapterTitle"
            class="chapter-title-input"
            placeholder="章节标题..."
            @change="onTitleChange"
          />
          <textarea
            ref="textareaRef"
            v-model="editorContent"
            class="editor-textarea"
            placeholder="开始写作..."
            @input="updateWordCount"
          ></textarea>
        </div>
      </div>

      <div class="editor-footer">
        <div class="footer-left">
          <span>字数：<strong>{{ wordCount.toLocaleString() }}</strong></span>
          <span class="footer-divider">|</span>
          <span>段落：{{ paragraphCount }}</span>
          <span class="footer-divider">|</span>
          <span>预计阅读：{{ readingTime }}分钟</span>
        </div>
        <div class="footer-right">
          <span class="save-indicator" :class="{ saved: autoSaved }">
            <span class="save-dot"></span>
            {{ autoSaved ? '已自动保存' : '编辑中...' }}
          </span>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <NewChapterModal
        v-if="showNewChapter"
        @close="showNewChapter = false"
        @create="onCreateChapter"
        @ai-generate="onAIGenerateChapter"
      />
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useNovelStore } from '../stores/novel'
import { useAIStore } from '../stores/ai'
import { useAgentStore } from '../stores/agent'
import { generateAgent, cancelAgentRun, acceptAgentRun, discardAgentRun } from '../api/novel'
import { api } from '../api/index'
import { storeToRefs } from 'pinia'
import { useToastStore } from '../stores/toast'
import NewChapterModal from '../components/NewChapterModal.vue'
import AgentProgressBar from '../components/AgentProgressBar.vue'

const novelStore = useNovelStore()
const { chapters: storeChapters } = storeToRefs(novelStore)
const chapterStats = computed(() => novelStore.chapterStats)
const aiStore = useAIStore()
const { openPanel, sendMessage } = aiStore
const agentStore = useAgentStore()
const toast = useToastStore()
const showPlanReview = ref(false)

async function confirmPlan() {
  if (!agentStore.currentRunId) return
  try {
    await api.post(`/agent-runs/${agentStore.currentRunId}/confirm-plan`)
    showPlanReview.value = false
    toast.success('规划已确认，继续生成')
  } catch { toast.error('确认失败') }
}

// ── Deep Generation ──
async function onDeepGenerate() {
  if (!activeChapterId.value || agentStore.isActive) return

  const idempotencyKey = crypto.randomUUID()
  agentStore.setRun(null, 'queued', 'planning')

  try {
    await generateAgent(activeChapterId.value, {
      mode: 'generate',
      idempotencyKey,
    }, {
      onChunk(text, evt) {
        editorContent.value += text
        updateWordCount()
      },
      onPhase(evt) {
        agentStore.updatePhase(evt.phase, evt.status)
        if (evt.status === 'awaiting_review') showPlanReview.value = true
      },
      onPlanReady(evt) {
        agentStore.currentPlan = evt.plan
        agentStore.addEvent({ eventType: 'agent:plan_ready', payload: evt })
        showPlanReview.value = true
      },
      onScene(evt) {
        agentStore.addEvent(evt)
      },
      onTool(evt) {
        agentStore.addEvent(evt)
        if (evt.action === 'call') openPanel() // Show AIPanel on tool calls
      },
      onResult(evt) {
        agentStore.setIssues(evt.issues)
        agentStore.addEvent(evt)
        const hasHigh = evt.issues?.some(i => i.severity === 'high')
        if (evt.issues?.length > 0) {
          agentStore.updatePhase(null, hasHigh ? 'needs_manual_review' : 'completed')
          if (hasHigh) {
            toast.warning('深度生成完成，审稿发现严重问题需手动处理')
          } else {
            toast.success(`深度生成完成，${evt.wordCount?.toLocaleString() || 0} 字`)
          }
        } else {
          agentStore.updatePhase(null, 'completed')
          toast.success(`深度生成完成，${evt.wordCount?.toLocaleString() || 0} 字`)
        }
      },
      onError(msg) {
        agentStore.setError(msg)
        toast.error(msg)
      },
    })
  } catch (e) {
    agentStore.setError(e.message || '深度生成失败')
  }
}

async function onAcceptRun() {
  if (!agentStore.currentRunId) return
  await acceptAgentRun(agentStore.currentRunId)
  agentStore.reset()
}

async function onDiscardRun() {
  if (!agentStore.currentRunId) return
  await discardAgentRun(agentStore.currentRunId)
  agentStore.reset()
}

function onCancelDeepGenerate() {
  if (agentStore.currentRunId) {
    cancelAgentRun(agentStore.currentRunId)
    agentStore.updatePhase(null, 'cancelling')
  }
}

// Restore active run on page load
onMounted(async () => {
  if (storeChapters.value.length > 0) {
    const firstWriting = storeChapters.value.find(c => c.status === 'writing')
    const first = firstWriting || storeChapters.value[0]
    activeChapterId.value = first.id
  }

  // Check for active agent run on this chapter
  if (activeChapterId.value) {
    try {
      const { api } = await import('../api/index.js')
      const data = await api.get(`/agent-runs?chapterId=${activeChapterId.value}&status=running,cancelling`)
      if (Array.isArray(data) && data.length > 0) {
        const run = data[0]
        agentStore.setRun(run.id, run.status, run.phase)
        if (run.resultData?.issues) agentStore.setIssues(run.resultData.issues)
      }
    } catch { /* no active run */ }
  }
})

const showNewChapter = ref(false)
const activeChapterId = ref(null)
const activeTab = ref('📝 正文')
const editorTabs = ['📝 正文', '📋 大纲', '💬 备注']
const chapterTitle = ref('')
const editorContent = ref('')
const loadingContent = ref(false)

async function onCreateChapter(form) {
  showNewChapter.value = false
  if (!form.title) return
  const chapter = await novelStore.addChapter({ title: form.title })
  if (chapter) {
    activeChapterId.value = chapter.id
    await loadChapterContent(chapter.id)
  }
}

function onAIGenerateChapter(form) {
  showNewChapter.value = false
  // AI chapter generation will be implemented in Phase 3
}

async function loadChapterContent(chapterId) {
  loadingContent.value = true
  const content = await novelStore.loadChapterContent(chapterId)
  editorContent.value = content || ''
  chapterTitle.value = storeChapters.value.find(c => c.id === chapterId)?.title || ''
  previousContent = editorContent.value
  loadingContent.value = false
  adjustHeight()
}

const textareaRef = ref(null)
const autoSaved = ref(true)

// 撤销/重做栈
const undoStack = ref([])
const redoStack = ref([])
const isUndoing = ref(false)
let previousContent = ''

const adjustHeight = () => {
  const el = textareaRef.value
  if (!el) return
  const container = el.closest('.editor-content')
  const scrollTop = container ? container.scrollTop : 0
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
  if (container) container.scrollTop = scrollTop
}

onMounted(() => {
  if (storeChapters.value.length > 0) {
    const firstWriting = storeChapters.value.find(c => c.status === 'writing')
    const first = firstWriting || storeChapters.value[0]
    activeChapterId.value = first.id
  }
})

watch(activeChapterId, async (newId) => {
  if (newId) await loadChapterContent(newId)
})

const chapters = computed(() =>
  storeChapters.value.map(ch => ({
    num: ch.num,
    name: ch.title,
    status: ch.status,
    id: ch.id
  }))
)

function getChapterStatusLabel(status) {
  return status === 'done' ? '✓' : status === 'writing' ? '…' : ''
}

const wordCount = computed(() => {
  const text = editorContent.value
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const englishWords = (text.replace(/[\u4e00-\u9fff]/g, '').match(/\b[a-zA-Z]+\b/g) || []).length
  return chineseChars + englishWords
})

const paragraphCount = computed(() => {
  return editorContent.value.split('\n').filter(l => l.trim()).length
})

const readingTime = computed(() => {
  return Math.max(1, Math.ceil(wordCount.value / 500))
})

let editTimer = null
function updateWordCount() {
  autoSaved.value = false
  adjustHeight()
  if (!isUndoing.value) {
    undoStack.value.push(previousContent)
    if (undoStack.value.length > 50) undoStack.value.shift()
    previousContent = editorContent.value
  }
  clearTimeout(editTimer)
  editTimer = setTimeout(() => {
    if (activeChapterId.value) {
      novelStore.saveChapterContent(activeChapterId.value, editorContent.value)
    }
    autoSaved.value = true
  }, 2000)
}

function undo() {
  if (undoStack.value.length === 0) return
  isUndoing.value = true
  redoStack.value.push(editorContent.value)
  const prev = undoStack.value.pop()
  previousContent = prev
  editorContent.value = prev
  isUndoing.value = false
  adjustHeight()
}

function redo() {
  if (redoStack.value.length === 0) return
  isUndoing.value = true
  undoStack.value.push(previousContent)
  const next = redoStack.value.pop()
  previousContent = next
  editorContent.value = next
  isUndoing.value = false
  adjustHeight()
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.()
  } else {
    document.exitFullscreen?.()
  }
}

function aiAction(type) {
  openPanel()
  sendMessage(`请${type}当前章节的后续内容`)
}

function onTitleChange() {
  if (activeChapterId.value && chapterTitle.value) {
    novelStore.updateChapter(activeChapterId.value, { title: chapterTitle.value })
  }
}
</script>

<style scoped>
.editor-layout {
  display: flex;
  height: calc(100vh - var(--topbar-height));
  animation: fadeIn 0.2s ease;
}

/* Chapter Sidebar */
.editor-sidebar {
  width: 240px;
  min-width: 240px;
  background: var(--bg-primary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
}

.add-btn {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.add-btn:hover {
  border-color: var(--accent);
  color: var(--text-accent);
}

.chapter-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
}

.chapter-item {
  padding: 11px 15px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-bottom: 1px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.chapter-item:hover { background: var(--bg-hover); }

.chapter-item.active {
  background: var(--accent-dark);
  color: white;
}

.chapter-num {
  font-size: 13px;
  color: var(--text-muted);
  width: 22px;
  flex-shrink: 0;
  font-weight: 500;
}

.chapter-item.active .chapter-num { color: rgba(255,255,255,0.6); }

.chapter-name {
  font-size: 14px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-status {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.chapter-status.draft { background: var(--text-muted); }
.chapter-status.writing { background: var(--accent-amber); }
.chapter-status.done { background: var(--accent-green); }

.sidebar-stats {
  padding: 12px 18px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-stat {
  font-size: 13px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.stat-dot.green { background: var(--accent-green); }
.stat-dot.amber { background: var(--accent-amber); }
.stat-dot.gray { background: var(--text-muted); }

/* Editor Main */
.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.editor-toolbar {
  padding: 8px 22px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  background: var(--bg-secondary);
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-btn {
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

.toolbar-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toolbar-btn.active {
  background: var(--accent-dark);
  color: white;
  border-color: var(--accent);
}

.toolbar-btn.ai-action:hover {
  background: rgba(74, 109, 122, 0.1);
  color: var(--accent-light);
  border-color: rgba(74, 109, 122, 0.2);
}

.toolbar-btn.ai-action.deep {
  border-color: rgba(200, 160, 60, 0.3);
  color: var(--accent-amber);
}

.toolbar-btn.ai-action.deep:hover:not(:disabled) {
  border-color: rgba(200, 160, 60, 0.5);
  background: rgba(200, 160, 60, 0.08);
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Plan Review */
.plan-review-banner { margin: 0 0 12px; padding: 16px 22px; background: var(--bg-panel); border: 2px solid var(--accent-amber); border-radius: var(--radius-sm); }
.plan-review-header { font-size: 16px; font-weight: 600; margin-bottom: 10px; color: var(--accent-amber); }
.plan-review-body { max-height: 300px; overflow-y: auto; margin-bottom: 12px; font-size: 13px; }
.plan-goal { margin-bottom: 8px; color: var(--text-secondary); }
.plan-scene { padding: 6px 0; border-bottom: 1px solid var(--border-color); }
.plan-beats { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.plan-review-actions { display: flex; gap: 8px; }

.toolbar-divider {
  width: 1px;
  height: 18px;
  background: var(--border-color);
  margin: 0 4px;
}

/* Editor Content */
.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 40px 20px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: var(--bg-deepest);
}

.editor-paper {
  max-width: 800px;
  width: 100%;
  min-height: 100%;
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  padding: 60px 80px;
  border: 1px solid var(--border-color);
  position: relative;
  transition: border-color var(--transition-normal), box-shadow var(--transition-normal);
  box-shadow: var(--shadow-sm);
}

@media (max-width: 1200px) {
  .editor-paper { padding: 40px 50px; }
}

@media (max-width: 800px) {
  .editor-paper { padding: 30px 24px; }
  .editor-content { padding: 16px 8px; }
}

.editor-paper:focus-within {
  border-color: var(--accent);
  box-shadow: var(--shadow-md);
}

.chapter-title-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  font-size: 32px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 32px;
  font-family: inherit;
  text-align: center;
}

.chapter-title-input::placeholder { color: var(--text-muted); }

.editor-textarea {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  font-size: 18px;
  line-height: 2.2;
  color: var(--text-primary);
  resize: none;
  min-height: 200px;
  font-family: inherit;
  overflow: hidden;
  overflow-wrap: break-word;
  word-break: break-word;
}

.editor-textarea::placeholder { color: var(--text-muted); }

/* Editor Footer */
.editor-footer {
  padding: 6px 22px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-muted);
  flex-shrink: 0;
  background: var(--bg-secondary);
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.footer-left strong {
  color: var(--text-primary);
  font-weight: 600;
}

.footer-divider {
  margin: 0 4px;
  opacity: 0.3;
}

.save-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
}

.save-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-amber);
  transition: background var(--transition-fast);
}

.save-indicator.saved .save-dot {
  background: var(--accent-green);
}
</style>
