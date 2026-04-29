import { api, setAuthToken, clearAuthToken, getAuthToken } from './index.js'

export async function register({ email, password, nickname }) {
  const data = await api.post('/auth/register', { email, password, nickname })
  setAuthToken(data.token)
  return data
}

export async function login({ email, password }) {
  const data = await api.post('/auth/login', { email, password })
  setAuthToken(data.token)
  return data
}

export async function refreshToken(token) {
  const data = await api.post('/auth/refresh', { token })
  setAuthToken(data.token)
  return data
}

export function logout() {
  clearAuthToken()
}

export function getOAuthUrl() {
  return '/api/auth/oauth/linuxdo'
}

export function applyOAuthToken(token) {
  setAuthToken(token)
}

export function checkOAuthCallback() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  const error = params.get('error')
  if (token) {
    window.history.replaceState({}, '', window.location.pathname)
    return { token }
  }
  if (error) {
    window.history.replaceState({}, '', window.location.pathname)
    return { error: decodeURIComponent(error) }
  }
  return null
}