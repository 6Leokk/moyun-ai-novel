<template>
  <div v-if="events.length > 0" class="agent-timeline">
    <div class="timeline-title">Agent 过程</div>
    <div v-for="evt in visibleEvents" :key="evt.seq" class="timeline-item" :class="evt._type">
      <span class="timeline-icon">{{ evt._icon }}</span>
      <span class="timeline-label">{{ evt._label }}</span>
      <button v-if="evt._expandable" class="timeline-expand" @click="toggle(evt)">{{ evt._expanded ? '收起' : '详情' }}</button>
      <pre v-if="evt._expanded" class="timeline-detail">{{ evt._detail }}</pre>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useAgentStore } from '../stores/agent'

const store = useAgentStore()
const expanded = ref(new Set())

function toggle(evt) {
  if (expanded.value.has(evt.seq)) expanded.value.delete(evt.seq)
  else expanded.value.add(evt.seq)
  evt._expanded = expanded.value.has(evt.seq)
}

const events = computed(() => store.events)

const visibleEvents = computed(() => {
  return events.value.map(evt => {
    const enriched = { ...evt, _expanded: false, _expandable: false, _icon: '', _label: '', _type: '', _detail: '' }
    if (evt.eventType?.startsWith('agent:phase')) {
      enriched._icon = evt.payload?.phase === 'planning' ? '📋' : evt.payload?.phase === 'writing' ? '✍️' : evt.payload?.phase === 'reviewing' ? '🔍' : '📝'
      enriched._label = evt.payload?.message || evt.payload?.phase || ''
      enriched._type = 'phase'
    } else if (evt.eventType === 'agent:tool') {
      enriched._icon = evt.payload?.action === 'call' ? '🔧' : '✅'
      enriched._label = evt.payload?.action === 'call' ? `调用 ${evt.payload?.tool}` : `${evt.payload?.tool} 完成`
      enriched._type = 'tool'
      if (evt.payload?.action === 'result') {
        enriched._expandable = true
        enriched._detail = JSON.stringify(evt.payload?.summary || evt.payload, null, 2)
      }
    } else if (evt.eventType === 'agent:scene') {
      enriched._icon = '📖'
      enriched._label = `场景 ${(evt.payload?.index || 0) + 1}: ${evt.payload?.title || ''}`
      enriched._type = 'scene'
    } else if (evt.eventType === 'agent:plan_patch') {
      enriched._icon = '⚠️'
      enriched._label = 'Planner 修订规划'
      enriched._type = 'patch'
      enriched._expandable = true
      enriched._detail = JSON.stringify(evt.payload?.patch, null, 2)
    } else if (evt.eventType === 'agent:issue') {
      enriched._icon = '💡'
      enriched._label = evt.payload?.detail || '审稿意见'
      enriched._type = 'issue'
    }
    return enriched
  }).filter(e => e._icon)
})
</script>

<style scoped>
.agent-timeline {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  max-height: 200px;
  overflow-y: auto;
}
.timeline-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-secondary);
}
.timeline-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 3px 0;
  flex-wrap: wrap;
}
.timeline-icon { flex-shrink: 0; }
.timeline-label { flex: 1; color: var(--text-secondary); }
.timeline-item.issue .timeline-label { color: var(--accent-amber); }
.timeline-item.patch .timeline-label { color: var(--accent-rose); }
.timeline-expand {
  font-size: 11px;
  padding: 1px 6px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-family: inherit;
}
.timeline-detail {
  width: 100%;
  margin-top: 4px;
  padding: 6px 8px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 100px;
  overflow-y: auto;
}
</style>
