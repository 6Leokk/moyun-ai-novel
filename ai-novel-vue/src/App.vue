<template>
  <template v-if="isPublicPage">
    <router-view />
  </template>
  <div v-else class="app-layout">
    <AppSidebar />
    <div class="main-content">
      <AppTopbar />
      <div class="content-wrapper" :class="{ 'no-padding': isEditorPage }">
        <router-view />
      </div>
    </div>
    <AIPanel v-show="aiPanelOpen" />
    <ToastContainer />
    <button
      v-show="!aiPanelOpen"
      class="ai-float-btn"
      @click="togglePanel"
    >
      <span class="ai-float-icon">🤖</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'
import AIPanel from './components/AIPanel.vue'
import ToastContainer from './components/ToastContainer.vue'
import { useAIStore } from './stores/ai'
import { storeToRefs } from 'pinia'

const route = useRoute()
const aiStore = useAIStore()
const { isOpen: aiPanelOpen } = storeToRefs(aiStore)
const { togglePanel } = aiStore

const isPublicPage = computed(() => route.meta?.public === true)
const isEditorPage = computed(() => route.name === 'Editor')
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.content-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 28px;
}

.content-wrapper.no-padding {
  padding: 0;
  overflow: hidden;
}

/* AI Float Button */
.ai-float-btn {
  position: fixed;
  bottom: 28px;
  right: 28px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--gradient-brand);
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  box-shadow: var(--shadow-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.ai-float-btn:hover {
  transform: scale(1.1);
  box-shadow: var(--shadow-md);
}
</style>