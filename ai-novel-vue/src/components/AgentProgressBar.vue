<template>
  <div v-if="store.isActive || store.needsReview" class="agent-progress">
    <div class="progress-bar-container">
      <div class="progress-steps">
        <span class="step" :class="{ done: store.phase !== 'planning' && store.phase, active: store.phase === 'planning' }">📋 规划</span>
        <span class="step-arrow">→</span>
        <span class="step" :class="{ active: store.phase === 'writing', done: store.phase === 'reviewing' || store.isCompleted }">✍️ 写作</span>
        <span class="step-arrow">→</span>
        <span class="step" :class="{ active: store.phase === 'reviewing', done: store.isCompleted }">🔍 审稿</span>
      </div>
    </div>
    <div class="progress-status">
      <template v-if="store.isActive">
        <span class="spinner"></span>
        {{ phaseLabel }}
      </template>
      <template v-else-if="store.needsReview">
        ⚠️ 审稿发现问题，需手动处理
        <button class="btn-accept" @click="$emit('accept')">接受</button>
        <button class="btn-discard" @click="$emit('discard')">丢弃</button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAgentStore } from '../stores/agent'

const store = useAgentStore()

const phaseLabel = computed(() => {
  switch (store.phase) {
    case 'planning': return '正在规划章节结构...'
    case 'writing': return '正在写作...'
    case 'reviewing': return '正在审稿...'
    default: return '处理中...'
  }
})

defineEmits(['accept', 'discard'])
</script>

<style scoped>
.agent-progress {
  padding: 8px 22px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.progress-steps {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step {
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.step.active { color: var(--accent-amber); background: rgba(240,160,64,0.1); }
.step.done { color: var(--accent-green); }

.step-arrow { color: var(--text-muted); font-size: 11px; }

.progress-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.spinner {
  width: 12px; height: 12px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-amber);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.btn-accept, .btn-discard {
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}

.btn-accept { background: var(--accent-green); color: white; border-color: var(--accent-green); }
.btn-discard { background: transparent; color: var(--text-muted); }
</style>
