<template>
  <BaseModal title="✨ 新建小说项目" @close="$emit('close')">
    <div class="form-group">
      <label class="form-label">小说名称</label>
      <input v-model="form.name" class="form-input" placeholder="输入你的小说标题..." />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">类型</label>
        <select v-model="form.genre" class="form-input form-select">
          <option>科幻</option><option>奇幻</option><option>悬疑</option>
          <option>言情</option><option>历史</option><option>武侠</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">目标字数</label>
        <select v-model="form.targetWords" class="form-input form-select">
          <option>10万字 (短篇)</option>
          <option>30万字 (中篇)</option>
          <option>50万字 (长篇)</option>
          <option>100万字+ (超长篇)</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">故事简介</label>
      <textarea v-model="form.synopsis" class="form-input form-textarea" placeholder="描述你的故事核心设定和主要冲突，AI将基于此生成初始大纲和角色..."></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">写作风格参考</label>
      <input v-model="form.styleRef" class="form-input" placeholder="例：刘慈欣的硬科幻 / 东野圭吾的悬疑 / 金庸的武侠..." />
    </div>
    <div class="modal-actions">
      <button class="btn" @click="$emit('close')">取消</button>
      <button class="btn btn-ai" @click="$emit('ai-generate', {...form})">🤖 AI生成大纲与角色</button>
      <button class="btn btn-primary" @click="$emit('create', {...form})">创建项目</button>
    </div>
  </BaseModal>
</template>

<script setup>
import { reactive } from 'vue'
import BaseModal from './BaseModal.vue'

defineEmits(['close', 'create', 'ai-generate'])

const form = reactive({
  name: '',
  genre: '科幻',
  targetWords: '30万字 (中篇)',
  synopsis: '',
  styleRef: ''
})
</script>