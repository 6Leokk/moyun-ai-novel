<template>
  <div class="characters-page">
    <div class="characters-header">
      <h2 class="page-title">👤 角色管理</h2>
      <div class="characters-actions">
        <div class="view-tabs">
          <button
            v-for="v in viewModes"
            :key="v.key"
            class="view-tab"
            :class="{ active: activeView === v.key }"
            @click="activeView = v.key"
          >
            <span class="view-tab-icon">{{ v.icon }}</span>
            {{ v.label }}
          </button>
        </div>
        <div v-if="activeView === 'list'" class="list-actions">
          <div class="search-wrapper">
            <span class="search-icon">🔍</span>
            <input v-model="searchQuery" class="search-input" placeholder="搜索角色..." />
          </div>
          <div class="filter-chips">
            <button
              v-for="f in filters"
              :key="f"
              class="filter-chip"
              :class="{ active: activeFilters.includes(f) }"
              @click="toggleFilter(f)"
            >{{ f }}</button>
          </div>
          <button class="btn-primary" @click="showNewChar = true">✨ AI创建角色</button>
        </div>
        <div v-else class="graph-actions-info">
          <span class="graph-hint">拖拽节点调整位置 · 点击节点查看关系</span>
        </div>
      </div>
    </div>

    <!-- Character List View -->
    <div v-if="activeView === 'list'" class="characters-grid">
      <div
        v-for="char in filteredCharacters"
        :key="char.id"
        class="char-card"
        @click="openCharDetail(char)"
      >
        <div v-if="char.aiGenerated" class="char-ai-badge">🤖 AI生成</div>
        <div class="char-avatar" :style="{ background: char.avatarGradient }">{{ char.avatarChar }}</div>
        <span class="char-role" :class="'role-' + char.roleClass">{{ char.role }}</span>
        <h3 class="char-name">{{ char.name }}</h3>
        <div class="char-alias">{{ char.alias }}</div>
        <p class="char-desc">{{ char.desc }}</p>
        <div class="char-traits">
          <span v-for="trait in char.traits" :key="trait" class="char-trait">{{ trait }}</span>
        </div>
        <div class="char-relations">
          <span class="relations-label">关系：{{ getCharRelationCount(char.id) }} 条</span>
        </div>
      </div>

      <div class="char-card char-card-add" @click="showNewChar = true">
        <span class="add-icon">✨</span>
        <span class="add-text">AI生成新角色</span>
      </div>
    </div>

    <!-- Relationship Graph View -->
    <div v-else class="graph-container">
      <RelationGraph />
    </div>

    <Teleport to="body">
      <NewCharModal
        v-if="showNewChar"
        @close="showNewChar = false"
        @ai-generate="onAIGenerateChar"
      />
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useNovelStore } from '../stores/novel'
import { useAIStore } from '../stores/ai'
import { storeToRefs } from 'pinia'
import NewCharModal from '../components/NewCharModal.vue'
import RelationGraph from '../components/RelationGraph.vue'

const novelStore = useNovelStore()
const { characters, relationships } = storeToRefs(novelStore)
const aiStore = useAIStore()
const { openPanel, sendMessage } = aiStore

const showNewChar = ref(false)
const searchQuery = ref('')
const activeFilters = ref(['全部'])
const activeView = ref('list')

function onAIGenerateChar(form) {
  showNewChar.value = false
  novelStore.addCharacter({
    name: form.name || '未命名角色',
    role: form.role || '配角',
    gender: form.gender || '女',
    desc: form.desc || '由AI生成的角色',
    avatarChar: (form.name || '?')[0],
    avatarGradient: 'linear-gradient(135deg, #2b6ea5, #3d8bd9)',
    color: '#2b6ea5',
    alias: 'AI生成',
    traits: ['自定义'],
    roleClass: form.role === '主角' ? 'protagonist' : form.role === '反派' ? 'antagonist' : 'supporting',
    aiGenerated: true
  })
}

const viewModes = [
  { key: 'list', icon: '📋', label: '角色列表' },
  { key: 'graph', icon: '🕸️', label: '关系图谱' }
]

const filters = ['全部', '主角', '配角', '反派', '次要']

function toggleFilter(f) {
  if (f === '全部') {
    activeFilters.value = ['全部']
    return
  }
  activeFilters.value = activeFilters.value.filter(x => x !== '全部')
  const idx = activeFilters.value.indexOf(f)
  if (idx >= 0) activeFilters.value.splice(idx, 1)
  else activeFilters.value.push(f)
  if (activeFilters.value.length === 0) activeFilters.value = ['全部']
}

const filteredCharacters = computed(() => {
  let result = characters.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.alias || '').toLowerCase().includes(q) ||
      (c.desc || '').toLowerCase().includes(q)
    )
  }
  if (!activeFilters.value.includes('全部')) {
    result = result.filter(c => activeFilters.value.includes(c.role))
  }
  return result
})

function getCharRelationCount(charId) {
  return relationships.value.filter(r => r.sourceId === charId || r.targetId === charId).length
}

function openCharDetail(char) {
  openPanel()
  sendMessage(`帮我详细分析角色「${char.name}」的性格发展弧线`)
}
</script>

<style scoped>
.characters-page {
  animation: fadeIn 0.3s ease;
}

.characters-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22px;
}

.page-title {
  font-size: 15px;
  font-weight: 600;
}

.characters-actions {
  display: flex;
  gap: 15px;
  align-items: center;
}

/* View Tabs */
.view-tabs {
  display: flex;
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.view-tab {
  padding: 6px 16px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 15px;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: inherit;
}

.view-tab.active {
  background: var(--accent);
  color: white;
}

.view-tab-icon {
  font-size: 15px;
}

.list-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.graph-actions-info {
  display: flex;
  align-items: center;
}

.graph-hint {
  font-size: 15px;
  color: var(--text-muted);
}

.search-wrapper {
  position: relative;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 15px;
}

.search-input {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 7px 15px 7px 32px;
  color: var(--text-primary);
  font-size: 15px;
  outline: none;
  width: 200px;
  transition: border-color var(--transition-fast);
  font-family: inherit;
}

.search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(74, 109, 122, 0.1);
}

.filter-chips {
  display: flex;
  gap: 6px;
}

.filter-chip {
  padding: 5px 15px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

.filter-chip:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.filter-chip.active {
  background: var(--accent-dark);
  border-color: var(--accent);
  color: white;
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

/* Grid */
.characters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 16px;
}

.char-card {
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  padding: 24px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all var(--transition-normal);
  position: relative;
}

.char-card:hover {
  border-color: var(--accent);
  box-shadow: none;
  transform: none;
}

.char-ai-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--gradient-brand);
  color: white;
  font-size: 15px;
  font-weight: 600;
}

.char-avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  margin-bottom: 16px;
  font-weight: 600;
  color: white;
}

.char-role {
  display: inline-block;
  padding: 2px 12px;
  border-radius: var(--radius-sm);
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
}

.role-protagonist { background: rgba(74,109,122,0.15); color: var(--accent-light); }
.role-supporting { background: rgba(43,110,165,0.15); color: var(--accent-blue); }
.role-antagonist { background: rgba(138,58,74,0.15); color: var(--accent-rose); }
.role-minor { background: rgba(120,112,100,0.15); color: var(--text-muted); }

.char-name {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 2px;
}

.char-alias {
  font-size: 15px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.char-desc {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.65;
  margin-bottom: 15px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.char-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
}

.char-trait {
  padding: 2px 11px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  font-size: 15px;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.char-card:hover .char-trait {
  background: rgba(74, 109, 122, 0.12);
  color: var(--text-accent);
}

.char-relations {
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.relations-label {
  font-size: 15px;
  color: var(--text-muted);
}

.char-card-add {
  border: 2px dashed var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  flex-direction: column;
  gap: 12px;
  color: var(--text-muted);
  background: transparent;
}

.char-card-add:hover {
  border-color: var(--accent);
  color: var(--text-accent);
  background: rgba(74, 109, 122, 0.03);
  box-shadow: none;
}

.add-icon {
  font-size: 15px;
}

.add-text {
  font-size: 15px;
  font-weight: 500;
}

/* Graph Container */
.graph-container {
  height: calc(100vh - 180px);
  min-height: 500px;
}
</style>
