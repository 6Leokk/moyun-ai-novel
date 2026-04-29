import { defineStore } from 'pinia'
import { shallowRef, computed } from 'vue'
import * as novelApi from '../api/novel.js'

function enrichChars(list) {
  return list.map(c => ({
    ...c,
    avatarGradient: c.color
      ? `linear-gradient(135deg, ${c.color}, ${adjustColor(c.color, 30)})`
      : 'linear-gradient(135deg, #5a7d94, #06b6d4)'
  }))
}

function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, (num >> 16) + amount)
  const g = Math.min(255, ((num >> 8) & 0xff) + amount)
  const b = Math.min(255, (num & 0xff) + amount)
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`
}

function groupWorldEntries(entries) {
  const groups = { location: [], system: [], faction: [], item: [] }
  for (const e of entries) {
    const cat = e.category || 'location'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(e)
  }
  return groups
}

export const useNovelStore = defineStore('novel', {
  state: () => ({
    project: null,
    chapters: shallowRef([]),
    characters: shallowRef([]),
    relationships: shallowRef([]),
    plotNodes: shallowRef([]),
    worldEntries: shallowRef({}),
    loading: false,
    error: null
  }),

  getters: {
    totalWords: (state) => state.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0),

    completionRate(state) {
      if (!state.project?.targetWords) return 0
      return Math.round((this.totalWords / state.project.targetWords) * 100)
    },

    chapterStats: (state) => {
      const done = state.chapters.filter(c => c.status === 'done').length
      const writing = state.chapters.filter(c => c.status === 'writing').length
      const draft = state.chapters.filter(c => c.status === 'draft').length
      return { total: state.chapters.length, done, writing, draft }
    },

    characterAppearances(state) {
      const stats = {}
      state.characters.forEach(c => {
        stats[c.id] = { id: c.id, name: c.name, color: c.color, role: c.role, appearances: 0 }
      })
      return Object.values(stats).sort((a, b) => b.appearances - a.appearances)
    },

    plotTree(state) {
      return state.plotNodes
        .filter(n => !n.parentId)
        .map(n => ({
          ...n,
          children: state.plotNodes.filter(c => c.parentId === n.id)
        }))
    },

    relationshipGraph(state) {
      const nodeMap = {}
      state.characters.forEach(c => {
        nodeMap[c.id] = { id: c.id, name: c.name, avatarChar: c.avatarChar, color: c.color, role: c.role }
      })
      const edges = state.relationships.map(r => ({
        ...r,
        source: r.sourceId,
        target: r.targetId,
        sourceName: nodeMap[r.sourceId]?.name || r.sourceId,
        targetName: nodeMap[r.targetId]?.name || r.targetId
      }))
      return { nodes: Object.values(nodeMap), edges }
    },

    consistencyChecks(state) {
      const checks = []
      state.characters.forEach(c => {
        if (state.relationships.every(r => r.sourceId !== c.id && r.targetId !== c.id)) {
          checks.push({ type: 'warning', icon: '⚠️', message: `角色「${c.name}」未参与任何关系` })
        }
      })
      state.chapters.forEach(ch => {
        if (ch.status === 'draft' && ch.wordCount > 0) {
          checks.push({ type: 'info', icon: '📝', message: `第${ch.num}章「${ch.title}」仍为草稿但已有${ch.wordCount}字` })
        }
      })
      const relPairs = new Set()
      state.relationships.forEach(r => {
        const key = `${r.sourceId}-${r.targetId}-${r.type}`
        if (relPairs.has(key)) {
          const src = state.characters.find(c => c.id === r.sourceId)
          const tgt = state.characters.find(c => c.id === r.targetId)
          checks.push({ type: 'warning', icon: '🔁', message: `「${src?.name}」与「${tgt?.name}」之间存在重复的${r.type}关系` })
        }
        relPairs.add(key)
      })
      const sorted = state.chapters.map(c => c.num).sort((a, b) => a - b)
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] - sorted[i - 1] > 1) {
          checks.push({ type: 'warning', icon: '🔢', message: `章节编号不连续：第${sorted[i - 1]}章之后跳到第${sorted[i]}章` })
        }
      }
      return checks
    },

    wordsByChapter: (state) => state.chapters.map(ch => ({
      label: `第${ch.num}章`, value: ch.wordCount || 0, title: ch.title, status: ch.status
    })),

    plotCompletion(state) {
      const arcs = state.plotNodes.filter(n => !n.parentId)
      return arcs.map(arc => {
        const scenes = state.plotNodes.filter(n => n.parentId === arc.id)
        const withChapter = scenes.filter(s => s.chapterId).length
        return {
          title: arc.title, color: arc.color, total: scenes.length, withChapter,
          completion: scenes.length > 0 ? Math.round((withChapter / scenes.length) * 100) : 0
        }
      })
    }
  },

  actions: {
    async loadProject(projectId) {
      try {
        const data = await novelApi.getProject(projectId)
        this.project = data.project
      } catch (e) {
        this.error = e.message
      }
    },

    async loadChapters(projectId) {
      try {
        const data = await novelApi.getChapters(projectId)
        this.chapters = shallowRef(data.chapters)
      } catch (e) {
        this.error = e.message
      }
    },

    async loadCharacters(projectId) {
      try {
        const data = await novelApi.getCharacters(projectId)
        this.characters = shallowRef(enrichChars(data.characters))
      } catch (e) {
        this.error = e.message
      }
    },

    async loadRelationships(projectId) {
      try {
        const data = await novelApi.getRelationships(projectId)
        this.relationships = shallowRef(data.relationships)
      } catch (e) {
        this.error = e.message
      }
    },

    async loadPlotNodes(projectId) {
      try {
        const data = await novelApi.getPlotNodes(projectId)
        this.plotNodes = shallowRef(data.plotNodes)
      } catch (e) {
        this.error = e.message
      }
    },

    async loadWorldEntries(projectId) {
      try {
        const data = await novelApi.getWorldEntries(projectId)
        this.worldEntries = shallowRef(groupWorldEntries(data.worldEntries))
      } catch (e) {
        this.error = e.message
      }
    },

    async loadAll(projectId) {
      this.loading = true
      this.error = null
      try {
        await Promise.all([
          this.loadProject(projectId),
          this.loadChapters(projectId),
          this.loadCharacters(projectId),
          this.loadRelationships(projectId),
          this.loadPlotNodes(projectId),
          this.loadWorldEntries(projectId)
        ])
      } catch (e) {
        this.error = e.message
      } finally {
        this.loading = false
      }
    },

    async updateProject(updates) {
      try {
        const data = await novelApi.updateProject(this.project.id, updates)
        this.project = data.project
      } catch (e) {
        this.error = e.message
      }
    },

    async saveChapterContent(chapterId, content) {
      try {
        const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length
        const englishWords = (content.replace(/[\u4e00-\u9fff]/g, '').match(/\b[a-zA-Z]+\b/g) || []).length
        const wordCount = chineseChars + englishWords
        const data = await novelApi.updateChapter(chapterId, { content, wordCount })
        this.chapters = shallowRef(this.chapters.map(ch => {
          if (ch.id !== chapterId) return ch
          const newStatus = ch.status === 'done' ? 'done' : (wordCount > 0 ? 'writing' : 'draft')
          return { ...ch, wordCount, status: newStatus }
        }))
      } catch (e) {
        this.error = e.message
      }
    },

    async loadChapterContent(chapterId) {
      try {
        const data = await novelApi.getChapter(chapterId)
        return data.chapter.content || ''
      } catch (e) {
        return ''
      }
    },

    async addChapter(chapter) {
      try {
        const data = await novelApi.createChapter(this.project.id, chapter)
        this.chapters = shallowRef([...this.chapters, data.chapter])
        return data.chapter
      } catch (e) {
        this.error = e.message
      }
    },

    async updateChapter(chapterId, updates) {
      try {
        await novelApi.updateChapter(chapterId, updates)
        this.chapters = shallowRef(this.chapters.map(ch =>
          ch.id === chapterId ? { ...ch, ...updates } : ch
        ))
      } catch (e) {
        this.error = e.message
      }
    },

    async deleteChapter(chapterId) {
      try {
        await novelApi.deleteChapter(chapterId)
        this.chapters = shallowRef(this.chapters.filter(ch => ch.id !== chapterId))
      } catch (e) {
        this.error = e.message
      }
    },

    async addCharacter(character) {
      try {
        const data = await novelApi.createCharacter(this.project.id, character)
        this.characters = shallowRef(enrichChars([...this.characters, data.character]))
        return data.character
      } catch (e) {
        this.error = e.message
      }
    },

    async removeCharacter(charId) {
      try {
        await novelApi.deleteCharacter(charId)
        this.characters = shallowRef(this.characters.filter(c => c.id !== charId))
        this.relationships = shallowRef(this.relationships.filter(r => r.sourceId !== charId && r.targetId !== charId))
      } catch (e) {
        this.error = e.message
      }
    },

    async updateCharacter(characterId, updates) {
      try {
        const data = await novelApi.updateCharacter(characterId, updates)
        this.characters = shallowRef(enrichChars(this.characters.map(c =>
          c.id === characterId ? data.character : c
        )))
      } catch (e) {
        this.error = e.message
      }
    },

    async addRelationship(rel) {
      try {
        const data = await novelApi.createRelationship(this.project.id, rel)
        this.relationships = shallowRef([...this.relationships, data.relationship])
        return data.relationship
      } catch (e) {
        this.error = e.message
      }
    },

    async removeRelationship(relId) {
      try {
        await novelApi.deleteRelationship(relId)
        this.relationships = shallowRef(this.relationships.filter(r => r.id !== relId))
      } catch (e) {
        this.error = e.message
      }
    },

    async addPlotNode(node) {
      try {
        const data = await novelApi.createPlotNode(this.project.id, node)
        this.plotNodes = shallowRef([...this.plotNodes, data.plotNode])
        return data.plotNode
      } catch (e) {
        this.error = e.message
      }
    },

    async removePlotNode(nodeId) {
      try {
        await novelApi.deletePlotNode(nodeId)
        this.plotNodes = shallowRef(this.plotNodes.filter(n => n.id !== nodeId && n.parentId !== nodeId))
      } catch (e) {
        this.error = e.message
      }
    },

    async addWorldEntry(entry) {
      try {
        const data = await novelApi.createWorldEntry(this.project.id, entry)
        const newEntry = data.worldEntry
        const grouped = { ...this.worldEntries }
        const cat = newEntry.category || 'location'
        if (!grouped[cat]) grouped[cat] = []
        grouped[cat] = [...grouped[cat], newEntry]
        this.worldEntries = shallowRef(grouped)
        return newEntry
      } catch (e) {
        this.error = e.message
      }
    },

    async removeWorldEntry(entryId) {
      try {
        await novelApi.deleteWorldEntry(entryId)
        const grouped = {}
        for (const [cat, entries] of Object.entries(this.worldEntries)) {
          grouped[cat] = entries.filter(e => e.id !== entryId)
        }
        this.worldEntries = shallowRef(grouped)
      } catch (e) {
        this.error = e.message
      }
    }
  }
})