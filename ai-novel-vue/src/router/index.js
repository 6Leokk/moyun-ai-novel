import { createRouter, createWebHistory } from 'vue-router'
import { getAuthToken } from '../api/index.js'
import { useAuthStore } from '../stores/auth.js'
import DashboardView from '../views/DashboardView.vue'
import EditorView from '../views/EditorView.vue'
import CharactersView from '../views/CharactersView.vue'
import PlotView from '../views/PlotView.vue'
import WorldView from '../views/WorldView.vue'
import StatsView from '../views/StatsView.vue'
import SettingsView from '../views/SettingsView.vue'
import LoginView from '../views/LoginView.vue'
import AdminView from '../views/AdminView.vue'
import UsageView from '../views/UsageView.vue'

const routes = [
  { path: '/login', name: 'Login', component: LoginView, meta: { title: '登录', public: true } },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'Dashboard', component: DashboardView, meta: { title: '工作台', icon: '📊' } },
  { path: '/editor', name: 'Editor', component: EditorView, meta: { title: '写作', icon: '✍️' } },
  { path: '/characters', name: 'Characters', component: CharactersView, meta: { title: '角色管理', icon: '👤' } },
  { path: '/plot', name: 'Plot', component: PlotView, meta: { title: '剧情大纲', icon: '🗺️' } },
  { path: '/world', name: 'World', component: WorldView, meta: { title: '世界观设定', icon: '🌍' } },
  { path: '/stats', name: 'Stats', component: StatsView, meta: { title: '写作统计', icon: '📈' } },
  { path: '/settings', name: 'Settings', component: SettingsView, meta: { title: '系统设置', icon: '⚙️' } },
  { path: '/admin', name: 'Admin', component: AdminView, meta: { title: '管理面板', icon: '🔧', adminOnly: true } },
  { path: '/usage', name: 'Usage', component: UsageView, meta: { title: '用量统计', icon: '📊' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0, behavior: 'instant' }
  }
})

router.beforeEach(async (to) => {
  document.title = to.meta.title ? `墨韵AI - ${to.meta.title}` : '墨韵AI'

  if (!to.meta.public && !getAuthToken()) {
    return { path: '/login' }
  }

  if (!to.meta.public && getAuthToken()) {
    const authStore = useAuthStore()
    if (!authStore.user) {
      try {
        await authStore.loadCurrentUser()
      } catch {
        return { path: '/login' }
      }
    }
    if (to.meta.adminOnly && !authStore.isAdmin) {
      return { path: '/dashboard' }
    }
  }
})

export default router
