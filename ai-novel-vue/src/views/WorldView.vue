<template>
  <div class="world-page">
    <h2 class="page-title">🌍 世界观设定</h2>

    <!-- Category Cards -->
    <div class="world-categories">
      <div
        v-for="cat in categories"
        :key="cat.name"
        class="world-cat-card"
        :class="{ active: activeCategory === cat.key }"
        @click="activeCategory = cat.key"
      >
        <div class="cat-icon">{{ cat.icon }}</div>
        <h3 class="cat-name">{{ cat.name }}</h3>
        <p class="cat-desc">{{ cat.desc }}</p>
        <span class="cat-count">{{ cat.count }} 个</span>
      </div>
    </div>

    <!-- Entries -->
    <div class="world-section-title">
      {{ activeCategoryData.icon }} {{ activeCategoryData.name }}
      <span class="section-hint">— 点击查看详情</span>
    </div>

    <div class="world-entries">
      <div
        v-for="entry in activeCategoryData.entries"
        :key="entry.name"
        class="world-entry"
      >
        <div class="entry-icon" :style="{ background: entry.iconBg }">{{ entry.icon }}</div>
        <div class="entry-info">
          <div class="entry-name">{{ entry.name }}</div>
          <div class="entry-desc">{{ entry.desc }}</div>
        </div>
        <div class="entry-tags">
          <span v-for="tag in entry.tags" :key="tag" class="entry-tag">{{ tag }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useNovelStore } from '../stores/novel'
import { storeToRefs } from 'pinia'

const store = useNovelStore()
const { worldEntries } = storeToRefs(store)
const activeCategory = ref('location')

const categoryConfig = [
  { key: 'location', icon: '🏙️', name: '地点场景', desc: '城市、建筑、地标' },
  { key: 'system', icon: '⚙️', name: '规则体系', desc: '科技、魔法、社会规则' },
  { key: 'faction', icon: '🏴', name: '阵营势力', desc: '组织、帮派、公司' },
  { key: 'item', icon: '🔮', name: '关键物品', desc: '道具、武器、技术' }
]

const categories = computed(() =>
  categoryConfig.map(cat => ({
    ...cat,
    count: worldEntries.value[cat.key]?.length || 0
  }))
)

const activeCategoryData = computed(() => {
  const cat = categoryConfig.find(c => c.key === activeCategory.value)
  return {
    ...cat,
    entries: worldEntries.value[activeCategory.value] || []
  }
})
</script>

<style scoped>
.world-page {
  animation: fadeIn 0.3s ease;
}

.page-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 22px;
}

.world-categories {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 26px;
}

.world-cat-card {
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  padding: 22px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all var(--transition-normal);
  text-align: center;
}

.world-cat-card:hover {
  border-color: var(--accent);
  box-shadow: none;
  transform: none;
}

.world-cat-card.active {
  border-color: var(--accent);
  background: rgba(74, 109, 122, 0.06);
  box-shadow: none;
}

.cat-icon {
  font-size: 15px;
  margin-bottom: 12px;
}

.cat-name {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 3px;
}

.cat-desc {
  font-size: 14px;
  color: var(--text-muted);
}

.cat-count {
  display: inline-block;
  margin-top: 8px;
  padding: 2px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  font-size: 15px;
  color: var(--text-secondary);
}

.world-section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-hint {
  font-size: 18px;
  color: var(--text-muted);
  font-weight: 400;
}

.world-entries {
  background: var(--bg-panel);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.world-entry {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.world-entry:last-child { border-bottom: none; }
.world-entry:hover { background: var(--bg-hover); }

.entry-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}

.entry-info { flex: 1; min-width: 0; }

.entry-name {
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 2px;
}

.entry-desc {
  font-size: 14px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-tags {
  display: flex;
  gap: 5px;
  flex-shrink: 0;
}

.entry-tag {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  font-size: 15px;
  color: var(--text-secondary);
}
</style>