<template>
  <div class="relation-graph" ref="containerRef">
    <div class="graph-toolbar">
      <button
        v-for="t in relTypes"
        :key="t.type"
        class="type-filter"
        :class="{ active: activeType === t.type }"
        @click="toggleTypeFilter(t.type)"
      >
        <span class="type-dot" :style="{ background: t.color }"></span>
        {{ t.label }}
      </button>
      <div style="flex:1;"></div>
      <button class="graph-action-btn" @click="resetLayout" title="重置布局">⟳</button>
      <button class="graph-action-btn" @click="showAddRel = true" title="添加关系">+ 关系</button>
    </div>

    <svg
      class="graph-svg"
      :viewBox="`0 0 ${width} ${height}`"
      @mousemove="onDragMove"
      @mouseup="onDragEnd"
      @mouseleave="onDragEnd"
    >
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <marker
          v-for="t in relTypes"
          :key="'arrow-' + t.type"
          :id="'arrow-' + t.type"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" :fill="t.color" opacity="0.7" />
        </marker>
      </defs>

      <!-- Edges -->
      <g class="edges">
        <g v-for="edge in visibleEdges" :key="edge.id">
          <path
            :d="getEdgePath(edge)"
            fill="none"
            :stroke="getRelColor(edge.type)"
            :stroke-width="Math.max(1.5, edge.strength / 30)"
            :marker-end="`url(#arrow-${edge.type})`"
            :opacity="hoveredNode ? (edge.source === hoveredNode || edge.target === hoveredNode ? 0.9 : 0.15) : 0.5"
            class="edge-path"
            @mouseenter="hoveredEdge = edge.id"
            @mouseleave="hoveredEdge = null"
          />
          <!-- Edge label -->
          <text
            :x="getEdgeCenter(edge).x"
            :y="getEdgeCenter(edge).y - 8"
            text-anchor="middle"
            fill="#94a3b8"
            font-size="10"
            :opacity="hoveredNode ? (edge.source === hoveredNode || edge.target === hoveredNode ? 1 : 0.2) : 0.7"
            class="edge-label"
          >
            {{ edge.label }}
          </text>
        </g>
      </g>

      <!-- Nodes -->
      <g class="nodes">
        <g
          v-for="node in nodePositions"
          :key="node.id"
          class="graph-node"
          :transform="`translate(${node.x}, ${node.y})`"
          @mouseenter="hoveredNode = node.id"
          @mouseleave="hoveredNode = null"
          @mousedown.prevent="onDragStart($event, node)"
        >
          <!-- Glow ring -->
          <circle
            r="28"
            :fill="node.color"
            opacity="0.12"
            class="node-glow"
          />
          <!-- Main circle -->
          <circle
            r="22"
            :fill="node.color"
            opacity="0.25"
            stroke="var(--border-color)"
            stroke-width="1.5"
            class="node-circle"
            :class="{ hovered: hoveredNode === node.id }"
          />
          <!-- Avatar character -->
          <text
            text-anchor="middle"
            dominant-baseline="central"
            fill="white"
            font-size="16"
            font-weight="600"
            class="node-text"
          >
            {{ node.avatarChar }}
          </text>
          <!-- Name label -->
          <text
            :y="36"
            text-anchor="middle"
            fill="var(--text-primary)"
            font-size="11"
            font-weight="500"
          >
            {{ node.name }}
          </text>
          <!-- Role badge -->
          <text
            :y="48"
            text-anchor="middle"
            fill="var(--text-muted)"
            font-size="9"
          >
            {{ node.role }}
          </text>
        </g>
      </g>
    </svg>

    <!-- Add Relationship Modal -->
    <div v-if="showAddRel" class="rel-modal-overlay" @click.self="showAddRel = false">
      <div class="rel-modal">
        <div class="rel-modal-header">
          <h3>添加角色关系</h3>
          <button class="rel-modal-close" @click="showAddRel = false">✕</button>
        </div>
        <div class="form-group">
          <label class="form-label">来源角色</label>
          <select v-model="newRel.source" class="form-input form-select">
            <option value="">选择角色...</option>
            <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">目标角色</label>
          <select v-model="newRel.target" class="form-input form-select">
            <option value="">选择角色...</option>
            <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">关系类型</label>
          <select v-model="newRel.type" class="form-input form-select">
            <option v-for="t in relTypes" :key="t.type" :value="t.type">{{ t.label }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">关系描述</label>
          <input v-model="newRel.label" class="form-input" placeholder="描述这段关系..." />
        </div>
        <div class="form-group">
          <label class="form-label">关系强度 (0-100)</label>
          <div class="slider-row">
            <input v-model="newRel.strength" type="range" min="10" max="100" class="form-slider" />
            <span class="slider-value">{{ newRel.strength }}</span>
          </div>
        </div>
        <div class="rel-modal-actions">
          <button class="btn" @click="showAddRel = false">取消</button>
          <button class="btn btn-primary" @click="addRelationship">添加</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive, nextTick, watch } from 'vue'
import { useNovelStore } from '../stores/novel'
import { storeToRefs } from 'pinia'

const store = useNovelStore()
const { characters, relationships } = storeToRefs(store)
const containerRef = ref(null)

const width = ref(800)
const height = ref(500)
const hoveredNode = ref(null)
const hoveredEdge = ref(null)
const showAddRel = ref(false)
const activeType = ref(null)
const dragging = ref(null)
const dragOffset = reactive({ x: 0, y: 0 })

const nodePositions = ref([])

// 当角色列表变化时重新排版
watch(() => characters.value.length, () => {
  nextTick(() => initPositions())
})

const newRel = reactive({
  source: '',
  target: '',
  type: 'ally',
  label: '',
  strength: 60
})

const relTypes = [
  { type: 'ally', label: '盟友', color: '#2b6ea5' },
  { type: 'enemy', label: '敌对', color: '#8a3a4a' },
  { type: 'ambiguous', label: '暧昧', color: '#9a6b1e' },
  { type: 'mentor', label: '师徒', color: '#5a7d94' },
  { type: 'subordinate', label: '从属', color: '#64748b' },
  { type: 'family', label: '亲属', color: '#2a7a5a' }
]

const visibleEdges = computed(() => {
  if (!activeType.value) return relationships.value
  return relationships.value.filter(r => r.type === activeType.value)
})

function getRelColor(type) {
  return relTypes.find(t => t.type === type)?.color || '#64748b'
}

function toggleTypeFilter(type) {
  activeType.value = activeType.value === type ? null : type
}

function initPositions() {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  width.value = Math.max(600, rect.width)
  height.value = Math.max(400, rect.height - 44)

  const cx = width.value / 2
  const cy = height.value / 2
  const radius = Math.min(cx, cy) - 80
  const count = characters.value.length

  nodePositions.value = characters.value.map((c, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2
    return {
      id: c.id,
      name: c.name,
      avatarChar: c.avatarChar,
      color: c.color,
      role: c.role,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle)
    }
  })
}

function getNodePos(id) {
  return nodePositions.value.find(n => n.id === id) || { x: 0, y: 0 }
}

function getEdgePath(edge) {
  const s = getNodePos(edge.source)
  const t = getNodePos(edge.target)
  const mx = (s.x + t.x) / 2
  const my = (s.y + t.y) / 2
  const dx = t.x - s.x
  const dy = t.y - s.y
  // Offset the control point perpendicular to the line
  const dist = Math.sqrt(dx * dx + dy * dy)
  const offset = dist * 0.15
  const nx = -dy / (dist || 1) * offset
  const ny = dx / (dist || 1) * offset
  return `M ${s.x} ${s.y} Q ${mx + nx} ${my + ny} ${t.x} ${t.y}`
}

function getEdgeCenter(edge) {
  const s = getNodePos(edge.source)
  const t = getNodePos(edge.target)
  const mx = (s.x + t.x) / 2
  const my = (s.y + t.y) / 2
  const dx = t.x - s.x
  const dy = t.y - s.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const offset = dist * 0.15
  const nx = -dy / (dist || 1) * offset
  const ny = dx / (dist || 1) * offset
  return { x: mx + nx * 0.5, y: my + ny * 0.5 }
}

function onDragStart(e, node) {
  dragging.value = node.id
  const svgRect = containerRef.value?.querySelector('svg')?.getBoundingClientRect()
  if (!svgRect) return
  const scaleX = width.value / svgRect.width
  const scaleY = height.value / svgRect.height
  const svgX = (e.clientX - svgRect.left) * scaleX
  const svgY = (e.clientY - svgRect.top) * scaleY
  dragOffset.x = svgX - node.x
  dragOffset.y = svgY - node.y
}

function onDragMove(e) {
  if (!dragging.value) return
  const svgRect = containerRef.value?.querySelector('svg')?.getBoundingClientRect()
  if (!svgRect) return
  const scaleX = width.value / svgRect.width
  const scaleY = height.value / svgRect.height
  const x = (e.clientX - svgRect.left) * scaleX - dragOffset.x
  const y = (e.clientY - svgRect.top) * scaleY - dragOffset.y
  const node = nodePositions.value.find(n => n.id === dragging.value)
  if (node) {
    node.x = Math.max(30, Math.min(width.value - 30, x))
    node.y = Math.max(30, Math.min(height.value - 60, y))
  }
}

function onDragEnd() {
  dragging.value = null
}

function resetLayout() {
  initPositions()
}

function addRelationship() {
  if (!newRel.source || !newRel.target || newRel.source === newRel.target) return
  store.addRelationship({
    sourceId: newRel.source,
    targetId: newRel.target,
    type: newRel.type,
    label: newRel.label || relTypes.find(t => t.type === newRel.type)?.label || '',
    strength: Number(newRel.strength)
  })
  showAddRel.value = false
  newRel.source = ''
  newRel.target = ''
  newRel.type = 'ally'
  newRel.label = ''
  newRel.strength = 60
}

onMounted(() => {
  nextTick(() => {
    initPositions()
  })
})
</script>

<style scoped>
.relation-graph {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-deepest);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  overflow: hidden;
  position: relative;
}

.graph-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-panel);
  flex-shrink: 0;
}

.type-filter {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

.type-filter:hover {
  border-color: var(--border-light);
  color: var(--text-primary);
}

.type-filter.active {
  background: var(--bg-active);
  border-color: var(--border-light);
  color: var(--text-primary);
}

.type-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.graph-action-btn {
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

.graph-action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--accent);
}

.graph-svg {
  flex: 1;
  width: 100%;
  cursor: grab;
  background: radial-gradient(ellipse at center, rgba(74, 109, 122, 0.03) 0%, transparent 70%);
}

.graph-svg:active {
  cursor: grabbing;
}

.edge-path {
  transition: opacity 0.2s ease;
}

.edge-label {
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.graph-node {
  cursor: pointer;
  transition: transform 0.1s ease;
}

.node-glow {
  transition: opacity 0.2s ease;
  animation: glowPulse 3s ease-in-out infinite;
}

.node-circle {
  transition: all 0.2s ease;
}

.node-circle.hovered {
  stroke: var(--accent-light);
  stroke-width: 2;
  filter: url(#glow);
}

.node-text {
  pointer-events: none;
  user-select: none;
}

/* Relationship Modal */
.rel-modal-overlay {
  position: absolute;
  inset: 0;
  background: rgba(180, 170, 150, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  /* backdrop-filter: blur(4px); */
}

.rel-modal {
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  padding: 26px;
  width: 90%;
  max-width: 400px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
}

.rel-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.rel-modal-header h3 {
  font-size: 15px;
  font-weight: 600;
}

.rel-modal-close {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  border: none;
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rel-modal-close:hover {
  background: var(--bg-active);
}

.form-group {
  margin-bottom: 15px;
}

.form-label {
  display: block;
  font-size: 15px;
  color: var(--text-secondary);
  margin-bottom: 4px;
  font-weight: 500;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 15px;
  outline: none;
  font-family: inherit;
  transition: border-color var(--transition-fast);
}

.form-input:focus {
  border-color: var(--accent);
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
  gap: 12px;
}

.form-slider {
  flex: 1;
  accent-color: var(--accent);
}

.slider-value {
  font-size: 15px;
  color: var(--text-secondary);
  font-weight: 600;
  min-width: 28px;
  text-align: right;
}

.rel-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.btn {
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

.btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.btn-primary:hover {
  background: var(--accent-light);
}

@keyframes glowPulse {
  0%, 100% { opacity: 0.12; }
  50% { opacity: 0.25; }
}
</style>
