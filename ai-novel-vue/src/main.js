import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useToastStore } from './stores/toast.js'
import './assets/styles/base.css'

// Apply saved theme before Vue mounts to avoid flash
;(function applyTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem('app_settings') || '{}')
    const theme = saved.theme || 'dark'
    document.documentElement.setAttribute('data-theme', theme)
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark')
  }
})()

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

const toast = useToastStore()

app.config.errorHandler = (err, _instance, info) => {
  console.error('Vue error:', err, info)
  toast.error(err?.message || '发生了未知错误')
}

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason)
  if (event.reason?.status === 401) return
  toast.error(event.reason?.message || '操作失败')
})

app.mount('#app')
