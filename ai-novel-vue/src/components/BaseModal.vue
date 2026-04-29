<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal" :style="{ maxWidth: width }">
        <div class="modal-header">
          <h2>{{ title }}</h2>
          <button class="modal-close" @click="$emit('close')">✕</button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  width: { type: String, default: '540px' }
})

defineEmits(['close'])
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(180, 170, 150, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  /* backdrop-filter: blur(6px); */
  animation: fadeIn 0.15s ease;
}

.modal {
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  padding: 28px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-xl);
  animation: modal-enter 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22px;
}

.modal-header h2 {
  font-size: 15px;
  font-weight: 600;
}

.modal-close {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  border: none;
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.modal-close:hover {
  background: var(--bg-active);
  color: var(--text-primary);
}
</style>
