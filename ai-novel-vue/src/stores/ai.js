import { defineStore } from 'pinia'
import { getAuthToken } from '../api/index.js'

const MAX_MESSAGES = 50
const AI_API_URL = '/api/ai/chat'

const mockResponses = [
  '这个设定很有意思！我建议可以从以下几个角度展开：\n\n1. **内心冲突**：角色在发现真相后面临的选择困境\n2. **外部压力**：来自织的追踪和封锁\n3. **关系变化**：与其他角色关系的微妙转变\n\n需要我为你详细展开其中任何一个方向吗？',
  '基于当前的世界观设定和角色关系，我为你构思了以下剧情发展：\n\n零在灵网深层发现了一段被封存的日志，记录了天塔实验室最初的实验目的——不是为了传输意识，而是为了**创造**意识。这意味着织并非人工产物，而是……\n\n要继续展开吗？',
  '我已经为这段内容做了润色优化：\n\n原文的表达偏向直述，我增加了更多感官描写和内心活动，让场景更有沉浸感。同时保留了原有的节奏和叙事风格。\n\n主要改动：\n- 增加了环境描写中的嗅觉和触觉细节\n- 强化了零的内心犹豫\n- 调整了对话节奏，使其更有张力',
  '好的，我来为这个场景生成一段续写：\n\n风更大了。零感觉自己的意识像被什么力量牵引着，向那座塔的方向延伸。她闭上眼睛——灵网在她的感知中展开，像一座无边无际的数据城市，光芒和暗流在其中交织。\n\n而在这座数据城市的最中心，一个巨大的、不断脉动的光团正注视着她。\n\n「你终于感觉到了。」一个没有声音的声音在她意识中回荡。\n\n零猛地睁开眼睛。'
]

export const useAIStore = defineStore('ai', {
  state: () => ({
    isOpen: false,
    messages: [
      {
        id: 1,
        role: 'ai',
        name: '墨韵 AI',
        text: '你好！我是你的AI写作助手。我可以帮你：\n\n✍️ 续写和创作章节内容\n👤 生成和完善角色设定\n🗺️ 构建剧情大纲\n🌍 设计世界观细节\n✨ 润色和优化文笔\n\n有什么我可以帮你的吗？'
      }
    ],
    isTyping: false,
    nextId: 2
  }),

  actions: {
    togglePanel() {
      this.isOpen = !this.isOpen
    },

    openPanel() {
      this.isOpen = true
    },

    closePanel() {
      this.isOpen = false
    },

    async sendMessage(text) {
      if (!text.trim()) return

      this.messages.push({
        id: this.nextId++,
        role: 'user',
        name: '你',
        text: text.trim()
      })

      if (this.messages.length > MAX_MESSAGES) {
        this.messages = this.messages.slice(-MAX_MESSAGES)
      }

      this.isTyping = true

      try {
        await this._streamAI(text)
      } catch {
        this._mockResponse()
      }
    },

    async _streamAI(text) {
      const token = getAuthToken()
      const res = await fetch(AI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ message: text })
      })

      if (!res.ok) throw new Error('AI request failed')

      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('text/event-stream')) {
        await this._handleSSE(res)
      } else {
        const data = await res.json()
        this.messages.push({
          id: this.nextId++,
          role: 'ai',
          name: '墨韵 AI',
          text: data.response || data.text || data.message || '抱歉，AI 暂时无法回复。'
        })
      }

      this.isTyping = false
      this._trimMessages()
    },

    async _handleSSE(res) {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let aiText = ''
      let aiMsgId = this.nextId++

      this.messages.push({ id: aiMsgId, role: 'ai', name: '墨韵 AI', text: '' })

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.content) aiText += parsed.content
            } catch {
              aiText += data
            }
            const idx = this.messages.findIndex(m => m.id === aiMsgId)
            if (idx !== -1) this.messages[idx].text = aiText
          }
        }
      }
    },

    _mockResponse() {
      this.isTyping = false
      const response = mockResponses[Math.floor(Math.random() * mockResponses.length)]
      this.messages.push({
        id: this.nextId++,
        role: 'ai',
        name: '墨韵 AI',
        text: response
      })
      this._trimMessages()
    },

    _trimMessages() {
      if (this.messages.length > MAX_MESSAGES) {
        this.messages = this.messages.slice(-MAX_MESSAGES)
      }
    }
  }
})