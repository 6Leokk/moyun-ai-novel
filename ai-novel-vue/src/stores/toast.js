import { defineStore } from 'pinia'

let nextId = 1

export const useToastStore = defineStore('toast', {
  state: () => ({
    items: []
  }),

  actions: {
    show(message, type = 'info', duration = 4000) {
      const id = nextId++
      this.items.push({ id, message, type, visible: true })
      if (duration > 0) {
        setTimeout(() => this.dismiss(id), duration)
      }
      if (this.items.length > 5) {
        this.items = this.items.slice(-5)
      }
      return id
    },

    success(message, duration) {
      return this.show(message, 'success', duration)
    },

    error(message, duration = 6000) {
      return this.show(message, 'error', duration)
    },

    warning(message, duration = 5000) {
      return this.show(message, 'warning', duration)
    },

    dismiss(id) {
      const item = this.items.find(i => i.id === id)
      if (item) item.visible = false
      setTimeout(() => {
        this.items = this.items.filter(i => i.id !== id)
      }, 300)
    }
  }
})
