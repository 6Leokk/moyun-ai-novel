<template>
  <div class="usage-page">
    <h2 class="page-title">用量信息</h2>
    <div class="time-hint">所有日期均按 UTC 时间显示，数据可能有 5 分钟延迟。</div>

    <!-- Top Stat Cards -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-title">本月消费</div>
        <div class="stat-body">
          <div class="stat-amount"><span class="stat-currency">$</span>{{ month.cost.toFixed(2) }}</div>
          <div class="stat-unit">USD</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-title">本月 Tokens</div>
        <div class="stat-body">
          <div class="stat-amount">{{ formatNum(month.tokens) }}</div>
          <div class="stat-unit">tokens</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-title">总调用次数</div>
        <div class="stat-body">
          <div class="stat-amount">{{ all.calls.toLocaleString() }}</div>
          <div class="stat-unit">次</div>
        </div>
      </div>
    </div>

    <!-- Time Range Selector -->
    <div class="toolbar">
      <div class="time-tabs">
        <button v-for="r in ranges" :key="r.key" class="time-tab" :class="{ active: range === r.key }" @click="range = r.key; loadData()">{{ r.label }}</button>
      </div>
    </div>

    <!-- Tokens Chart with stacked model bars -->
    <div class="chart-card">
      <div class="chart-title">Tokens 用量</div>
      <div class="chart-area" v-if="daily.length">
        <div class="bar-chart" ref="chartRef">
          <div class="chart-y-axis">
            <span>{{ formatNum(maxDailyTokens) }}</span>
            <span>{{ formatNum(Math.floor(maxDailyTokens/2)) }}</span>
            <span>0</span>
          </div>
          <div class="chart-bars">
            <div v-for="d in daily" :key="d.date" class="bar-col"
              @mouseenter="hovered = d" @mouseleave="hovered = null"
              :class="{ hovered: hovered === d }">
              <div class="bar-stack">
                <div v-for="(seg, i) in getModelSegments(d.date)" :key="i"
                  class="bar-segment"
                  :style="{ height: segPct(seg.tokens) + '%', background: seg.color }"
                  :title="seg.model + ': ' + formatNum(seg.tokens) + ' tokens'">
                </div>
              </div>
              <span class="bar-date">{{ d.date.slice(5) }}</span>
            </div>
          </div>
          <!-- Tooltip -->
          <div v-if="hovered" class="chart-tooltip" :style="{ left: tooltipX + 'px' }">
            <div class="tooltip-date">{{ hovered.date }}</div>
            <div class="tooltip-row total"><span>合计</span><span>{{ formatNum(hovered.tokens) }} tokens</span></div>
            <div v-for="seg in getModelSegments(hovered.date)" :key="seg.model" class="tooltip-row">
              <span><span class="tooltip-dot" :style="{ background: seg.color }"></span> {{ seg.model }}</span>
              <span>{{ formatNum(seg.tokens) }} ({{ pctOf(seg.tokens, hovered.tokens) }}%)</span>
            </div>
          </div>
        </div>
        <div class="chart-legend">
          <span v-for="m in modelColors" :key="m.model" class="legend-item">
            <span class="legend-dot" :style="{ background: m.color }"></span>{{ m.model }}
          </span>
        </div>
      </div>
      <div v-else class="empty-chart">暂无数据 — 开始使用 AI 后这里会显示每日用量</div>
    </div>

    <!-- Per-Model Breakdown -->
    <div class="model-section">
      <div class="chart-title" style="margin-bottom:16px">模型用量分布</div>
      <div v-if="models.length" class="model-breakdown-v2">
        <div v-for="m in models" :key="m.model" class="model-row-v2">
          <div class="model-bar-v2">
            <div class="model-bar-fill" :style="{ width: barWidth(m.tokens) + '%', background: colorFor(m.model) }"></div>
            <span class="model-name-v2">{{ m.model }}</span>
          </div>
          <span class="model-provider-v2">{{ m.provider }}</span>
          <span class="model-calls-v2">{{ m.calls }} 次</span>
          <span class="model-tokens-v2">{{ formatNum(m.tokens) }}</span>
        </div>
        <div class="model-row-v2 total-v2">
          <div class="model-bar-v2"><div class="model-bar-fill" style="width:100%;background:var(--text-muted);opacity:0.3"></div><span class="model-name-v2" style="font-weight:600">合计</span></div>
          <span class="model-provider-v2">—</span>
          <span class="model-calls-v2">{{ all.calls }} 次</span>
          <span class="model-tokens-v2">{{ formatNum(all.tokens) }}</span>
        </div>
      </div>
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
const dailyByModel = ref([])
const range = ref('30d')
const hovered = ref(null)

const ranges = [
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: '90d', label: '近 90 天' },
]

const maxDailyTokens = computed(() => Math.max(1, ...daily.value.map(d => d.tokens)))
const totalModelTokens = computed(() => models.value.reduce((s, m) => s + m.tokens, 0) || 1)

function formatNum(n) { return n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n) }
function segPct(t) { return Math.max(1, (t / maxDailyTokens.value) * 100) }
function barWidth(t) { return Math.max(1, (t / totalModelTokens.value) * 100) }
function pctOf(part, total) { return total > 0 ? ((part / total) * 100).toFixed(1) : '0' }

const modelColors = computed(() => models.value.map((m, i) => ({ model: m.model, color: colorFor(m.model) })))
function colorFor(m) { const colors=['#4a6d7a','#3b82f6','#34d399','#f0a040','#e87c7c','#8b5cf6','#22d3ee','#f472b6']; let h=0; for(let i=0;i<m.length;i++)h=m.charCodeAt(i)+((h<<5)-h); return colors[Math.abs(h)%colors.length] }

function getModelSegments(date) {
  const items = dailyByModel.value.filter(d => d.date === date)
  if (items.length) return items.map(d => ({ model: d.model, tokens: d.tokens, color: colorFor(d.model) }))
  // Fallback: single bar if no per-model data
  const total = daily.value.find(d => d.date === date)
  return total ? [{ model: '总计', tokens: total.tokens, color: colorFor('总计') }] : []
}

async function loadData() {
  try {
    const data = await api.get('/user/usage?range=' + range.value)
    today.value = data.today; month.value = data.thisMonth; all.value = data.allTime
    models.value = data.byModel || []; daily.value = data.daily || []
    dailyByModel.value = data.dailyByModel || []
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
.stat-title { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
.stat-body { display: flex; align-items: baseline; gap: 6px; }
.stat-amount { font-size: 28px; font-weight: 700; color: var(--text-primary); }
.stat-currency { font-size: 16px; font-weight: 400; }
.stat-unit { font-size: 12px; color: var(--text-muted); }

/* Toolbar */
.toolbar { display: flex; justify-content: space-between; margin-bottom: 16px; }
.time-tabs { display: flex; gap: 4px; background: var(--bg-secondary); border-radius: var(--radius-sm); padding: 2px; }
.time-tab { padding: 6px 16px; border: none; background: transparent; color: var(--text-secondary); font-size: 13px; cursor: pointer; border-radius: var(--radius-xs); font-family: inherit; }
.time-tab.active { background: var(--bg-panel); color: var(--text-primary); font-weight: 500; }

/* Chart */
.chart-card { background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 24px; }
.chart-title { font-size: 13px; font-weight: 500; color: var(--text-secondary); margin-bottom: 12px; }
.chart-area { position: relative; }
.bar-chart { display: flex; height: 160px; position: relative; }
.chart-y-axis { display: flex; flex-direction: column; justify-content: space-between; font-size: 10px; color: var(--text-muted); padding: 0 8px 18px 0; flex-shrink: 0; }
.chart-bars { display: flex; align-items: flex-end; gap: 1px; flex: 1; padding-bottom: 18px; }
.bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; cursor: pointer; position: relative; }
.bar-stack { width: 80%; max-width: 24px; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; }
.bar-segment { width: 100%; min-height: 2px; transition: height 0.3s; }
.bar-col.hovered .bar-segment { opacity: 0.8; }
.bar-date { font-size: 8px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; }

/* Tooltip */
.chart-tooltip { position: absolute; top: -20px; left: 50%; transform: translateX(-50%); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 12px; z-index: 20; box-shadow: var(--shadow-md); pointer-events: none; white-space: nowrap; }
.tooltip-date { color: var(--text-muted); margin-bottom: 4px; font-size: 11px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
.tooltip-row { display: flex; justify-content: space-between; gap: 16px; padding: 1px 0; }
.tooltip-row span:first-child { color: var(--text-secondary); }
.tooltip-row span:last-child { color: var(--text-primary); font-weight: 500; }
.tooltip-row.total { font-weight: 600; margin-bottom: 2px; }
.tooltip-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }

/* Legend */
.chart-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); }
.legend-item { font-size: 11px; color: var(--text-secondary); display: flex; align-items: center; gap: 4px; }
.legend-dot { width: 8px; height: 8px; border-radius: 2px; }

/* Model Breakdown */
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
.total-v2 { border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: 4px; }
.empty-chart { text-align: center; padding: 40px; color: var(--text-muted); font-size: 13px; }

@media (max-width: 900px) { .stat-grid { grid-template-columns: 1fr; } }
</style>
