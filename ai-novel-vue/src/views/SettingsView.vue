<template>
  <div class="settings-page">
    <h2 class="page-title">⚙️ 系统设置</h2>

    <div class="settings-layout">
      <!-- Settings Nav -->
      <div class="settings-nav">
        <div
          v-for="item in navItems"
          :key="item.key"
          class="settings-nav-item"
          :class="{ active: activeSection === item.key }"
          @click="activeSection = item.key"
        >
          <div class="nav-icon-wrapper" :style="{ background: item.bg }">{{ item.icon }}</div>
          <span class="nav-label">{{ item.label }}</span>
        </div>
      </div>

      <!-- Settings Content -->
      <div class="settings-content">
        <div v-if="activeSection === 'ai'" class="settings-panel">
          <h3 class="panel-title">🤖 AI模型配置</h3>

          <div class="form-group">
            <label class="form-label">AI 供应商</label>
            <select v-model="settings.aiProvider" class="form-input form-select">
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="deepseek">DeepSeek</option>
              <option value="custom">自定义 (兼容 OpenAI API)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">API Key</label>
            <input
              v-model="settings.aiApiKey"
              type="password"
              class="form-input"
              placeholder="sk-..."
            />
            <div class="form-hint">你的 API Key 仅保存在本地和服务器，不会发送给第三方</div>
          </div>

          <div v-if="settings.aiProvider === 'custom'" class="form-group">
            <label class="form-label">自定义 API 地址</label>
            <input
              v-model="settings.aiBaseUrl"
              type="text"
              class="form-input"
              placeholder="https://api.example.com/v1"
            />
          </div>

          <div class="form-group">
            <label class="form-label">模型</label>
            <select v-model="settings.aiModel" class="form-input form-select">
              <optgroup v-if="settings.aiProvider === 'openai'" label="OpenAI">
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-4.1">GPT-4.1</option>
                <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
              </optgroup>
              <optgroup v-if="settings.aiProvider === 'anthropic'" label="Anthropic">
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
                <option value="claude-opus-4-7">Claude Opus 4.7</option>
              </optgroup>
              <optgroup v-if="settings.aiProvider === 'deepseek'" label="DeepSeek">
                <option value="deepseek-chat">DeepSeek V3</option>
                <option value="deepseek-reasoner">DeepSeek R1</option>
              </optgroup>
              <optgroup v-if="settings.aiProvider === 'custom'" label="自定义">
                <option value="custom">输入模型名称</option>
              </optgroup>
            </select>
          </div>

          <div v-if="settings.aiProvider === 'custom' && settings.aiModel === 'custom'" class="form-group">
            <label class="form-label">自定义模型名称</label>
            <input
              v-model="settings.aiModelCustom"
              type="text"
              class="form-input"
              placeholder="my-model-name"
            />
          </div>

          <div class="form-group">
            <label class="form-label">写作风格偏好</label>
            <select v-model="settings.style" class="form-input form-select">
              <option>文学性 - 注重修辞与意境</option>
              <option>通俗性 - 注重节奏与可读性</option>
              <option>混合 - 根据场景自动切换</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">AI温度 (创造性)</label>
            <div class="slider-row">
              <input
                v-model="settings.temperature"
                type="range"
                min="0"
                max="100"
                class="form-slider"
              />
              <span class="slider-value">{{ (settings.temperature / 100).toFixed(2) }}</span>
            </div>
            <div class="slider-labels">
              <span>保守</span><span>平衡</span><span>创意</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">最大生成长度</label>
            <select v-model="settings.maxLength" class="form-input form-select">
              <option>500字 (短段落)</option>
              <option>1000字 (标准章节)</option>
              <option>2000字 (长段落)</option>
              <option>不限制</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">角色一致性检查</label>
            <div class="toggle-row">
              <button
                class="toggle-switch"
                :class="{ on: settings.consistencyCheck }"
                @click="settings.consistencyCheck = !settings.consistencyCheck"
              >
                <span class="toggle-knob"></span>
              </button>
              <span class="toggle-desc">AI将自动检查生成内容与角色设定的一致性</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">上下文记忆范围</label>
            <select v-model="settings.contextRange" class="form-input form-select">
              <option>最近3章 (省token)</option>
              <option>最近5章 (推荐)</option>
              <option>全文上下文 (高质量)</option>
            </select>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary" @click="saveSettings">保存设置</button>
          </div>
        </div>

        <div v-if="activeSection === 'appearance'" class="settings-panel">
          <h3 class="panel-title">🎨 主题外观</h3>
          <div class="theme-grid">
            <div
              v-for="theme in themes"
              :key="theme.name"
              class="theme-card"
              :class="{ active: settings.theme === theme.name }"
              @click="onThemeChange(theme.name)"
            >
              <div class="theme-preview" :style="{ background: theme.preview }"></div>
              <span class="theme-name">{{ theme.label }}</span>
            </div>
          </div>
          <div class="form-group" style="margin-top:22px;">
            <label class="form-label">编辑器字体大小</label>
            <select class="form-input form-select">
              <option>16px</option>
              <option selected>17px</option>
              <option>18px</option>
              <option>20px</option>
            </select>
          </div>
        </div>

        <!-- Book Analysis Panel -->
        <div v-if="activeSection === 'analyze'" class="settings-panel">
          <h3 class="panel-title">🔍 拆书分析</h3>
          <p class="form-hint" style="margin-bottom:14px">粘贴小说文本，AI 自动分析人物、情节、伏笔、文风，可一键导入为新项目。</p>
          <div class="form-group">
            <label class="form-label">小说文本</label>
            <textarea v-model="analyzeText" class="form-input style-textarea" rows="10" placeholder="粘贴小说内容（至少100字，建议3000字以上以获得更好分析效果）..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">标题/类型（可选）</label>
            <div class="workshop-controls">
              <input v-model="analyzeTitle" class="form-input" placeholder="小说标题" />
              <input v-model="analyzeGenre" class="form-input" placeholder="类型（如：科幻、奇幻）" style="max-width:150px" />
            </div>
          </div>
          <button class="btn btn-primary" :disabled="analyzeLoading" @click="onAnalyzeBook">
            {{ analyzeLoading ? '分析中...' : '🔍 开始分析' }}
          </button>
          <div v-if="analyzeResult" class="analyze-result" style="margin-top:20px">
            <h4 style="margin-bottom:10px">分析结果</h4>
            <div class="analyze-summary">
              <span>角色 {{ analyzeResult.characters?.length || 0 }} 个</span>
              <span>情节节点 {{ analyzeResult.plotStructure?.length || 0 }} 个</span>
              <span>伏笔 {{ analyzeResult.foreshadows?.length || 0 }} 个</span>
            </div>
            <pre class="style-preview" style="max-height:300px">{{ JSON.stringify(analyzeResult, null, 2) }}</pre>
            <button class="btn btn-primary" style="margin-top:10px" @click="importAnalyzedBook">📥 导入为新项目</button>
          </div>
        </div>

        <div v-if="activeSection === 'storage'" class="settings-panel">
          <h3 class="panel-title">💾 存储与导出</h3>
          <div class="form-group">
            <label class="form-label">自动保存间隔</label>
            <select class="form-input form-select">
              <option>每30秒</option>
              <option selected>每1分钟</option>
              <option>每5分钟</option>
              <option>手动保存</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">导出项目</label>
            <div class="export-formats">
              <button v-for="fmt in exportFormats" :key="fmt.value" class="format-btn" @click="onExport(fmt.value)">{{ fmt.label }}</button>
            </div>
            <div v-if="exporting" class="export-status">正在导出...</div>
          </div>
          <div class="form-group">
            <label class="form-label">导入项目</label>
            <div class="import-area">
              <input
                ref="fileInput"
                type="file"
                accept=".json"
                class="file-input-hidden"
                @change="onImportFile"
              />
              <button class="format-btn import-btn" @click="$refs.fileInput.click()">选择 JSON 文件并导入</button>
            </div>
            <div v-if="importing" class="export-status">正在导入...</div>
          </div>
        </div>

        <div v-if="activeSection === 'shortcuts'" class="settings-panel">
          <h3 class="panel-title">⌨️ 快捷键</h3>
          <div class="shortcut-list">
            <div v-for="sc in shortcuts" :key="sc.action" class="shortcut-item">
              <span class="shortcut-action">{{ sc.action }}</span>
              <kbd class="shortcut-key">{{ sc.key }}</kbd>
            </div>
          </div>
        </div>

        <div v-if="activeSection === 'stats'" class="settings-panel">
          <h3 class="panel-title">📊 写作统计</h3>
          <div class="stats-overview">
            <div class="overview-card">
              <div class="overview-value">{{ novelStore.totalWords?.toLocaleString() || 0 }}</div>
              <div class="overview-label">总字数</div>
            </div>
            <div class="overview-card">
              <div class="overview-value">{{ statsSummary.streak }}天</div>
              <div class="overview-label">连续创作</div>
            </div>
            <div class="overview-card">
              <div class="overview-value">{{ statsSummary.todayWords?.toLocaleString() || 0 }}</div>
              <div class="overview-label">今日字数</div>
            </div>
            <div class="overview-card">
              <div class="overview-value">{{ novelStore.completionRate || 0 }}%</div>
              <div class="overview-label">完成度</div>
            </div>
          </div>
        </div>

        <!-- Writing Styles Panel -->
        <div v-if="activeSection === 'writing-styles'" class="settings-panel">
          <h3 class="panel-title">✍️ 写作风格管理</h3>
          <div class="form-group">
            <label class="form-label">当前项目默认风格</label>
            <select v-model="projectStyleId" class="form-input form-select" @change="onSetDefaultStyle">
              <option :value="null">无（使用默认）</option>
              <option v-for="s in writingStylesList" :key="s.id" :value="s.id">{{ s.name }}{{ !s.userId ? ' (系统)' : '' }}</option>
            </select>
          </div>
          <div class="style-list">
            <div v-for="s in writingStylesList" :key="s.id" class="style-card">
              <div class="style-card-header">
                <span class="style-name">{{ s.name }}</span>
                <span class="style-badge" :class="{ system: !s.userId }">{{ s.userId ? '自定义' : '系统' }}</span>
              </div>
              <p class="style-desc">{{ s.description || '暂无描述' }}</p>
              <pre class="style-preview">{{ s.styleContent?.slice(0, 200) }}{{ s.styleContent?.length > 200 ? '...' : '' }}</pre>
              <div v-if="s.userId" class="style-card-actions">
                <button class="btn-sm" @click="editWritingStyle(s)">编辑</button>
                <button class="btn-sm btn-danger-sm" @click="onDeleteWritingStyle(s.id)">删除</button>
              </div>
            </div>
          </div>
          <button class="btn btn-primary" style="margin-top:16px" @click="showNewStyle = !showNewStyle">
            {{ showNewStyle ? '取消' : '+ 新建风格' }}
          </button>
          <div v-if="showNewStyle" class="style-form">
            <div class="form-group">
              <label class="form-label">名称</label>
              <input v-model="styleForm.name" class="form-input" placeholder="我的风格" />
            </div>
            <div class="form-group">
              <label class="form-label">描述</label>
              <input v-model="styleForm.description" class="form-input" placeholder="简短描述此风格" />
            </div>
            <div class="form-group">
              <label class="form-label">风格内容（System Prompt）</label>
              <textarea v-model="styleForm.styleContent" class="form-input style-textarea" rows="4" placeholder="用自然语言描述写作风格偏好..."></textarea>
            </div>
            <button class="btn btn-primary" @click="saveWritingStyle">{{ editingStyleId ? '更新' : '创建' }}</button>
          </div>
        </div>

        <!-- Prompt Workshop Panel -->
        <div v-if="activeSection === 'workshop'" class="settings-panel">
          <h3 class="panel-title">🏪 提示词工坊</h3>
          <p class="form-hint" style="margin-bottom:14px">浏览社区分享的 Prompt 模板，一键导入到你的模板库。</p>
          <div class="workshop-controls">
            <input v-model="workshopSearch" class="form-input" placeholder="搜索模板..." style="flex:1" @input="onWorkshopSearch" />
            <select v-model="workshopSort" class="form-input form-select" style="width:120px" @change="loadWorkshop">
              <option value="newest">最新</option>
              <option value="downloads">最多导入</option>
              <option value="rating">最高评分</option>
            </select>
          </div>
          <div class="style-list" style="max-height:500px">
            <div v-for="t in workshopList" :key="t.id" class="style-card">
              <div class="style-card-header">
                <span class="style-name">{{ t.name }}</span>
                <span class="style-key">{{ t.templateKey }}</span>
              </div>
              <pre class="style-preview">{{ t.content?.slice(0, 200) }}{{ t.content?.length > 200 ? '...' : '' }}</pre>
              <div class="workshop-meta">
                <span>⭐ {{ t.rating || 0 }}</span>
                <span>📥 {{ t.downloads || 0 }}</span>
              </div>
              <div class="style-card-actions">
                <button class="btn-sm btn-primary-sm" @click="forkFromWorkshop(t.id)">一键导入</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Prompt Templates Panel -->
        <div v-if="activeSection === 'prompts'" class="settings-panel">
          <h3 class="panel-title">📋 Prompt 模板自定义</h3>
          <p class="form-hint" style="margin-bottom:16px">自定义系统 Prompt 模板会覆盖默认值。删除自定义后恢复系统默认。</p>
          <div class="style-list">
            <div v-for="t in promptTemplatesList" :key="t.id" class="style-card">
              <div class="style-card-header">
                <span class="style-name">{{ t.name }}</span>
                <span class="style-badge" :class="{ system: !t.userId }">{{ t.userId ? '已自定义' : '系统默认' }}</span>
                <span class="style-key">{{ t.templateKey }}</span>
              </div>
              <pre class="style-preview">{{ t.content?.slice(0, 250) }}{{ t.content?.length > 250 ? '...' : '' }}</pre>
              <div class="style-card-actions">
                <button v-if="!t.userId" class="btn-sm" @click="forkPromptTemplate(t)">自定义</button>
                <button v-if="t.userId" class="btn-sm" @click="editPromptTemplate(t)">编辑</button>
                <button v-if="t.userId" class="btn-sm btn-danger-sm" @click="resetPromptTemplateAction(t.id)">恢复默认</button>
              </div>
            </div>
          </div>
          <div v-if="showPromptEditor" class="style-form">
            <h4 style="margin-bottom:12px">{{ editingPromptId ? '编辑模板' : '新建模板' }}</h4>
            <div class="form-group">
              <label class="form-label">名称</label>
              <input v-model="promptForm.name" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label">模板 Key</label>
              <input v-model="promptForm.templateKey" class="form-input" :disabled="!!editingPromptId" />
            </div>
            <div class="form-group">
              <label class="form-label">变量（逗号分隔）</label>
              <input v-model="promptForm.variablesStr" class="form-input" placeholder="context, target_words" />
            </div>
            <div class="form-group">
              <label class="form-label">模板内容（用 {'{'}变量名{'}'} 做占位）</label>
              <textarea v-model="promptForm.content" class="form-input style-textarea" rows="6"></textarea>
            </div>
            <div class="form-actions-inline">
              <button class="btn btn-primary" @click="savePromptTemplate">{{ editingPromptId ? '更新' : '创建' }}</button>
              <button class="btn" @click="showPromptEditor = false">取消</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useNovelStore } from '../stores/novel'
import {
  getExportUrl, downloadProjectExport, importProject,
  getWritingStyles, createWritingStyle, updateWritingStyle, deleteWritingStyle,
  getProjectDefaultStyle, setProjectDefaultStyle,
  getPromptTemplates, createPromptTemplate, updatePromptTemplate, deletePromptTemplate, resetPromptTemplate,
  browseWorkshop, forkWorkshopTemplate,
  analyzeBook, getStatsSummary,
} from '../api/novel'
import { getAuthToken } from '../api/index'
import { useToastStore } from '../stores/toast.js'

const activeSection = ref('ai')
const novelStore = useNovelStore()
const toast = useToastStore()
const exporting = ref(false)
const importing = ref(false)
const fileInput = ref(null)
const statsSummary = ref({ streak: 0, todayWords: 0, totalWordsWritten: 0, totalDays: 0 })

async function loadStatsSummary() {
  const projectId = novelStore.project?.id
  if (!projectId) return
  try {
    const data = await getStatsSummary(projectId)
    statsSummary.value = data.summary || statsSummary.value
  } catch { /* stats are optional */ }
}

loadStatsSummary()

const exportFormats = [
  { value: 'txt', label: 'TXT' },
  { value: 'md', label: 'Markdown' },
  { value: 'docx', label: 'DOCX' },
  { value: 'json', label: 'JSON (数据备份)' },
]

async function onExport(format) {
  const projectId = novelStore.project?.id
  if (!projectId) {
    toast.warning('请先选择一个项目')
    return
  }
  exporting.value = true
  try {
    if (format === 'json') {
      await downloadProjectExport(projectId)
      toast.success('导出成功')
      return
    }
    const token = getAuthToken()
    const url = getExportUrl(projectId, format)
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!res.ok) {
      toast.error('导出失败')
      return
    }
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const ext = format === 'md' ? 'md' : format === 'docx' ? 'docx' : 'txt'
    a.download = `${novelStore.project.title || 'novel'}.${ext}`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (e) {
    toast.error('导出失败: ' + (e.message || ''))
  } finally {
    exporting.value = false
  }
}

async function onImportFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  importing.value = true
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    const result = await importProject(data)
    toast.success(`导入成功！新项目: ${result.title}`)
    // Reset file input so same file can be re-imported
    if (fileInput.value) fileInput.value.value = ''
  } catch (e) {
    toast.error('导入失败: ' + (e.message || '文件格式错误'))
  } finally {
    importing.value = false
  }
}

const settings = reactive({
  model: 'GPT-4o (综合性能)',
  aiProvider: 'openai',
  aiApiKey: '',
  aiBaseUrl: '',
  aiModel: 'gpt-4o',
  aiModelCustom: '',
  style: '文学性 - 注重修辞与意境',
  temperature: 75,
  maxLength: '1000字 (标准章节)',
  consistencyCheck: true,
  contextRange: '最近5章 (推荐)',
  theme: 'dark'
})

// ── Writing Styles ──
const writingStylesList = ref([])
const projectStyleId = ref(null)
const showNewStyle = ref(false)
const editingStyleId = ref(null)
const styleForm = reactive({ name: '', description: '', styleContent: '' })

async function loadWritingStyles() {
  try { writingStylesList.value = await getWritingStyles() } catch { /* offline */ }
}

async function loadProjectStyle() {
  const pid = novelStore.project?.id
  if (!pid) return
  try {
    const data = await getProjectDefaultStyle(pid)
    projectStyleId.value = data?.id || null
  } catch { /* offline */ }
}

async function onSetDefaultStyle() {
  const pid = novelStore.project?.id
  if (!pid) { toast.warning('请先选择项目'); return }
  try {
    if (projectStyleId.value) {
      await setProjectDefaultStyle(pid, projectStyleId.value)
    }
    toast.success('默认风格已更新')
  } catch (e) { toast.error('设置失败: ' + e.message) }
}

function editWritingStyle(s) {
  editingStyleId.value = s.id
  styleForm.name = s.name
  styleForm.description = s.description || ''
  styleForm.styleContent = s.styleContent
  showNewStyle.value = true
}

async function saveWritingStyle() {
  try {
    if (editingStyleId.value) {
      await updateWritingStyle(editingStyleId.value, { ...styleForm })
    } else {
      await createWritingStyle({ ...styleForm })
    }
    showNewStyle.value = false
    editingStyleId.value = null
    styleForm.name = ''; styleForm.description = ''; styleForm.styleContent = ''
    await loadWritingStyles()
    toast.success(editingStyleId.value ? '已更新' : '已创建')
  } catch (e) { toast.error('保存失败: ' + e.message) }
}

async function onDeleteWritingStyle(id) {
  try {
    await deleteWritingStyle(id)
    await loadWritingStyles()
    toast.success('已删除')
  } catch (e) { toast.error('删除失败: ' + e.message) }
}

// ── Prompt Templates ──
const promptTemplatesList = ref([])
const showPromptEditor = ref(false)
const editingPromptId = ref(null)
const promptForm = reactive({ name: '', templateKey: '', content: '', variablesStr: '' })

async function loadPromptTemplates() {
  try { promptTemplatesList.value = await getPromptTemplates() } catch { /* offline */ }
}

function forkPromptTemplate(t) {
  editingPromptId.value = null
  promptForm.name = t.name + ' (自定义)'
  promptForm.templateKey = t.templateKey
  promptForm.content = t.content
  promptForm.variablesStr = (t.variables || []).join(', ')
  showPromptEditor.value = true
}

function editPromptTemplate(t) {
  editingPromptId.value = t.id
  promptForm.name = t.name
  promptForm.templateKey = t.templateKey
  promptForm.content = t.content
  promptForm.variablesStr = (t.variables || []).join(', ')
  showPromptEditor.value = true
}

async function savePromptTemplate() {
  try {
    const variables = promptForm.variablesStr.split(',').map(s => s.trim()).filter(Boolean)
    if (editingPromptId.value) {
      await updatePromptTemplate(editingPromptId.value, {
        name: promptForm.name,
        content: promptForm.content,
        variables,
      })
    } else {
      await createPromptTemplate({
        name: promptForm.name,
        templateKey: promptForm.templateKey,
        content: promptForm.content,
        variables,
      })
    }
    showPromptEditor.value = false
    editingPromptId.value = null
    await loadPromptTemplates()
    toast.success(editingPromptId.value ? '已更新' : '已创建')
  } catch (e) { toast.error('保存失败: ' + e.message) }
}

async function resetPromptTemplateAction(id) {
  try {
    await resetPromptTemplate(id)
    await loadPromptTemplates()
    toast.success('已恢复系统默认')
  } catch (e) { toast.error('恢复失败: ' + e.message) }
}

// ── Prompt Workshop ──
const workshopList = ref([])
const workshopSearch = ref('')
const workshopSort = ref('newest')
let workshopTimer = null

async function loadWorkshop() {
  try {
    const params = { sort: workshopSort.value }
    if (workshopSearch.value) params.search = workshopSearch.value
    workshopList.value = await browseWorkshop(params)
  } catch { /* offline */ }
}

function onWorkshopSearch() {
  clearTimeout(workshopTimer)
  workshopTimer = setTimeout(loadWorkshop, 300)
}

async function forkFromWorkshop(id) {
  try {
    await forkWorkshopTemplate(id)
    await loadPromptTemplates()
    toast.success('已导入模板')
  } catch (e) { toast.error('导入失败: ' + e.message) }
}

// ── Book Analysis ──
const analyzeText = ref('')
const analyzeTitle = ref('')
const analyzeGenre = ref('')
const analyzeLoading = ref(false)
const analyzeResult = ref(null)

async function onAnalyzeBook() {
  if (!analyzeText.value || analyzeText.value.length < 100) {
    toast.warning('请至少提供100字的内容')
    return
  }
  analyzeLoading.value = true
  try {
    const data = await analyzeBook(analyzeText.value, analyzeTitle.value || undefined, analyzeGenre.value || undefined)
    analyzeResult.value = data.analysis
    toast.success('分析完成')
  } catch (e) {
    toast.error('分析失败: ' + (e.message || 'AI 服务暂不可用'))
  } finally {
    analyzeLoading.value = false
  }
}

async function importAnalyzedBook() {
  if (!analyzeResult.value) return
  try {
    const pkg = {
      version: '1.0',
      project: analyzeResult.value.project || { title: analyzeTitle.value || '拆书导入' },
      worldSettings: analyzeResult.value.worldBuilding || null,
      characters: analyzeResult.value.characters || [],
      outlines: (analyzeResult.value.plotStructure || []).map((p) => ({
        title: p.title || '',
        content: p.summary || '',
        orderIndex: 0,
      })),
      foreshadows: (analyzeResult.value.foreshadows || []).map((f) => ({
        title: f.title || '',
        description: f.description || '',
        status: f.status || 'planted',
      })),
      writingStyle: analyzeResult.value.writingStyle || null,
      chapters: [],
      relationships: [],
      careers: [],
      worldEntries: [],
    }
    const result = await importProject(pkg)
    toast.success(`项目"${result.title}"已创建`)
  } catch (e) {
    toast.error('导入失败: ' + (e.message || ''))
  }
}

// Load on mount and when project changes
onMounted(() => { loadWritingStyles(); loadPromptTemplates(); loadWorkshop() })
watch(() => novelStore.project?.id, (pid) => { if (pid) { loadProjectStyle() } }, { immediate: true })

const navItems = [
  { key: 'ai', icon: '🤖', label: 'AI模型配置', bg: 'rgba(74,109,122,0.12)' },
  { key: 'appearance', icon: '🎨', label: '主题外观', bg: 'rgba(74,109,122,0.12)' },
  { key: 'writing-styles', icon: '✍️', label: '写作风格', bg: 'rgba(86,130,100,0.12)' },
  { key: 'prompts', icon: '📋', label: 'Prompt 模板', bg: 'rgba(130,100,160,0.12)' },
  { key: 'workshop', icon: '🏪', label: '提示词工坊', bg: 'rgba(200,140,60,0.12)' },
  { key: 'analyze', icon: '🔍', label: '拆书分析', bg: 'rgba(180,70,90,0.12)' },
  { key: 'careers', icon: '⚔️', label: '职业体系', bg: 'rgba(140,100,60,0.12)' },
  { key: 'storage', icon: '💾', label: '存储与导出', bg: 'rgba(43,110,165,0.12)' },
  { key: 'shortcuts', icon: '⌨️', label: '快捷键', bg: 'rgba(154,107,30,0.12)' },
  { key: 'stats', icon: '📊', label: '写作统计', bg: 'rgba(16,185,129,0.12)' }
]

const themes = [
  { name: 'light', label: '米黄纸色', preview: 'linear-gradient(135deg, #faf6ee, #ebe5d9)' },
  { name: 'dark', label: '深色赛博', preview: 'linear-gradient(135deg, #0a0a0b, #101015)' },
  { name: 'midnight', label: '午夜蓝', preview: 'linear-gradient(135deg, #10131e, #1e3a5f)' },
  { name: 'forest', label: '暗夜森林', preview: 'linear-gradient(135deg, #0a0f0a, #192119)' },
  { name: 'warm', label: '暖夜', preview: 'linear-gradient(135deg, #1c1814, #4a3728)' },
]

function onThemeChange(name) {
  settings.theme = name
  document.documentElement.setAttribute('data-theme', name)
  localStorage.setItem('app_settings', JSON.stringify(settings))
}

const shortcuts = [
  { action: 'AI续写', key: '⌘ + Shift + C' },
  { action: 'AI润色', key: '⌘ + Shift + P' },
  { action: '保存', key: '⌘ + S' },
  { action: '新建章节', key: '⌘ + N' },
  { action: '搜索', key: '⌘ + K' },
  { action: '切换AI面板', key: '⌘ + .' },
  { action: '全屏编辑', key: 'F11' }
]

// 加载已保存的设置
try {
  const saved = localStorage.getItem('app_settings')
  if (saved) Object.assign(settings, JSON.parse(saved))
} catch {}

async function saveSettings() {
  try {
    document.documentElement.setAttribute('data-theme', settings.theme)
    localStorage.setItem('app_settings', JSON.stringify(settings))
    try {
      const { updateSettings } = await import('../api/novel.js')
      await updateSettings(settings)
    } catch {
      // Backend save is optional
    }
    toast.success('设置已保存')
  } catch (e) {
    toast.error('保存失败: ' + e.message)
  }
}
</script>

<style scoped>
.settings-page {
  animation: fadeIn 0.3s ease;
}

.page-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 22px;
}

.settings-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 22px;
}

/* Nav */
.settings-nav {
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 16px 18px;
  cursor: pointer;
  transition: all var(--transition-fast);
  border-bottom: 1px solid var(--border-color);
}

.settings-nav-item:last-child { border-bottom: none; }
.settings-nav-item:hover { background: var(--bg-hover); }

.settings-nav-item.active {
  background: rgba(74, 109, 122, 0.08);
  border-left: 3px solid var(--accent);
}

.nav-icon-wrapper {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}

.nav-label {
  font-size: 15px;
  font-weight: 500;
}

.settings-nav-item.active .nav-label {
  color: var(--text-accent);
}

/* Content */
.settings-content {
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  padding: 26px;
  min-height: 400px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 22px;
  padding-bottom: 15px;
  border-bottom: 1px solid var(--border-color);
}

/* Forms */
.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 15px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  font-weight: 500;
}

.form-input {
  width: 100%;
  padding: 11px 15px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 15px;
  outline: none;
  font-family: inherit;
  transition: border-color var(--transition-fast);
}

.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(74, 109, 122, 0.1);
}

.form-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%235a6478' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 28px;
  cursor: pointer;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 15px;
}

.form-slider {
  flex: 1;
  accent-color: var(--accent);
  height: 4px;
}

.slider-value {
  font-size: 15px;
  color: var(--text-secondary);
  min-width: 36px;
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 15px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* Toggle */
.toggle-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toggle-switch {
  width: 40px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  border: none;
  position: relative;
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.toggle-switch.on {
  background: var(--accent);
}

.toggle-knob {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  background: var(--bg-deepest);
  top: 2px;
  left: 2px;
  transition: all var(--transition-fast);
}

.toggle-switch.on .toggle-knob {
  left: 22px;
}

.toggle-desc {
  font-size: 14px;
  color: var(--text-secondary);
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

.form-actions {
  margin-top: 26px;
}

.btn {
  padding: 11px 20px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.btn-primary:hover {
  background: var(--accent-light);
  
}

/* Theme Grid */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
}

.theme-card {
  border-radius: var(--radius-sm);
  border: 2px solid var(--border-color);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: center;
}

.theme-card:hover {
  border-color: var(--border-light);
}

.theme-card.active {
  border-color: var(--accent);
  box-shadow: none;
}

.theme-preview {
  height: 60px;
}

.theme-name {
  display: block;
  font-size: 15px;
  padding: 6px;
  color: var(--text-secondary);
}

/* Export Formats */
.export-formats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.format-btn {
  padding: 7px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

.format-btn:hover {
  border-color: var(--accent);
  color: var(--text-accent);
}

.export-status {
  margin-top: 8px;
  font-size: 13px;
  color: var(--accent);
}

.file-input-hidden {
  display: none;
}

.import-btn {
  border-style: dashed;
}

/* Shortcuts */
.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shortcut-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.shortcut-item:hover {
  background: var(--bg-hover);
}

.shortcut-action {
  font-size: 15px;
  color: var(--text-secondary);
}

.shortcut-key {
  font-size: 15px;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  color: var(--text-muted);
  font-family: inherit;
}

/* Stats Overview */
.stats-overview {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
}

.overview-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  padding: 20px;
  text-align: center;
  border: 1px solid var(--border-color);
}

.overview-value {
  font-size: 15px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--text-primary), var(--text-accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.overview-label {
  font-size: 15px;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Style Cards */
.style-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 400px;
  overflow-y: auto;
}

.style-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
}

.style-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.style-name {
  font-size: 15px;
  font-weight: 600;
}

.style-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(74, 109, 122, 0.15);
  color: var(--accent-light);
}

.style-badge.system {
  background: rgba(100, 100, 100, 0.12);
  color: var(--text-muted);
}

.style-key {
  font-size: 11px;
  padding: 2px 5px;
  border-radius: 3px;
  background: rgba(130, 100, 160, 0.1);
  color: rgba(180, 140, 210, 0.8);
  margin-left: auto;
  font-family: monospace;
}

.style-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 8px;
}

.style-preview {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-deepest);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 100px;
  line-height: 1.5;
  font-family: inherit;
}

.style-card-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.style-form {
  margin-top: 16px;
  padding: 18px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.style-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  line-height: 1.6;
}

.btn-sm {
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition-fast);
}

.btn-sm:hover {
  border-color: var(--accent);
  color: var(--text-accent);
}

.btn-danger-sm {
  border-color: transparent;
  color: var(--text-muted);
}

.btn-danger-sm:hover {
  border-color: rgba(200, 80, 80, 0.3);
  color: rgba(220, 100, 100, 0.9);
}

.form-actions-inline {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

/* Workshop */
.workshop-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.workshop-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 6px;
}

.btn-primary-sm {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.btn-primary-sm:hover {
  background: var(--accent-light);
  color: white;
}

/* Analyze */
.analyze-result h4 {
  font-size: 15px;
  font-weight: 600;
}

.analyze-summary {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.analyze-summary span {
  background: var(--bg-deepest);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
}
</style>
