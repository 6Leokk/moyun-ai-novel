<template>
  <div class="stats-page">
    <div class="stats-header">
      <h2 class="page-title">📈 写作统计 & 一致性检查</h2>
      <div class="header-actions">
        <button class="btn-primary" @click="refreshStats">⟳ 刷新</button>
      </div>
    </div>

    <!-- Overview Cards -->
    <div class="overview-grid">
      <div class="overview-card">
        <div class="overview-icon-wrapper" style="background:rgba(74,109,122,0.12)">📝</div>
        <div class="overview-info">
          <div class="overview-label">总字数</div>
          <div class="overview-value">{{ totalWords.toLocaleString() }}</div>
          <div class="overview-sub">目标 {{ (project?.targetWords || 0).toLocaleString() }} 字</div>
        </div>
        <div class="overview-ring">
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="22" fill="none" stroke="var(--bg-hover)" stroke-width="4" />
            <circle cx="28" cy="28" r="22" fill="none" stroke="var(--accent)" stroke-width="4"
              :stroke-dasharray="`${completionRate * 1.38} 138`"
              stroke-linecap="round" transform="rotate(-90 28 28)" />
          </svg>
          <span class="ring-label">{{ completionRate }}%</span>
        </div>
      </div>
      <div class="overview-card">
        <div class="overview-icon-wrapper" style="background:rgba(43,110,165,0.12)">📖</div>
        <div class="overview-info">
          <div class="overview-label">章节进度</div>
          <div class="overview-value">{{ chapterStats.done }}/{{ chapterStats.total }}</div>
          <div class="overview-sub">写作中 {{ chapterStats.writing }} · 草稿 {{ chapterStats.draft }}</div>
        </div>
        <div class="chapter-progress">
          <div class="progress-segment done" :style="{ width: chapterStats.total ? (chapterStats.done / chapterStats.total * 100) + '%' : '0%' }"></div>
          <div class="progress-segment writing" :style="{ width: chapterStats.total ? (chapterStats.writing / chapterStats.total * 100) + '%' : '0%' }"></div>
          <div class="progress-segment draft" :style="{ width: chapterStats.total ? (chapterStats.draft / chapterStats.total * 100) + '%' : '0%' }"></div>
        </div>
      </div>
      <div class="overview-card">
        <div class="overview-icon-wrapper" style="background:rgba(42,122,138,0.12)">👤</div>
        <div class="overview-info">
          <div class="overview-label">角色数量</div>
          <div class="overview-value">{{ characters.length }}</div>
          <div class="overview-sub">关系 {{ relationships.length }} 条</div>
        </div>
      </div>
      <div class="overview-card">
        <div class="overview-icon-wrapper" style="background:rgba(154,107,30,0.12)">🗺️</div>
        <div class="overview-info">
          <div class="overview-label">剧情线</div>
          <div class="overview-value">{{ plotCompletion.length }}</div>
          <div class="overview-sub">场景 {{ plotNodes.filter(n => n.parentId).length }} 个</div>
        </div>
      </div>
    </div>

    <div class="stats-columns">
      <!-- Left Column: Charts -->
      <div class="stats-left">
        <!-- Word Count by Chapter -->
        <div class="stats-card">
          <h3 class="card-title">📊 章节字数分布</h3>
          <div class="chart-area">
            <div class="bar-chart">
              <div v-for="item in wordsByChapter" :key="item.label" class="bar-item">
                <div class="bar-track">
                  <div
                    class="bar-fill"
                    :class="item.status"
                    :style="{ height: (item.value / maxWords * 100) + '%' }"
                  ></div>
                </div>
                <div class="bar-label">{{ item.label }}</div>
                <div class="bar-value">{{ item.value > 0 ? item.value.toLocaleString() : '-' }}</div>
              </div>
            </div>
            <div class="chart-legend">
              <span class="legend-item"><span class="legend-dot done"></span>已完成</span>
              <span class="legend-item"><span class="legend-dot writing"></span>写作中</span>
              <span class="legend-item"><span class="legend-dot draft"></span>草稿</span>
            </div>
          </div>
        </div>

        <!-- Character Appearances -->
        <div class="stats-card">
          <h3 class="card-title">👤 角色出场统计</h3>
          <div class="appearance-list">
            <div v-for="stat in characterAppearances" :key="stat.id" class="appearance-item">
              <div class="appearance-char" :style="{ background: stat.color }">{{ characters.find(c => c.id === stat.id)?.avatarChar || '?' }}</div>
              <div class="appearance-info">
                <div class="appearance-name">{{ stat.name }} <span class="appearance-role">{{ stat.role }}</span></div>
                <div class="appearance-bar-track">
                  <div class="appearance-bar-fill" :style="{ width: (stat.appearances / maxAppearances * 100) + '%', background: stat.color }"></div>
                </div>
              </div>
              <div class="appearance-count">{{ stat.appearances }} 章</div>
            </div>
          </div>
        </div>

        <!-- Plot Completion -->
        <div class="stats-card">
          <h3 class="card-title">🗺️ 剧情线完成度</h3>
          <div class="plot-completion-list">
            <div v-for="arc in plotCompletion" :key="arc.title" class="plot-completion-item">
              <div class="plot-arc-info">
                <span class="plot-arc-name">{{ arc.title }}</span>
                <span class="plot-arc-stats">{{ arc.withChapter }}/{{ arc.total }} 关联章节</span>
              </div>
              <div class="plot-arc-track">
                <div class="plot-arc-fill" :style="{ width: arc.completion + '%', background: arc.color }"></div>
              </div>
              <span class="plot-arc-pct" :style="{ color: arc.color }">{{ arc.completion }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Consistency Checks -->
      <div class="stats-right">
        <div class="stats-card">
          <h3 class="card-title">🔍 一致性检查</h3>
          <p class="card-desc">自动检测数据不一致和潜在问题，帮助保证故事内容的正确性</p>
          <div class="check-list">
            <div
              v-for="(check, idx) in consistencyChecks"
              :key="idx"
              class="check-item"
              :class="'check-' + check.type"
            >
              <span class="check-icon">{{ check.icon }}</span>
              <span class="check-msg">{{ check.message }}</span>
            </div>
            <div v-if="consistencyChecks.length === 0" class="check-empty">
              ✅ 暂无一致性问题，数据看起来很健康！
            </div>
          </div>
        </div>

        <!-- World Entries Summary -->
        <div class="stats-card">
          <h3 class="card-title">🌍 世界观数据统计</h3>
          <div class="world-stats">
            <div v-for="(entries, key) in worldEntries" :key="key" class="world-stat-row">
              <span class="world-stat-label">{{ categoryLabels[key] }}</span>
              <span class="world-stat-count">{{ entries.length }} 条</span>
              <div class="world-stat-track">
                <div class="world-stat-fill" :style="{ width: (entries.length / maxWorldEntries * 100) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Relationship Summary -->
        <div class="stats-card">
          <h3 class="card-title">🔗 角色关系摘要</h3>
          <div class="rel-summary">
            <div v-for="t in relTypeCounts" :key="t.type" class="rel-type-row">
              <span class="rel-type-dot" :style="{ background: t.color }"></span>
              <span class="rel-type-label">{{ t.label }}</span>
              <span class="rel-type-count">{{ t.count }} 条</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useNovelStore } from '../stores/novel'
import { storeToRefs } from 'pinia'

const store = useNovelStore()
const {
  project, characters, relationships, plotNodes, worldEntries
} = storeToRefs(store)

const totalWords = computed(() => store.totalWords)
const completionRate = computed(() => store.completionRate)
const chapterStats = computed(() => store.chapterStats)
const characterAppearances = computed(() => store.characterAppearances)
const plotCompletion = computed(() => store.plotCompletion)
const consistencyChecks = computed(() => store.consistencyChecks)
const wordsByChapter = computed(() => store.wordsByChapter)

const maxWords = computed(() => Math.max(...wordsByChapter.value.map(w => w.value), 1))
const maxAppearances = computed(() => Math.max(...characterAppearances.value.map(c => c.appearances), 1))
const maxWorldEntries = computed(() => Math.max(...Object.values(worldEntries.value).map(e => e.length), 1))

const categoryLabels = {
  location: '🏙️ 地点场景',
  system: '⚙️ 规则体系',
  faction: '🏴 阵营势力',
  item: '🔮 关键物品'
}

const relTypeMap = [
  { type: 'ally', label: '盟友', color: '#2b6ea5' },
  { type: 'enemy', label: '敌对', color: '#8a3a4a' },
  { type: 'ambiguous', label: '暧昧', color: '#9a6b1e' },
  { type: 'mentor', label: '师徒', color: '#5a7d94' },
  { type: 'subordinate', label: '从属', color: '#64748b' },
  { type: 'family', label: '亲属', color: '#2a7a5a' }
]

const relTypeCounts = computed(() => {
  return relTypeMap.map(t => ({
    ...t,
    count: relationships.value.filter(r => r.type === t.type).length
  })).filter(t => t.count > 0)
})

async function refreshStats() {
  const projectId = store.project?.id
  if (!projectId) return
  await store.loadAll(projectId)
}
</script>

<style scoped>
.stats-page {
  animation: fadeIn 0.3s ease;
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22px;
}

.page-title {
  font-size: 15px;
  font-weight: 600;
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

/* Overview Grid */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 22px;
}

.overview-card {
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  padding: 20px;
  border: 1px solid var(--border-color);
  display: flex;
  gap: 15px;
  align-items: flex-start;
  transition: all var(--transition-normal);
  position: relative;
}

.overview-card:hover {
  border-color: var(--accent);
  box-shadow: none;
  transform: none;
}

.overview-icon-wrapper {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}

.overview-info {
  flex: 1;
  min-width: 0;
}

.overview-label {
  font-size: 15px;
  color: var(--text-muted);
  font-weight: 500;
}

.overview-value {
  font-size: 15px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--text-primary), var(--text-accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1.3;
}

.overview-sub {
  font-size: 14px;
  color: var(--text-muted);
  margin-top: 2px;
}

.overview-ring {
  position: relative;
  flex-shrink: 0;
}

.ring-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.chapter-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
  display: flex;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  overflow: hidden;
}

.progress-segment { height: 100%; }
.progress-segment.done { background: var(--accent-green); }
.progress-segment.writing { background: var(--accent-amber); }
.progress-segment.draft { background: var(--text-muted); }

/* Stats Columns */
.stats-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.stats-left, .stats-right {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.stats-card {
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  padding: 20px;
  border: 1px solid var(--border-color);
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
}

.card-desc {
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 16px;
  line-height: 1.5;
}

/* Bar Chart */
.bar-chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 140px;
  padding-top: 22px;
}

.bar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 100%;
}

.bar-track {
  flex: 1;
  width: 100%;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  position: relative;
}

.bar-fill {
  border-radius: var(--radius-sm);
  transition: height 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  min-height: 2px;
}

.bar-fill.done { background: var(--accent); }
.bar-fill.writing { background: var(--accent-amber); }
.bar-fill.draft { background: var(--text-muted); opacity: 0.4; }

.bar-label {
  font-size: 15px;
  color: var(--text-muted);
}

.bar-value {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.chart-legend {
  display: flex;
  gap: 15px;
  margin-top: 15px;
  justify-content: center;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 15px;
  color: var(--text-muted);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.legend-dot.done { background: var(--accent); }
.legend-dot.writing { background: var(--accent-amber); }
.legend-dot.draft { background: var(--text-muted); opacity: 0.4; }

/* Character Appearances */
.appearance-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.appearance-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.appearance-char {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: white;
  font-weight: 600;
  flex-shrink: 0;
}

.appearance-info {
  flex: 1;
  min-width: 0;
}

.appearance-name {
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 3px;
}

.appearance-role {
  font-size: 15px;
  color: var(--text-muted);
  margin-left: 6px;
}

.appearance-bar-track {
  height: 4px;
  background: var(--bg-hover);
  border-radius: 2px;
  overflow: hidden;
}

.appearance-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s ease;
}

.appearance-count {
  font-size: 15px;
  color: var(--text-secondary);
  font-weight: 600;
  flex-shrink: 0;
  min-width: 40px;
  text-align: right;
}

/* Plot Completion */
.plot-completion-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.plot-completion-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.plot-arc-info {
  min-width: 140px;
}

.plot-arc-name {
  font-size: 15px;
  font-weight: 500;
  display: block;
}

.plot-arc-stats {
  font-size: 15px;
  color: var(--text-muted);
}

.plot-arc-track {
  flex: 1;
  height: 6px;
  background: var(--bg-hover);
  border-radius: 3px;
  overflow: hidden;
}

.plot-arc-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.6s ease;
}

.plot-arc-pct {
  font-size: 15px;
  font-weight: 600;
  min-width: 40px;
  text-align: right;
}

/* Consistency Checks */
.check-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.check-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.check-item.check-warning {
  border-color: rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.05);
}

.check-item.check-hint {
  border-color: rgba(74, 109, 122, 0.2);
  background: rgba(74, 109, 122, 0.03);
}

.check-icon {
  font-size: 15px;
  flex-shrink: 0;
  margin-top: 1px;
}

.check-msg {
  font-size: 15px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.check-empty {
  text-align: center;
  padding: 22px;
  font-size: 15px;
  color: var(--accent-green);
}

/* World Stats */
.world-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.world-stat-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.world-stat-label {
  font-size: 13px;
  min-width: 100px;
}

.world-stat-count {
  font-size: 13px;
  color: var(--text-muted);
  min-width: 36px;
  text-align: right;
}

.world-stat-track {
  flex: 1;
  height: 4px;
  background: var(--bg-hover);
  border-radius: 2px;
  overflow: hidden;
}

.world-stat-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 0.6s ease;
}

/* Relationship Summary */
.rel-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rel-type-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.rel-type-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.rel-type-label {
  flex: 1;
  font-size: 15px;
}

.rel-type-count {
  font-size: 15px;
  color: var(--text-muted);
  font-weight: 600;
}
</style>
