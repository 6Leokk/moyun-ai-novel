<template>
  <BaseModal title="✨ AI生成剧情" @close="$emit('close')">
    <div class="form-group">
      <label class="form-label">剧情类型</label>
      <select v-model="form.type" class="form-input form-select">
        <option>主线推进</option><option>支线展开</option><option>情感暗线</option>
        <option>反转高潮</option><option>结局走向</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">涉及角色</label>
      <input v-model="form.characters" class="form-input" placeholder="例：零、老魏、织" />
    </div>
    <div class="form-group">
      <label class="form-label">剧情方向 / AI提示</label>
      <textarea v-model="form.direction" class="form-input form-textarea" placeholder="描述你期望的剧情走向，AI将基于现有世界观和角色关系生成详细的剧情节点..."></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">覆盖章节数</label>
      <select v-model="form.chapterRange" class="form-input form-select">
        <option>1-2章</option><option>3-5章</option><option>5-10章</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn" @click="$emit('close')">取消</button>
      <button class="btn btn-ai" @click="$emit('ai-generate', {...form})">🤖 AI生成剧情节点</button>
    </div>
  </BaseModal>
</template>

<script setup>
import { reactive } from 'vue'
import BaseModal from './BaseModal.vue'

defineEmits(['close', 'ai-generate'])

const form = reactive({ type: '主线推进', characters: '', direction: '', chapterRange: '3-5章' })
</script>