<template>
  <div class="usage-page">
    <h2 class="page-title">用量信息</h2>
    <div class="time-hint">所有日期均按 UTC 时间显示，数据可能有 5 分钟延迟。</div>

    <!-- Top Stat Cards -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-title">总消费</div>
        <div class="stat-body">
          <div class="stat-amount"><span class="stat-currency">$</span>{{ all.cost.toFixed(2) }}</div>
          <div class="stat-unit">USD</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-title">本月消费</div>
        <div class="stat-body">
          <div class="stat-amount"><span class="stat-currency">$</span>{{ month.cost.toFixed(2) }}</div>
          <div class="stat-unit">USD</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-title">今日消费</div>
        <div class="stat-body">
          <div class="stat-amount"><span class="stat-currency">$</span>{{ today.cost.toFixed(4) }}</div>
          <div class="stat-unit">USD</div>
        </div>
      </div>
    </div>

    <!-- Time Range Selector -->
    <div class="toolbar">
      <div class="time-tabs">
        <button v-for="r in ranges" :key="r.key" class="time-tab" :class="{ active: range === r.key }" @click="range = r.key; loadData()">{{ r.label }}</button>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="charts-row">
      <!-- Token Usage Chart -->
      <div class="chart-card">
        <div class="chart-title">Tokens 用量</div>
        <div class="chart-area" ref="tokenChart">
          <div class="bar-chart" v-if="daily.length">
            <div class="chart-y-axis">
              <span>{{ formatNum(maxDailyTokens) }}</span><span>{{ formatNum(Math.floor(maxDailyTokens/2)) }}</span><span>0</span>
            </div>
            <div class="chart-bars">
              <div v-for="d in daily" :key="d.date" class="bar-col" @mouseenter="hovered = d" @mouseleave="hovered = null">
                <div class="bar" :style="{ height: barHeight(d.tokens) + '%' }"></div>
                <span class="bar-date">{{ d.date.slice(5) }}</span>
              </div>
            </div>
            <!-- Tooltip -->
            <div v-if="hovered" class="chart-tooltip" :style="tooltipStyle">
              <div class="tooltip-date">{{ hovered.date }}</div>
              <div class="tooltip-row"><span>Tokens</span><span>{{ hovered.tokens.toLocaleString() }}</span></div>
              <div class="tooltip-row"><span>调用次数</span><span>{{ hovered.calls }}</span></div>
              <div class="tooltip-row"><span>费用</span><span>${{ hovered.cost.toFixed(4) }}</span></div>
            </div>
          </div>
          <div v-else class="empty-chart">暂无数据</div>
        </div>
      </div>

      <!-- Cost Chart -->
      <div class="chart-card">
        <div class="chart-title">消费金额</div>
        <div class="chart-area">
          <div class="bar-chart" v-if="daily.length">
            <div class="chart-y-axis">
              <span>${{ maxDailyCost.toFixed(2) }}</span><span>${{ (maxDailyCost/2).toFixed(2) }}</span><span>$0</span>
            </div>
            <div class="chart-bars">
              <div v-for="d in daily" :key="d.date" class="bar-col" @mouseenter="costHovered = d" @mouseleave="costHovered = null">
                <div class="bar cost-bar" :style="{ height: costBarHeight(d.cost) + '%' }"></div>
                <span class="bar-date">{{ d.date.slice(5) }}</span>
              </div>
            </div>
            <div v-if="costHovered" class="chart-tooltip">
              <div class="tooltip-date">{{ costHovered.date }}</div>
              <div class="tooltip-row"><span>费用</span><span>${{ costHovered.cost.toFixed(6) }}</span></div>
              <div class="tooltip-row"><span>Tokens</span><span>{{ costHovered.tokens.toLocaleString() }}</span></div>
            </div>
          </div>
          <div v-else class="empty-chart">暂无数据</div>
        </div>
      </div>
    </div>

    <!-- Per-Model Breakdown -->
    <div class="model-section">
      <div class="chart-title" style="margin-bottom:16px">模型用量分布</div>
      <div v-if="models.length" class="model-breakdown-v2">
        <div v-for="m in models" :key="m.model" class="model-row-v2" @mouseenter="modelHovered = m" @mouseleave="modelHovered = null">
          <div class="model-bar-v2">
            <div class="model-bar-fill" :style="{ width: barWidth(m.tokens) + '%', background: colorFor(m.model) }"></div>
            <span class="model-name-v2">{{ m.model }}</span>
          </div>
          <span class="model-provider-v2">{{ m.provider }}</span>
          <span class="model-calls-v2">{{ m.calls }} 次</span>
          <span class="model-tokens-v2">{{ formatTokens(m.tokens) }}</span>
          <span class="model-cost-v2">${{ m.cost.toFixed(4) }}</span>
        </div>
        <div class="model-row-v2 total-v2">
          <div class="model-bar-v2"><div class="model-bar-fill" style="width:100%;background:var(--text-muted);opacity:0.3"></div><span class="model-name-v2" style="font-weight:600">合计</span></div>
          <span class="model-provider-v2">—</span>
          <span class="model-calls-v2">{{ all.calls }} 次</span>
          <span class="model-tokens-v2">{{ formatTokens(all.tokens) }}</span>
          <span class="model-cost-v2">${{ all.cost.toFixed(4) }}</span>
        </div>
      </div>
      <div v-else class="empty-chart">暂无数据 — 开始使用 AI 后这里会显示各模型的用量分布</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api/index'

const today = ref({ tokens:0, calls:0, cost:0 })
const month = ref({ tokens:0, calls:0, cost:0 })
const all = ref({ tokens:0, calls:0, cost:0 })
const models = ref([])
const daily = ref([])
const range = ref('30d')
const hovered = ref(null)
const costHovered = ref(null)
const modelHovered = ref(null)
const totalModelTokens = computed(() => models.value.reduce((s, m) => s + m.tokens, 0) || 1)

const ranges = [
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: '90d', label: '近 90 天' },
]

const maxDailyTokens = computed(() => Math.max(1, ...daily.value.map(d => d.tokens)))
const maxDailyCost = computed(() => Math.max(0.0001, ...daily.value.map(d => d.cost)))
function barHeight(t) { return Math.max(2, (t / maxDailyTokens.value) * 100) }
function costBarHeight(c) { return Math.max(2, (c / maxDailyCost.value) * 100) }
function formatNum(n) { return n >= 1000 ? (n/1000).toFixed(0) + 'k' : n }
function formatTokens(n) { return n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : n }
function barWidth(t) { return Math.max(1, (t / totalModelTokens.value) * 100) }
function colorFor(m) { const colors=['#4a6d7a','#3b82f6','#34d399','#f0a040','#e87c7c','#8b5cf6','#22d3ee','#f472b6']; let h=0; for(let i=0;i<m.length;i++)h=m.charCodeAt(i)+((h<<5)-h); return colors[Math.abs(h)%colors.length] } // positioned via CSS

async function loadData() {
  try {
    const data = await api.get(`/user/usage?range=${range.value}`)
    today.value = data.today || {}
    month.value = data.thisMonth || {}
    all.value = data.allTime || {}
    models.value = data.byModel || []
    daily.value = data.daily || []
  } catch {}
}

onMounted(loadData)
</script>

<style scoped>
.usage-page { animation: fadeIn 0.2s ease; padding-bottom: 40px; }
.page-title { font-size: 24px; font-weight: 600; margin-bottom: 4px; }
.time-hint { font-size: 12px; color: var(--text-muted); margin-bottom: 24px; }

/* Stat Cards */
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
.stat-card { background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 16px 20px; }
.stat-title { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; display: flex; align-items: center; gap: 4px; }
.stat-body { display: flex; align-items: baseline; gap: 6px; }
.stat-amount { font-size: 28px; font-weight: 700; color: var(--text-primary); }
.stat-currency { font-size: 16px; font-weight: 400; margin-right: 2px; }
.stat-unit { font-size: 12px; color: var(--text-muted); }

/* Toolbar */
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.time-tabs { display: flex; gap: 4px; background: var(--bg-secondary); border-radius: var(--radius-sm); padding: 2px; }
.time-tab { padding: 6px 16px; border: none; background: transparent; color: var(--text-secondary); font-size: 13px; cursor: pointer; border-radius: var(--radius-xs); transition: all var(--transition-fast); font-family: inherit; }
.time-tab.active { background: var(--bg-panel); color: var(--text-primary); font-weight: 500; }
.time-tab:hover:not(.active) { color: var(--text-primary); }

/* Charts */
.charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
.chart-card { background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 16px; }
.chart-title { font-size: 13px; font-weight: 500; color: var(--text-secondary); margin-bottom: 8px; }
.chart-area { position: relative; }
.bar-chart { display: flex; height: 160px; gap: 0; position: relative; }
.chart-y-axis { display: flex; flex-direction: column; justify-content: space-between; font-size: 10px; color: var(--text-muted); padding: 0 8px 18px 0; flex-shrink: 0; }
.chart-bars { display: flex; align-items: flex-end; gap: 1px; flex: 1; padding-bottom: 18px; }
.bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; cursor: pointer; position: relative; }
.bar { width: 80%; max-width: 24px; background: var(--accent); border-radius: 2px 2px 0 0; min-height: 2px; transition: height 0.3s, opacity 0.2s; }
.bar:hover { opacity: 0.8; }
.cost-bar { background: var(--accent-green); }
.bar-date { font-size: 8px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

/* Tooltip */
.chart-tooltip { position: absolute; top: -30px; left: 50%; transform: translateX(-50%); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 12px; z-index: 10; box-shadow: var(--shadow-md); pointer-events: none; white-space: nowrap; }
.tooltip-date { color: var(--text-muted); margin-bottom: 4px; font-size: 11px; }
.tooltip-row { display: flex; justify-content: space-between; gap: 20px; }
.tooltip-row span:first-child { color: var(--text-secondary); }
.tooltip-row span:last-child { color: var(--text-primary); font-weight: 500; }

/* Model Breakdown v2 */
.model-section { background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 16px; }
.model-breakdown-v2 { display: flex; flex-direction: column; gap: 2px; }
.model-row-v2 { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-radius: var(--radius-sm); transition: background 0.15s; }
.model-row-v2:hover { background: var(--bg-hover); }
.model-bar-v2 { flex: 1; height: 24px; background: var(--bg-secondary); border-radius: 4px; position: relative; overflow: hidden; min-width: 150px; }
.model-bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; opacity: 0.6; }
.model-name-v2 { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 12px; font-family: monospace; color: var(--text-primary); white-space: nowrap; }
.model-provider-v2 { font-size: 11px; color: var(--text-muted); width: 60px; flex-shrink: 0; }
.model-calls-v2 { font-size: 12px; color: var(--text-secondary); width: 50px; flex-shrink: 0; text-align: right; }
.model-tokens-v2 { font-size: 12px; color: var(--text-primary); width: 70px; flex-shrink: 0; text-align: right; font-family: monospace; }
.model-cost-v2 { font-size: 12px; color: var(--accent-amber); width: 80px; flex-shrink: 0; text-align: right; font-family: monospace; }
.total-v2 { border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: 4px; }
.empty-chart { text-align: center; padding: 40px; color: var(--text-muted); font-size: 13px; }
@media (max-width: 900px) { .stat-grid { grid-template-columns: 1fr; } .charts-row { grid-template-columns: 1fr; } }
</style>
