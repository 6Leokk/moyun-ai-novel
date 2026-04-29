import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '../api/auth.js'
import { getAuthToken } from '../api/index.js'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const isLoggedIn = computed(() => !!getAuthToken())
  const nickname = computed(() => user.value?.nickname || '')

  async function login({ email, password }) {
    loading.value = true
    error.value = null
    try {
      const data = await authApi.login({ email, password })
      user.value = data.user
      return data
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function register({ email, password, nickname }) {
    loading.value = true
    error.value = null
    try {
      const data = await authApi.register({ email, password, nickname })
      user.value = data.user
      return data
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  function loginWithLinuxDO() {
    window.location.href = authApi.getOAuthUrl()
  }

  function handleOAuthCallback() {
    const result = authApi.checkOAuthCallback()
    if (!result) return null
    if (result.token) {
      authApi.applyOAuthToken(result.token)
      return { success: true }
    }
    if (result.error) {
      error.value = result.error
      return { success: false, error: result.error }
    }
    return null
  }

  function logout() {
    authApi.logout()
    user.value = null
  }

  return { user, loading, error, isLoggedIn, nickname, login, register, loginWithLinuxDO, handleOAuthCallback, logout }
})