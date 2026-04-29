<template>
  <aside class="ai-panel">
    <div class="ai-panel-header">
      <div class="ai-panel-title">
        <div class="ai-dot"></div>
        <span>墨韵 AI</span>
        <span class="ai-model-tag">GPT-4o</span>
      </div>
      <button class="ai-panel-close" @click="closePanel">✕</button>
    </div>

    <div class="ai-messages" ref="messagesRef">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="ai-msg"
        :class="{ 'ai-msg-user': msg.role === 'user' }"
      >
        <div class="ai-msg-avatar" :class="msg.role">
          {{ msg.role === 'ai' ? '🤖' : '笔' }}
        </div>
        <div class="ai-msg-content">
          <div class="ai-msg-name">{{ msg.name }}</div>
          <div class="ai-msg-text">
            <template v-for="(seg, i) in parseMessage(msg.text)" :key="i">
              <br v-if="seg.type === 'br'">
              <strong v-else-if="seg.type === 'bold'" v-text="seg.text"></strong>
              <template v-else>{{ seg.text }}</template>
            </template>
          </div>
        </div>
      </div>

      <div v-if="isTyping" class="ai-msg">
        <div class="ai-msg-avatar ai">🤖</div>
        <div class="ai-msg-content">
          <div class="ai-msg-name">墨韵 AI</div>
          <div class="ai-msg-text">
            <div class="ai-typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AgentTimeline />

    <div class="ai-input-area">
      <div class="ai-suggestions">
        <button
          v-for="s in suggestions"
          :key="s"
          class="ai-suggestion-chip"
          @click="sendMessage(s)"
        >
          {{ s }}
        </button>
      </div>
      <div class="ai-input-wrapper">
        <textarea
          v-model="inputText"
          class="ai-input"
          placeholder="向AI助手提问或请求创作..."
          rows="1"
          @keydown.enter.exact.prevent="handleSend"
        ></textarea>
        <button class="ai-send-btn" :class="{ active: inputText.trim() }" @click="handleSend">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue'
import { useAIStore } from '../stores/ai'
import { storeToRefs } from 'pinia'
import AgentTimeline from './AgentTimeline.vue'

const aiStore = useAIStore()
const { messages, isTyping } = storeToRefs(aiStore)
const { closePanel, sendMessage } = aiStore
const inputText = ref('')
const messagesRef = ref(null)

const suggestions = ['✍️ 续写章节', '👤 角色对话', '✨ 润色文笔', '🗺️ 剧情建议']

function handleSend() {
  if (!inputText.value.trim()) return
  sendMessage(inputText.value)
  inputText.value = ''
}

const BOLD_RE = /\*\*(.+?)\*\*/g
function parseMessage(text) {
  const segments = []
  let last = 0
  let match
  BOLD_RE.lastIndex = 0
  while ((match = BOLD_RE.exec(text)) !== null) {
    if (match.index > last) {
      pushText(segments, text.slice(last, match.index))
    }
    segments.push({ type: 'bold', text: match[1] })
    last = match.index + match[0].length
  }
  if (last < text.length) {
    pushText(segments, text.slice(last))
  }
  return segments
}

function pushText(segments, raw) {
  // Split by newlines so <br> can be inserted as separate segment
  const parts = raw.split('\n')
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) segments.push({ type: 'br' })
    if (parts[i]) segments.push({ type: 'text', text: parts[i] })
  }
}

let scrollPending = false
function scrollToBottom() {
  if (scrollPending) return
  scrollPending = true
  nextTick(() => {
    scrollPending = false
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

watch([() => messages.value.length, isTyping], scrollToBottom)
</script>

<style scoped>
.ai-panel {
  width: var(--chat-width);
  background: var(--bg-primary);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  contain: layout style;
}

.ai-panel-header {
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.ai-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}

.ai-model-tag {
  font-size: 15px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--accent-dark);
  color: var(--accent-light);
  font-weight: 500;
}

.ai-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-green);
  animation: pulse 2s infinite;
}

.ai-panel-close {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 15px;
  padding: 4px 6px;
  transition: all var(--transition-fast);
  background: none;
  border: none;
  border-radius: var(--radius-xs);
}

.ai-panel-close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ai-msg {
  display: flex;
  gap: 8px;
  animation: fadeSlideUp 0.3s ease;
}

.ai-msg-avatar {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}

.ai-msg-avatar.ai { background: var(--gradient-brand); }
.ai-msg-avatar.user { background: var(--bg-card); }

.ai-msg-content {
  flex: 1;
  min-width: 0;
}

.ai-msg-name {
  font-size: 15px;
  color: var(--text-muted);
  margin-bottom: 3px;
  font-weight: 500;
}

.ai-msg-text {
  font-size: 15px;
  line-height: 1.75;
  color: var(--text-primary);
  background: var(--bg-secondary);
  padding: 12px 15px;
  border-radius: var(--radius-sm);
  border-top-left-radius: 2px;
  word-break: break-word;
}

.ai-msg-text :deep(strong) {
  color: var(--accent-light);
  font-weight: 600;
}

.ai-msg-user .ai-msg-text {
  background: var(--accent-dark);
  border-radius: var(--radius-sm);
  border-top-right-radius: 2px;
}

.ai-typing {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}

.ai-typing span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-light);
  animation: typing-bounce 1.4s infinite;
}

.ai-typing span:nth-child(2) { animation-delay: 0.2s; }
.ai-typing span:nth-child(3) { animation-delay: 0.4s; }

.ai-input-area {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.ai-suggestions {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.ai-suggestion-chip {
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  font-family: inherit;
}

.ai-suggestion-chip:hover {
  border-color: var(--accent);
  color: var(--text-accent);
  background: rgba(74, 109, 122, 0.08);
}

.ai-input-wrapper {
  display: flex;
  gap: 6px;
  align-items: flex-end;
}

.ai-input {
  flex: 1;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 11px 15px;
  color: var(--text-primary);
  font-size: 15px;
  resize: none;
  outline: none;
  min-height: 38px;
  max-height: 100px;
  font-family: inherit;
  transition: border-color var(--transition-fast);
  line-height: 1.5;
}

.ai-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(74, 109, 122, 0.1);
}

.ai-send-btn {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.ai-send-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.ai-send-btn.active:hover {
  background: var(--accent-light);
  transform: scale(1.05);
}
</style>