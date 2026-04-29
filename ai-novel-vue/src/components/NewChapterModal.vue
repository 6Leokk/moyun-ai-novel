<template>
  <BaseModal title="📝 新建章节" width="440px" @close="$emit('close')">
    <div class="form-group">
      <label class="form-label">章节标题</label>
      <input v-model="form.title" class="form-input" placeholder="输入章节标题..." />
    </div>
    <div class="form-group">
      <label class="form-label">章节概要</label>
      <textarea v-model="form.summary" class="form-input form-textarea" placeholder="简要描述本章内容，AI可基于此生成初稿..."></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn" @click="$emit('close')">取消</button>
      <button class="btn btn-ai" @click="$emit('ai-generate', {...form})">🤖 AI生成初稿</button>
      <button class="btn btn-primary" @click="$emit('create', {...form})">创建</button>
    </div>
  </BaseModal>
</template>

<script setup>
import { reactive } from 'vue'
import BaseModal from './BaseModal.vue'

defineEmits(['close', 'create', 'ai-generate'])

const form = reactive({ title: '', summary: '' })
</script>