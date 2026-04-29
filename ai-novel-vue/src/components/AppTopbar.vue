<template>
  <div class="topbar">
    <div class="topbar-left">
      <h1 class="topbar-title">{{ pageTitle }}</h1>
      <span v-if="pageBreadcrumb" class="topbar-breadcrumb">
        {{ projectTitle }} / <span>{{ pageBreadcrumb }}</span>
      </span>
    </div>
    <div class="topbar-right">
      <button class="topbar-btn" @click="openPanel">
        <span class="btn-icon">🤖</span>
        AI助手
      </button>
      <button class="topbar-btn search-btn" @click="showSearch = true">
        <span class="btn-icon">🔍</span>
        搜索
        <kbd class="shortcut-hint">⌘K</kbd>
      </button>
      <button class="topbar-btn primary" @click="$emit('newProject')">
        <span class="btn-icon">✨</span>
        新建项目
      </button>
      <div class="user-info">
        <span class="user-name">{{ authStore.nickname || '用户' }}</span>
        <button class="topbar-btn" @click="handleLogout">退出</button>
      </div>
    </div>
    <SearchModal :visible="showSearch" @close="showSearch = false" />
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAIStore } from '../stores/ai'
import SearchModal from './SearchModal.vue'
import { useNovelStore } from '../stores/novel'
import { useAuthStore } from '../stores/auth'

const router = useRouter()

defineEmits(['newProject'])

const route = useRoute()
const aiStore = useAIStore()
const novelStore = useNovelStore()
const authStore = useAuthStore()
const { openPanel } = aiStore
const showSearch = ref(false)

const projectTitle = computed(() => novelStore.project?.title || '未选择项目')

const pageMeta = {
  Dashboard: { title: '工作台', breadcrumb: '' },
  Editor: { title: '写作', breadcrumb: '' },
  Characters: { title: '角色管理', breadcrumb: '' },
  Plot: { title: '剧情大纲', breadcrumb: '' },
  World: { title: '世界观设定', breadcrumb: '' },
  Stats: { title: '写作统计', breadcrumb: '' },
  Settings: { title: '系统设置', breadcrumb: '' }
}

const pageTitle = computed(() => pageMeta[route.name]?.title || '工作台')
const pageBreadcrumb = computed(() => pageMeta[route.name]?.breadcrumb || '')

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

function onKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    showSearch.value = !showSearch.value
  }
  if (e.key === 'Escape' && showSearch.value) {
    showSearch.value = false
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.topbar {
  height: var(--topbar-height);
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 26px;
  flex-shrink: 0;
  /* backdrop-filter: blur(8px); */
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.topbar-title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.topbar-breadcrumb {
  font-size: 14px;
  color: var(--text-muted);
}

.topbar-breadcrumb span {
  color: var(--accent-light);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-name {
  font-size: 14px;
  color: var(--text-secondary);
}

.topbar-btn {
  padding: 7px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: inherit;
}

.topbar-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-light);
}

.topbar-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.topbar-btn.primary:hover {
  background: var(--accent-light);
  border-color: var(--accent-light);

}

.btn-icon {
  font-size: 14px;
}

.search-btn {
  position: relative;
}

.shortcut-hint {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--bg-hover);
  color: var(--text-muted);
  font-family: inherit;
  margin-left: 4px;
}
</style>
