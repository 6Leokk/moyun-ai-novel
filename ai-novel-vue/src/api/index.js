const BASE_URL = '/api'

let authToken = null

export function setAuthToken(token) {
  authToken = token
  if (token) {
    localStorage.setItem('auth_token', token)
  } else {
    localStorage.removeItem('auth_token')
  }
}

export function getAuthToken() {
  if (!authToken) {
    authToken = localStorage.getItem('auth_token')
  }
  return authToken
}

export function clearAuthToken() {
  authToken = null
  localStorage.removeItem('auth_token')
}

const RETRY_STATUS_CODES = new Set([502, 503, 504])
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function request(path, options = {}) {
  const token = getAuthToken()
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const timeout = options.timeout || 30000
  let lastError = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
        signal: controller.signal
      })

      clearTimeout(timer)

      if (res.status === 204) return null

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 401) {
          clearAuthToken()
          if (window.location.pathname !== '/login') {
            window.location.href = '/login'
          }
        }
        if (res.status === 429) {
          const err = new Error(data.error?.message || '请求过于频繁，请稍后重试')
          err.code = 'RATE_LIMIT_EXCEEDED'
          err.status = 429
          throw err
        }
        if (RETRY_STATUS_CODES.has(res.status) && attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1))
          continue
        }
        const err = new Error(data.error?.message || '请求失败')
        err.code = data.error?.code
        err.status = res.status
        err.details = data.error?.details
        throw err
      }

      return data
    } catch (e) {
      lastError = e
      if (e.name === 'AbortError') {
        const err = new Error('请求超时，请检查网络连接')
        err.code = 'TIMEOUT'
        err.status = 0
        throw err
      }
      if (attempt < MAX_RETRIES && !e.status) {
        await sleep(RETRY_DELAY_MS * (attempt + 1))
        continue
      }
      throw e
    }
  }

  throw lastError
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' })
}