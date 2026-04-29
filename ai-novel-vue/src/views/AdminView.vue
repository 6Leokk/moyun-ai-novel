<template>
  <div class="admin-page">
    <div class="admin-layout">
      <nav class="admin-nav">
        <div v-for="tab in tabs" :key="tab.key" class="admin-nav-item" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
          <span>{{ tab.icon }} {{ tab.label }}</span>
        </div>
      </nav>

      <main class="admin-content">
        <div v-if="loading" class="loading-state">⏳ 加载中...</div>
        <div v-if="errorMsg" class="error-state">{{ errorMsg }}</div>
        <template v-if="!loading">

        <!-- Dashboard -->
        <div v-if="activeTab === 'dashboard'" class="admin-panel">
          <h3>📊 概览</h3>
          <div class="stat-grid">
            <div v-for="s in stats" :key="s.label" class="stat-card"><div class="stat-value">{{ s.value }}</div><div class="stat-label">{{ s.label }}</div></div>
          </div>
          <div class="expand-section" style="margin-top:20px">
            <div class="expand-header" @click="showTasks = !showTasks">📋 待处理任务 ({{ pendingTasks.length }}) <span>{{ showTasks ? '▼' : '▶' }}</span></div>
            <table v-if="showTasks && pendingTasks.length" class="admin-table"><thead><tr><th>类型</th><th>项目</th><th>重试</th><th>创建时间</th></tr></thead>
              <tbody><tr v-for="t in pendingTasks" :key="t.id"><td>{{ t.taskType }}</td><td>{{ t.projectId?.slice(0,8) }}</td><td>{{ t.retryCount }}/{{ t.maxRetries }}</td><td>{{ t.createdAt?.slice(0,19) }}</td></tr></tbody></table>
            <div v-if="showTasks && !pendingTasks.length" class="form-hint" style="padding:8px">无待处理任务</div>
          </div>
          <div class="expand-section" style="margin-top:12px">
            <div class="expand-header" @click="showErrors = !showErrors">⚠️ 最近错误 ({{ recentErrors.length }}) <span>{{ showErrors ? '▼' : '▶' }}</span></div>
            <table v-if="showErrors && recentErrors.length" class="admin-table"><thead><tr><th>Run ID</th><th>错误</th><th>时间</th></tr></thead>
              <tbody><tr v-for="e in recentErrors" :key="e.id"><td>{{ e.id?.slice(0,8) }}</td><td style="max-width:300px;overflow:hidden">{{ e.errorMessage }}</td><td>{{ e.finishedAt?.slice(0,19) }}</td></tr></tbody></table>
          </div>
        </div>

        <!-- Users -->
        <div v-if="activeTab === 'users'" class="admin-panel">
          <h3>👤 用户管理</h3>
          <input v-model="userSearch" class="form-input" placeholder="搜索..." @input="loadUsers" style="margin-bottom:12px;max-width:300px" />
          <table class="admin-table"><thead><tr><th>邮箱</th><th>用户</th><th>等级</th><th>管理</th><th>项目数</th><th>Token 消耗</th><th>操作</th></tr></thead>
            <tbody><tr v-for="u in userList" :key="u.id">
              <td>{{ u.email }}</td><td>{{ u.username }}</td>
              <td><select :value="u.trustLevel ?? 0" @change="updateUser(u.id, { trustLevel: +($event.target).value })" class="form-select-sm">
                <option :value="-1">禁用</option><option :value="0">用户</option><option :value="1">信任</option><option :value="2">高级</option><option :value="3">管理</option>
              </select></td>
              <td><input type="checkbox" :checked="u.isAdmin" @change="updateUser(u.id, { isAdmin: ($event.target).checked })" /></td>
              <td>{{ u._projectCount ?? '-' }}</td>
              <td>{{ u._totalCost ? '$' + Number(u._totalCost).toFixed(4) : '-' }}</td>
              <td><button class="btn-danger-sm" @click="disableUser(u.id)">禁用</button></td>
            </tr></tbody>
          </table>
        </div>

        <!-- Projects -->
        <div v-if="activeTab === 'projects'" class="admin-panel">
          <h3>📝 项目</h3>
          <div style="margin-bottom:12px;display:flex;gap:8px">
            <button v-for="f in ['all','pg_legacy','sqlite']" :key="f" class="format-btn" :style="projectFilter === f ? 'border-color:var(--accent);color:var(--accent-light)' : ''" @click="projectFilter = f; loadProjects()">{{ f === 'all' ? '全部' : f }}</button>
          </div>
          <table class="admin-table"><thead><tr><th>项目</th><th>所有者</th><th>存储</th><th>状态</th><th>字数</th><th>操作</th></tr></thead>
            <tbody><tr v-for="p in projectList" :key="p.id">
              <td>{{ p.title }}</td><td>{{ p._userEmail || p.userId?.slice(0,8) }}</td>
              <td><span :class="p.storageBackend === 'sqlite' ? 'badge-green' : 'badge-gray'">{{ p.storageBackend === 'sqlite' ? 'SQLite' : 'PG' }}</span></td>
              <td>{{ p.sqliteStatus || (p.storageBackend === 'pg_legacy' ? 'PG' : '-') }}</td>
              <td>{{ (p.currentWords || 0).toLocaleString() }}</td>
              <td><button class="btn-danger-sm" @click="deleteProject(p.id)">删除</button></td>
            </tr></tbody>
          </table>
        </div>

        <!-- Workshop -->
        <div v-if="activeTab === 'workshop'" class="admin-panel">
          <h3>📋 工坊审核</h3>
          <table class="admin-table"><thead><tr><th>模板</th><th>Key</th><th>评分/下载</th><th>操作</th></tr></thead>
            <tbody><tr v-for="t in workshopList" :key="t.id"><td>{{ t.name }}</td><td>{{ t.templateKey }}</td><td>⭐{{ t.rating }} 📥{{ t.downloads }}</td>
              <td><button class="btn-warn-sm" @click="toggleWorkshop(t.id)">{{ t.isPublic ? '下架' : '上架' }}</button></td></tr></tbody>
          </table>
        </div>

        <!-- Database -->
        <div v-if="activeTab === 'database'" class="admin-panel">
          <h3>🔧 数据库</h3>
          <div class="stat-grid">
            <div class="stat-card"><div class="stat-value">{{ dbStats.sqliteProjects }}</div><div class="stat-label">SQLite 项目</div></div>
            <div class="stat-card"><div class="stat-value">{{ dbStats.pgLegacyProjects }}</div><div class="stat-label">PG 旧项目 (自动迁移中)</div></div>
            <div class="stat-card"><div class="stat-value">{{ dbStats.errorProjects }}</div><div class="stat-label">异常</div></div>
            <div class="stat-card"><div class="stat-value">{{ dbStats.pendingTasks }}</div><div class="stat-label">队列待处理</div></div>
          </div>
          <div class="form-hint" style="margin-top:12px">新项目自动使用 SQLite。PG 旧项目在首次访问时自动迁移。</div>
        </div>

        <!-- Analytics -->
        <div v-if="activeTab === 'analytics'" class="admin-panel">
          <h3>📈 运营数据</h3>
          <div class="stat-grid" style="margin-bottom:20px">
            <div class="stat-card"><div class="stat-value">{{ (analytics.today?.tokens || 0).toLocaleString() }}</div><div class="stat-label">今日 Token</div></div>
            <div class="stat-card"><div class="stat-value">${{ Number(analytics.today?.cost || 0).toFixed(4) }}</div><div class="stat-label">今日成本</div></div>
            <div class="stat-card"><div class="stat-value">{{ (analytics.thisMonth?.tokens || 0).toLocaleString() }}</div><div class="stat-label">本月 Token</div></div>
            <div class="stat-card"><div class="stat-value">${{ Number(analytics.thisMonth?.cost || 0).toFixed(4) }}</div><div class="stat-label">本月成本</div></div>
            <div class="stat-card"><div class="stat-value">{{ analytics.totalCalls || 0 }}</div><div class="stat-label">总调用次数</div></div>
          </div>
          <h4 style="margin-bottom:10px">按模型统计</h4>
          <table class="admin-table"><thead><tr><th>模型</th><th>提供商</th><th>调用次数</th><th>Token</th><th>成本</th></tr></thead>
            <tbody><tr v-for="m in (analytics.byModel || [])" :key="m.model"><td>{{ m.model }}</td><td>{{ m.provider }}</td><td>{{ m.calls }}</td><td>{{ (m.tokens || 0).toLocaleString() }}</td><td>${{ Number(m.cost || 0).toFixed(6) }}</td></tr></tbody>
          </table>
          <div style="margin-top:20px;display:flex;justify-content:space-between;align-items:center">
            <h4 style="margin:16px 0 10px">按提供商统计</h4>
            <button class="btn-reset" @click="resetStats">🗑 重置统计数据</button>
          </div>
          <table class="admin-table"><thead><tr><th>提供商</th><th>调用次数</th><th>Token</th><th>成本</th></tr></thead>
            <tbody><tr v-for="p in (analytics.byProvider || [])" :key="p.provider"><td>{{ p.provider }}</td><td>{{ p.calls }}</td><td>{{ (p.tokens || 0).toLocaleString() }}</td><td>${{ Number(p.cost || 0).toFixed(6) }}</td></tr></tbody>
          </table>
        </div>

        </template>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { api } from '../api/index'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const activeTab = ref('dashboard')
const loading = ref(true)
const errorMsg = ref('')
const showTasks = ref(true)
const showErrors = ref(false)
const projectFilter = ref('all')

const tabs = [
  { key: 'dashboard', icon: '📊', label: '概览' },
  { key: 'users', icon: '👤', label: '用户' },
  { key: 'projects', icon: '📝', label: '项目' },
  { key: 'workshop', icon: '📋', label: '工坊' },
  { key: 'database', icon: '🔧', label: '数据库' },
  { key: 'analytics', icon: '📈', label: '运营' },
]

const stats = ref([])
const userList = ref([])
const userSearch = ref('')
const projectList = ref([])
const workshopList = ref([])
const dbStats = ref({ pgLegacyProjects: 0, sqliteProjects: 0, migratingProjects: 0, errorProjects: 0, pendingTasks: 0 })
const pendingTasks = ref([])
const recentErrors = ref([])
const analytics = ref({})

async function loadDashboard() {
  try {
    const data = await api.get('/admin/dashboard')
    stats.value = [
      { label: '用户', value: data.userCount ?? 0 },
      { label: '项目', value: data.projectCount ?? 0 },
      { label: 'Agent Run', value: data.agentRunCount ?? 0 },
      { label: 'AI 成本', value: '$' + Number(data.totalCost ?? 0).toFixed(4) },
      { label: '错误', value: data.recentErrors ?? 0 },
    ]
  } catch (e) { errorMsg.value = '加载失败: ' + (e.message || '权限不足') }
}
async function loadUsers() {
  try { const data = await api.get(`/admin/users?search=${userSearch.value}`); userList.value = data.users || [] } catch (e) { errorMsg.value = '用户加载失败' }
}
async function loadProjects() {
  try { const data = await api.get(`/admin/projects${projectFilter.value !== 'all' ? '?storage=' + projectFilter.value : ''}`); projectList.value = data.projects || [] } catch {}
}
async function loadWorkshop() { try { const data = await api.get('/admin/workshop'); workshopList.value = data.templates || [] } catch {} }
async function loadDB() { try { dbStats.value = await api.get('/admin/database') } catch {} }
async function loadTasks() { try { pendingTasks.value = await api.get('/admin/tasks') } catch {} }
async function loadErrors() { try { recentErrors.value = await api.get('/admin/errors') } catch {} }
async function loadAnalytics() { try { analytics.value = await api.get('/admin/analytics') } catch {} }

async function updateUser(id, data) { try { await api.put(`/admin/users/${id}`, data); loadUsers() } catch { toast.error('更新失败') } }
async function disableUser(id) { if (!confirm('确认禁用？')) return; try { await api.post(`/admin/users/${id}/disable`); loadUsers() } catch {} }
async function deleteProject(id) { if (!confirm('确认删除？')) return; try { await api.del(`/admin/projects/${id}`); loadProjects() } catch {} }
async function toggleWorkshop(id) { try { await api.post(`/admin/workshop/${id}/toggle`); loadWorkshop() } catch {} }
async function resetStats() {
  if (!confirm('确认重置所有统计数据？此操作不可恢复！')) return
  if (!confirm('再次确认：删除所有 LLM 调用记录和成本数据？')) return
  try { await api.post('/admin/reset-stats'); loadAnalytics(); toast.success('统计数据已重置') } catch { toast.error('重置失败') }
}

onMounted(async () => {
  loading.value = true
  await Promise.all([loadDashboard(), loadUsers(), loadProjects(), loadWorkshop(), loadDB(), loadTasks(), loadErrors(), loadAnalytics()])
  loading.value = false
})
</script>

<style scoped>
.admin-page { animation: fadeIn 0.2s ease; }
.admin-layout { display: grid; grid-template-columns: 180px 1fr; gap: 16px; min-height: calc(100vh - var(--topbar-height) - 40px); }
.admin-nav { background: var(--bg-panel); border-radius: var(--radius-sm); border: 1px solid var(--border-color); padding: 6px 0; }
.admin-nav-item { padding: 9px 16px; cursor: pointer; font-size: 14px; color: var(--text-secondary); transition: all var(--transition-fast); }
.admin-nav-item:hover, .admin-nav-item.active { background: var(--bg-hover); color: var(--text-primary); }
.admin-nav-item.active { border-left: 3px solid var(--accent); }
.admin-content { background: var(--bg-panel); border-radius: var(--radius-sm); border: 1px solid var(--border-color); padding: 20px; }
.admin-panel h3 { margin-bottom: 14px; font-size: 16px; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.stat-card { background: var(--bg-secondary); border-radius: var(--radius-sm); padding: 14px; text-align: center; border: 1px solid var(--border-color); }
.stat-value { font-size: 22px; font-weight: 700; color: var(--text-accent); }
.stat-label { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.admin-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.admin-table th, .admin-table td { padding: 7px 8px; text-align: left; border-bottom: 1px solid var(--border-color); }
.admin-table th { color: var(--text-muted); font-weight: 500; }
.form-input { width: 100%; padding: 7px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 13px; font-family: inherit; }
.form-select-sm { padding: 4px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 12px; font-family: inherit; cursor: pointer; }
.form-hint { font-size: 12px; color: var(--text-muted); }
.format-btn { padding: 5px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-secondary); font-size: 12px; cursor: pointer; font-family: inherit; }
.btn-danger-sm { padding: 4px 10px; border-radius: var(--radius-sm); border: 1px solid rgba(200,80,80,0.3); background: transparent; color: rgba(220,100,100,0.8); font-size: 12px; cursor: pointer; font-family: inherit; }
.btn-danger-sm:hover { background: rgba(200,80,80,0.1); }
.btn-warn-sm { padding: 4px 10px; border-radius: var(--radius-sm); border: 1px solid rgba(200,160,60,0.3); background: transparent; color: var(--accent-amber); font-size: 12px; cursor: pointer; font-family: inherit; }
.badge-green { padding: 2px 6px; border-radius: 4px; background: rgba(74,222,128,0.1); color: var(--accent-green); font-size: 11px; }
.badge-gray { padding: 2px 6px; border-radius: 4px; background: rgba(100,100,100,0.1); color: var(--text-muted); font-size: 11px; }
.loading-state, .error-state { text-align: center; padding: 40px; font-size: 15px; }
.error-state { color: var(--accent-rose); }
.expand-section { border: 1px solid var(--border-color); border-radius: var(--radius-sm); overflow: hidden; }
.expand-header { padding: 8px 12px; background: var(--bg-secondary); cursor: pointer; font-size: 13px; color: var(--text-secondary); user-select: none; }
.expand-header:hover { background: var(--bg-hover); }
.btn-reset { padding: 6px 14px; border-radius: var(--radius-sm); border: 1px solid rgba(200,80,80,0.3); background: transparent; color: rgba(220,100,100,0.7); font-size: 12px; cursor: pointer; font-family: inherit; }
.btn-reset:hover { background: rgba(200,80,80,0.08); }
</style>
