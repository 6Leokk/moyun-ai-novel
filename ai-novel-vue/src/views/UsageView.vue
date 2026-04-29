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
      <div class="chart-title" style="margin-bottom:14px">模型用量分布</div>
      <table class="model-table" v-if="models.length">
        <thead><tr><th>模型</th><th>提供商</th><th>调用次数</th><th>Tokens</th><th>费用</th></tr></thead>
        <tbody>
          <tr v-for="m in models" :key="m.model">
            <td class="model-name-cell">{{ m.model }}</td>
            <td><span class="provider-tag">{{ m.provider }}</span></td>
            <td>{{ m.calls.toLocaleString() }}</td>
            <td>{{ m.tokens.toLocaleString() }}</td>
            <td class="cost-cell">${{ m.cost.toFixed(6) }}</td>
          </tr>
          <tr class="total-row">
            <td class="model-name-cell" style="font-weight:600">合计</td>
            <td>—</td>
            <td>{{ all.calls.toLocaleString() }}</td>
            <td>{{ all.tokens.toLocaleString() }}</td>
            <td class="cost-cell">${{ all.cost.toFixed(6) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty-chart">暂无数据</div>
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
const tooltipStyle = computed(() => ({})) // positioned via CSS

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

/* Model Table */
.model-section { background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 16px; }
.model-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.model-table th { padding: 8px 12px; text-align: left; color: var(--text-muted); font-weight: 500; border-bottom: 1px solid var(--border-color); }
.model-table td { padding: 10px 12px; border-bottom: 1px solid var(--border-color); }
.model-name-cell { color: var(--text-primary); font-family: monospace; font-size: 12px; }
.provider-tag { padding: 2px 6px; border-radius: 4px; background: var(--bg-secondary); color: var(--text-secondary); font-size: 11px; }
.cost-cell { font-family: monospace; font-size: 12px; }
.total-row td { border-bottom: none; color: var(--text-primary); }
.empty-chart { text-align: center; padding: 40px; color: var(--text-muted); font-size: 13px; }
@media (max-width: 900px) { .stat-grid { grid-template-columns: 1fr; } .charts-row { grid-template-columns: 1fr; } }
</style>
