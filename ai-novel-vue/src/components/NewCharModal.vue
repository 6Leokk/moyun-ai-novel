<template>
  <BaseModal title="✨ AI创建角色" @close="$emit('close')">
    <div class="form-group">
      <label class="form-label">角色名称</label>
      <input v-model="form.name" class="form-input" placeholder="输入角色名称或留空由AI生成..." />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">角色定位</label>
        <select v-model="form.role" class="form-input form-select">
          <option>主角</option><option>配角</option><option>反派</option><option>次要角色</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">性别</label>
        <select v-model="form.gender" class="form-input form-select">
          <option>女</option><option>男</option><option>其他</option><option>由AI决定</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">角色描述 / AI提示</label>
      <textarea v-model="form.desc" class="form-input form-textarea" placeholder="描述角色的基本设定、性格倾向、与现有角色的关系等，AI将生成完整的角色档案..."></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn" @click="$emit('close')">取消</button>
      <button class="btn btn-ai" @click="$emit('ai-generate', {...form})">🤖 AI生成完整角色</button>
    </div>
  </BaseModal>
</template>

<script setup>
import { reactive } from 'vue'
import BaseModal from './BaseModal.vue'

defineEmits(['close', 'ai-generate'])

const form = reactive({ name: '', role: '主角', gender: '女', desc: '' })
</script>