<template>
  <div class="tree-diagram">
    <div class="tree-container">
      <ul class="tree-root">
        <TreeNode
          v-for="node in treeData"
          :key="node.id"
          :node="node"
          :depth="0"
          :expanded-nodes="expandedNodes"
          :selected-node="selectedNode"
          @toggle="toggleNode"
          @select="onSelect"
        />
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, h, defineComponent } from 'vue'

const props = defineProps({
  treeData: { type: Array, default: () => [] }
})

const emit = defineEmits(['select'])

const expandedNodes = ref({})
const selectedNode = ref(null)

// Auto-expand first level
if (props.treeData.length) {
  props.treeData.forEach(n => { expandedNodes.value[n.id] = true })
}

function toggleNode(nodeId) {
  expandedNodes.value[nodeId] = !expandedNodes.value[nodeId]
}

function onSelect(node) {
  selectedNode.value = node.id
  emit('select', node)
}

const TreeNode = defineComponent({
  name: 'TreeNode',
  props: {
    node: { type: Object, required: true },
    depth: { type: Number, default: 0 },
    expandedNodes: { type: Object, required: true },
    selectedNode: { type: String, default: null }
  },
  emits: ['toggle', 'select'],
  setup(props, { emit }) {
    const hasChildren = () => props.node.children && props.node.children.length > 0
    const isExpanded = () => !!props.expandedNodes[props.node.id]
    const isSelected = () => props.selectedNode === props.node.id
    const isArc = () => !props.node.parentId
    const isScene = () => !!props.node.parentId

    return () => {
      const node = props.node
      const depth = props.depth
      const expanded = isExpanded()
      const selected = isSelected()
      const arc = isArc()

      const childrenVNodes = hasChildren() && expanded
        ? h('ul', { class: 'tree-children' },
            node.children.map(child =>
              h(TreeNode, {
                key: child.id,
                node: child,
                depth: depth + 1,
                expandedNodes: props.expandedNodes,
                selectedNode: props.selectedNode,
                onToggle: (id) => emit('toggle', id),
                onSelect: (n) => emit('select', n)
              })
            )
          )
        : null

      return h('li', { class: 'tree-item' }, [
        h('div', {
          class: [
            'tree-node',
            `tree-node--${arc ? 'arc' : 'scene'}`,
            { 'tree-node--selected': selected, 'tree-node--expanded': expanded }
          ],
          style: { '--node-color': node.color || '#5a7d94' },
          onClick: (e) => {
            e.stopPropagation()
            if (hasChildren()) emit('toggle', node.id)
            emit('select', node)
          }
        }, [
          // Expand/collapse indicator
          hasChildren()
            ? h('span', { class: 'tree-toggle' }, expanded ? '▾' : '▸')
            : h('span', { class: 'tree-dot' }),
          // Type icon
          h('span', { class: 'tree-node-icon' },
            arc ? (node.emoji || '📌') : (node.chapterId ? '📄' : '📝')
          ),
          // Content
          h('div', { class: 'tree-node-content' }, [
            h('div', { class: 'tree-node-title' }, node.title),
            node.desc
              ? h('div', { class: 'tree-node-desc' }, node.desc)
              : null,
            node.chapterId
              ? h('span', { class: 'tree-node-badge' }, `关联章节`)
              : null
          ]),
          // Children count
          hasChildren()
            ? h('span', { class: 'tree-node-count' }, node.children.length)
            : null
        ]),
        childrenVNodes
      ])
    }
  }
})
</script>

<style scoped>
.tree-diagram {
  width: 100%;
  height: 100%;
  overflow: auto;
  background: var(--bg-deepest);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  padding: 22px;
}

.tree-container {
  min-width: fit-content;
}

/* Tree structure */
.tree-root,
.tree-children {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tree-children {
  padding-left: 28px;
  position: relative;
}

/* Vertical connector line */
.tree-children::before {
  content: '';
  position: absolute;
  left: 16px;
  top: 0;
  bottom: 15px;
  width: 1.5px;
  background: var(--border-color);
}

.tree-item {
  position: relative;
}

/* Horizontal connector line */
.tree-children > .tree-item::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 20px;
  width: 16px;
  height: 1.5px;
  background: var(--border-color);
}

/* Node styles */
.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  margin: 3px 0;
  border: 1px solid transparent;
  user-select: none;
}

.tree-node:hover {
  background: var(--bg-hover);
  border-color: var(--border-color);
}

.tree-node--selected {
  background: rgba(74, 109, 122, 0.08);
  border-color: var(--accent);
  box-shadow: none;
}

.tree-node--arc {
  padding: 12px 16px;
}

.tree-node--arc .tree-node-title {
  font-weight: 600;
  font-size: 15px;
}

.tree-node--scene .tree-node-title {
  font-weight: 500;
  font-size: 15px;
}

.tree-toggle {
  font-size: 15px;
  color: var(--text-muted);
  width: 15px;
  text-align: center;
  flex-shrink: 0;
  transition: transform var(--transition-fast);
}

.tree-dot {
  width: 15px;
  height: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tree-dot::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--node-color, var(--accent));
  opacity: 0.6;
}

.tree-node-icon {
  font-size: 15px;
  flex-shrink: 0;
}

.tree-node-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.tree-node-title {
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-node-desc {
  font-size: 15px;
  color: var(--text-muted);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-node-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: rgba(74, 109, 122, 0.12);
  color: var(--accent-light);
  font-size: 15px;
  margin-top: 3px;
}

.tree-node-count {
  padding: 1px 7px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  color: var(--text-muted);
  font-size: 15px;
  flex-shrink: 0;
}

/* Color bar on left of arc nodes */
.tree-node--arc::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 3px;
  border-radius: 2px;
  background: var(--node-color, var(--accent));
}
</style>
