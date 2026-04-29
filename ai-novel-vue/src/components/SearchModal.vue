<template>
  <Teleport to="body">
    <div v-if="visible" class="search-overlay" @click.self="emit('close')">
      <div class="search-modal">
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input
            ref="inputRef"
            v-model="query"
            class="search-input"
            placeholder="搜索章节、角色、世界观..."
            @input="onSearch"
          />
          <kbd class="search-esc" @click="emit('close')">ESC</kbd>
        </div>

        <div v-if="loading" class="search-status">搜索中...</div>

        <div v-else-if="results.length > 0" class="search-results">
          <div
            v-for="item in results"
            :key="item.type + '-' + item.id"
            class="search-result-item"
            @click="onSelect(item)"
          >
            <div class="result-type-badge" :class="item.type">
              {{ typeLabels[item.type] }}
            </div>
            <div class="result-content">
              <div class="result-title">{{ item.title }}</div>
              <div class="result-snippet">{{ item.snippet }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="query && searched && !loading" class="search-status">
          未找到相关内容
        </div>

        <div v-else class="search-hint">
          输入关键词搜索章节内容、角色设定和世界观
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useNovelStore } from '../stores/novel'
import { searchProject } from '../api/novel'

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['close'])

const router = useRouter()
const novelStore = useNovelStore()
const query = ref('')
const results = ref([])
const loading = ref(false)
const searched = ref(false)
const inputRef = ref(null)

const typeLabels = {
  chapter: '章节',
  character: '角色',
  worldEntry: '世界观'
}

let searchTimer = null

function onSearch() {
  clearTimeout(searchTimer)
  if (!query.value.trim()) {
    results.value = []
    searched.value = false
    loading.value = false
    return
  }
  loading.value = true
  searchTimer = setTimeout(async () => {
    try {
      const projectId = novelStore.project?.id
      if (!projectId) return
      const data = await searchProject(projectId, query.value.trim())
      results.value = data.results || []
      searched.value = true
    } catch {
      results.value = []
    } finally {
      loading.value = false
    }
  }, 300)
}

function onSelect(item) {
  if (item.type === 'chapter') {
    router.push('/editor')
  } else if (item.type === 'character') {
    router.push('/characters')
  } else if (item.type === 'worldEntry') {
    router.push('/world')
  }
  emit('close')
}

watch(() => props.visible, (val) => {
  if (val) {
    query.value = ''
    results.value = []
    searched.value = false
    nextTick(() => { inputRef.value?.focus() })
  }
})
</script>

<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  z-index: 1000;
}

.search-modal {
  width: 560px;
  max-height: 70vh;
  background: #1a1a1c;
  border-radius: 12px;
  border: 1px solid #2a2a2d;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #2a2a2d;
  gap: 12px;
}

.search-icon { font-size: 18px; flex-shrink: 0; }

.search-input {
  flex: 1;
  background: none;
  border: none;
  color: #e8e6e3;
  font-size: 16px;
  outline: none;
  font-family: inherit;
}

.search-esc {
  padding: 2px 8px;
  border-radius: 4px;
  background: #2a2a2d;
  color: #7a7a7a;
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
}

.search-status,
.search-hint {
  padding: 24px 20px;
  text-align: center;
  color: #7a7a7a;
  font-size: 14px;
}

.search-results { overflow-y: auto; max-height: 50vh; }

.search-result-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 20px;
  cursor: pointer;
  border-bottom: 1px solid #222;
  transition: background 0.1s;
}

.search-result-item:hover { background: #222; }

.result-type-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  margin-top: 2px;
}

.result-type-badge.chapter { background: rgba(74,109,122,0.2); color: #5a7d94; }
.result-type-badge.character { background: rgba(43,110,165,0.2); color: #2b6ea5; }
.result-type-badge.worldEntry { background: rgba(42,122,90,0.2); color: #2a7a5a; }

.result-content { flex: 1; min-width: 0; }

.result-title { font-size: 14px; font-weight: 500; color: #e8e6e3; margin-bottom: 2px; }

.result-snippet {
  font-size: 13px;
  color: #7a7a7a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>