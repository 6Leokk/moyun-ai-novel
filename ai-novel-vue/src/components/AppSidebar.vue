<template>
  <aside class="sidebar" :class="{ expanded: isExpanded }">
    <div class="sidebar-top">
      <div class="sidebar-logo">
        <span class="logo-char">墨</span>
      </div>
      <div v-show="isExpanded" class="sidebar-brand">墨韵 AI</div>
    </div>

    <nav class="sidebar-nav">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: $route.path === item.path }"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span v-show="isExpanded" class="nav-label">{{ item.label }}</span>
        <span v-if="$route.path === item.path" class="nav-active-dot"></span>
      </router-link>
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-avatar"><span>笔</span></div>
      <div v-show="isExpanded" class="sidebar-user-info">
        <div class="sidebar-user-name">创作者</div>
        <div class="sidebar-user-plan">Pro 会员</div>
      </div>
    </div>

    <button class="sidebar-toggle" @click="isExpanded = !isExpanded">
      {{ isExpanded ? '◀' : '▶' }}
    </button>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const isExpanded = ref(false)
const authStore = useAuthStore()

const allNavItems = [
  { path: '/dashboard', icon: '📊', label: '工作台' },
  { path: '/editor', icon: '✍️', label: '写作' },
  { path: '/characters', icon: '👤', label: '角色' },
  { path: '/plot', icon: '🗺️', label: '大纲' },
  { path: '/world', icon: '🌍', label: '世界观' },
  { path: '/stats', icon: '📈', label: '统计' },
  { path: '/usage', icon: '📊', label: '用量' },
  { path: '/settings', icon: '⚙️', label: '设置' },
  { path: '/admin', icon: '🔧', label: '管理', adminOnly: true }
]

const navItems = computed(() => allNavItems.filter(item => !item.adminOnly || authStore.isAdmin))
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  height: 100vh;
  background: var(--bg-primary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px 0;
  z-index: 100;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
  transition: width 0.25s ease, min-width 0.25s ease;
}

.sidebar.expanded {
  width: var(--sidebar-expanded);
  min-width: var(--sidebar-expanded);
}

.sidebar-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 22px;
  width: 100%;
}

/* Logo */
.sidebar-logo {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-sm);
  background: var(--gradient-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  flex-shrink: 0;
  cursor: default;
}

.logo-char {
  font-size: 24px;
  font-weight: 800;
  color: white;
}

.sidebar-brand {
  font-size: 16px;
  color: var(--text-muted);
  white-space: nowrap;
  letter-spacing: 1px;
}

/* Navigation */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 0 12px;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 13px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
  white-space: nowrap;
  color: var(--text-muted);
  text-decoration: none;
  position: relative;
  overflow: hidden;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--accent-dark);
  color: white;
}

.nav-active-dot {
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 22px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}

.nav-icon {
  font-size: 20px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 收起时让整个 nav-item 变成正方形并居中 */
.sidebar:not(.expanded) .nav-item {
  width: 40px;
  height: 40px;
  padding: 0;
  justify-content: center;
  margin: 0 auto 2px auto;
}

.nav-label {
  font-size: 15px;
  font-weight: 500;
  opacity: 1;
}

/* Footer */
.sidebar-footer {
  padding: 15px 12px;
  width: 100%;
  border-top: 1px solid var(--border-color);
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 15px;
}

.sidebar-avatar {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-blue));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  flex-shrink: 0;
  cursor: pointer;
}

.sidebar-user-info {
  min-width: 0;
  overflow: hidden;
}

.sidebar-user-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-user-plan {
  font-size: 12px;
  color: var(--accent-light);
  margin-top: 1px;
}

/* Toggle button */
.sidebar-toggle {
  position: absolute;
  right: -15px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 48px;
  border-radius: 0 2px 2px 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-left: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.sidebar:hover .sidebar-toggle {
  opacity: 1;
}

.sidebar-toggle:hover {
  color: var(--text-accent);
}
</style>
