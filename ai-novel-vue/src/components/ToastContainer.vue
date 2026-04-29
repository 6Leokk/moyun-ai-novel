<template>
  <Teleport to="body">
    <div class="toast-container">
      <transition-group name="toast">
        <div
          v-for="item in items"
          :key="item.id"
          class="toast-item"
          :class="['toast-' + item.type, { 'toast-hiding': !item.visible }]"
          @click="dismiss(item.id)"
        >
          <span class="toast-icon">{{ icons[item.type] }}</span>
          <span class="toast-msg">{{ item.message }}</span>
          <button class="toast-close">✕</button>
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<script setup>
import { useToastStore } from '../stores/toast.js'
import { storeToRefs } from 'pinia'

const toastStore = useToastStore()
const { items } = storeToRefs(toastStore)
const { dismiss } = toastStore

const icons = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ'
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 8px;
  background: var(--bg-panel, #1a1a1c);
  border: 1px solid var(--border-color, #2a2a2d);
  color: var(--text-primary, #e8e6e3);
  font-size: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  pointer-events: all;
  cursor: pointer;
  max-width: 400px;
  transition: all 0.3s ease;
}

.toast-item.toast-hiding {
  opacity: 0;
  transform: translateX(20px);
}

.toast-success { border-left: 3px solid #10b981; }
.toast-error { border-left: 3px solid #ef4444; }
.toast-warning { border-left: 3px solid #f59e0b; }
.toast-info { border-left: 3px solid #5a7d94; }

.toast-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.toast-success .toast-icon { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.toast-error .toast-icon { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.toast-warning .toast-icon { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
.toast-info .toast-icon { background: rgba(90, 125, 148, 0.15); color: #5a7d94; }

.toast-msg {
  flex: 1;
  line-height: 1.4;
}

.toast-close {
  background: none;
  border: none;
  color: var(--text-muted, #7a7a7a);
  cursor: pointer;
  font-size: 12px;
  padding: 2px;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.toast-close:hover {
  opacity: 1;
}

.toast-enter-active {
  transition: all 0.3s ease;
}

.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(40px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
</style>
