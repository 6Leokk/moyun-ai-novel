import { api, getAuthToken, clearAuthToken } from './index.js'

// Projects
export const getProjects = () => api.get('/projects')
export const getProject = (id) => api.get(`/projects/${id}`)
export const createProject = (data) => api.post('/projects', data)
export const updateProject = (id, data) => api.put(`/projects/${id}`, data)
export const deleteProject = (id) => api.del(`/projects/${id}`)

// Chapters
export const getChapters = (projectId) => api.get(`/projects/${projectId}/chapters`)
export const getChapter = (chapterId) => api.get(`/chapters/${chapterId}`)
export const createChapter = (projectId, data) => api.post(`/projects/${projectId}/chapters`, data)
export const updateChapter = (chapterId, data) => api.put(`/chapters/${chapterId}`, data)
export const deleteChapter = (chapterId) => api.del(`/chapters/${chapterId}`)

// Characters
export const getCharacters = (projectId) => api.get(`/projects/${projectId}/characters`)
export const createCharacter = (projectId, data) => api.post(`/projects/${projectId}/characters`, data)
export const updateCharacter = (characterId, data) => api.put(`/characters/${characterId}`, data)
export const deleteCharacter = (characterId) => api.del(`/characters/${characterId}`)

// Relationships
export const getRelationships = (projectId) => api.get(`/projects/${projectId}/relationships`)
export const createRelationship = (projectId, data) => api.post(`/projects/${projectId}/relationships`, data)
export const deleteRelationship = (relationshipId) => api.del(`/relationships/${relationshipId}`)

// Plot Nodes
export const getPlotNodes = (projectId) => api.get(`/projects/${projectId}/plot-nodes`)
export const createPlotNode = (projectId, data) => api.post(`/projects/${projectId}/plot-nodes`, data)
export const updatePlotNode = (nodeId, data) => api.put(`/plot-nodes/${nodeId}`, data)
export const deletePlotNode = (nodeId) => api.del(`/plot-nodes/${nodeId}`)

// World Entries
export const getWorldEntries = (projectId) => api.get(`/projects/${projectId}/world-entries`)
export const createWorldEntry = (projectId, data) => api.post(`/projects/${projectId}/world-entries`, data)
export const updateWorldEntry = (entryId, data) => api.put(`/world-entries/${entryId}`, data)
export const deleteWorldEntry = (entryId) => api.del(`/world-entries/${entryId}`)

// Settings
export const getSettings = () => api.get('/settings')
export const updateSettings = (data) => api.put('/settings', data)

// Health
export const checkHealth = () => api.get('/health')

// Export
export function getExportUrl(projectId, format) {
  return `/api/projects/${projectId}/export?format=${format}`
}

export async function downloadProjectExport(projectId) {
  const token = getAuthToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}/projects/${projectId}/export`, { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '导出失败' }))
    throw new Error(err.error || '导出失败')
  }

  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match ? decodeURIComponent(match[1]) : 'project-export.json'

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function importProject(jsonData) {
  const data = await api.post('/projects/import', jsonData)
  return data
}

// Inspirations
export const getInspirations = (projectId) => api.get(`/projects/${projectId}/inspirations`)
export const generateInspirations = (projectId, category = 'idea', count = 3) =>
  api.post(`/projects/${projectId}/inspirations/generate`, { category, count })
export const deleteInspiration = (id) => api.del(`/inspirations/${id}`)

// Writing Styles
export const getWritingStyles = () => api.get('/writing-styles')
export const getWritingStyle = (id) => api.get(`/writing-styles/${id}`)
export const createWritingStyle = (data) => api.post('/writing-styles', data)
export const updateWritingStyle = (id, data) => api.put(`/writing-styles/${id}`, data)
export const deleteWritingStyle = (id) => api.del(`/writing-styles/${id}`)
export const getProjectDefaultStyle = (projectId) => api.get(`/projects/${projectId}/default-style`)
export const setProjectDefaultStyle = (projectId, styleId) =>
  api.put(`/projects/${projectId}/default-style`, { styleId })

// Prompt Templates
export const getPromptTemplates = () => api.get('/prompt-templates')
export const getPromptTemplate = (id) => api.get(`/prompt-templates/${id}`)
export const createPromptTemplate = (data) => api.post('/prompt-templates', data)
export const updatePromptTemplate = (id, data) => api.put(`/prompt-templates/${id}`, data)
export const deletePromptTemplate = (id) => api.del(`/prompt-templates/${id}`)
export const resetPromptTemplate = (id) => api.post(`/prompt-templates/${id}/reset`)

// Foreshadows
export const getForeshadows = (projectId) => api.get(`/projects/${projectId}/foreshadows`)
export const createForeshadow = (projectId, data) => api.post(`/projects/${projectId}/foreshadows`, data)
export const updateForeshadow = (id, data) => api.put(`/foreshadows/${id}`, data)
export const deleteForeshadow = (id) => api.del(`/foreshadows/${id}`)
export const getForeshadowStats = (projectId) => api.get(`/projects/${projectId}/foreshadows/stats`)

// Careers
export const getCareers = (projectId) => api.get(`/projects/${projectId}/careers`)
export const createCareer = (projectId, data) => api.post(`/projects/${projectId}/careers`, data)
export const updateCareer = (id, data) => api.put(`/careers/${id}`, data)
export const deleteCareer = (id) => api.del(`/careers/${id}`)
export const getCharacterCareers = (characterId) => api.get(`/characters/${characterId}/careers`)
export const assignCareer = (characterId, data) => api.post(`/characters/${characterId}/careers`, data)
export const updateCareerProgress = (id, data) => api.put(`/character-careers/${id}`, data)
export const unassignCareer = (id) => api.del(`/character-careers/${id}`)

// Chapter Graph
export const getChapterGraph = (projectId) => api.get(`/projects/${projectId}/chapter-graph`)

// Prompt Workshop
export const browseWorkshop = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return api.get(`/prompt-workshop${qs ? '?' + qs : ''}`)
}
export const getWorkshopTemplate = (id) => api.get(`/prompt-workshop/${id}`)
export const forkWorkshopTemplate = (id) => api.post(`/prompt-workshop/${id}/fork`)
export const rateWorkshopTemplate = (id, rating) => api.post(`/prompt-workshop/${id}/rate`, { rating })
export const publishPromptTemplate = (id) => api.post(`/prompt-templates/${id}/publish`)
export const unpublishPromptTemplate = (id) => api.post(`/prompt-templates/${id}/unpublish`)

// Book Analysis
export const analyzeBook = (text, title, genre) =>
  api.post('/ai/analyze-book', { text, title, genre })

// Search
export const searchProject = (projectId, q) => api.get(`/projects/${projectId}/search?q=${encodeURIComponent(q)}`)

// Chapter Versions
export const getChapterVersions = (chapterId) => api.get(`/chapters/${chapterId}/versions`)
export const createChapterVersion = (chapterId) => api.post(`/chapters/${chapterId}/versions`)
export const restoreChapterVersion = (chapterId, versionId) => api.post(`/chapters/${chapterId}/versions/${versionId}/restore`)

// Stats
export const getDailyStats = (projectId, days = 30) => api.get(`/projects/${projectId}/stats/daily?days=${days}`)
export const getStatsSummary = (projectId) => api.get(`/projects/${projectId}/stats/summary`)

// ── Chapter AI (SSE streaming) ──

const BASE_URL = '/api'

function parseSSELine(line) {
  if (line.startsWith('id: ')) return { id: parseInt(line.slice(4)) }
  if (line.startsWith('event: ')) return { event: line.slice(7) }
  if (line.startsWith('data: ')) return { data: line.slice(6) }
  return null
}

async function chapterSSERequest(path, body, { onChunk, onResult, onError }) {
  const token = getAuthToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  } catch (e) {
    onError('网络连接失败，请检查网络')
    return
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthToken()
      window.location.href = '/login'
      return
    }
    try {
      const err = await response.json()
      onError(err.error || '请求失败')
    } catch {
      onError(`请求失败 (${response.status})`)
    }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''
  let currentData = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep the last incomplete line in buffer
      buffer = lines.pop() || ''

      for (const line of lines) {
        // Skip empty lines and comments (heartbeats)
        if (line === '' || line.startsWith(':')) {
          // Empty line = message boundary. Dispatch the event.
          if (currentEvent || currentData) {
            try {
              const parsed = currentData ? JSON.parse(currentData) : {}
              if (currentEvent === 'chunk' || !currentEvent) {
                onChunk(parsed.text || '')
              } else if (currentEvent === 'result') {
                onResult(parsed)
              } else if (currentEvent === 'done') {
                // stream complete, reader will exit
              } else if (currentEvent === 'error') {
                onError(parsed.message || '未知错误')
              }
            } catch {
              // JSON parse error, ignore malformed event
            }
          }
          currentEvent = ''
          currentData = ''
          continue
        }

        const parsed = parseSSELine(line)
        if (!parsed) continue
        if ('event' in parsed) currentEvent = parsed.event
        if ('data' in parsed) currentData = parsed.data
      }
    }
  } catch (e) {
    onError('读取流数据失败')
  } finally {
    reader.releaseLock()
  }
}

// POST /api/chapters/:id/generate
export function generateChapter(chapterId, callbacks) {
  return chapterSSERequest(`/chapters/${chapterId}/generate`, {}, callbacks)
}

// POST /api/chapters/:id/continue
export function continueChapter(chapterId, callbacks) {
  return chapterSSERequest(`/chapters/${chapterId}/continue`, {}, callbacks)
}

// POST /api/chapters/:id/polish
export function polishChapter(chapterId, instruction, callbacks) {
  return chapterSSERequest(`/chapters/${chapterId}/polish`, { instruction: instruction || '润色优化文笔，保持内容不变' }, callbacks)
}

// POST /api/chapters/:id/regenerate
export function regenerateChapter(chapterId, feedback, callbacks) {
  return chapterSSERequest(`/chapters/${chapterId}/regenerate`, { feedback }, callbacks)
}

// ── Agent Deep Generation ──

export async function generateAgent(chapterId, { mode = 'generate', instruction, styleId, targetWords, idempotencyKey }, callbacks) {
  const token = getAuthToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}/chapters/${chapterId}/generate-agent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode, instruction, styleId, targetWords, idempotencyKey }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }))
    callbacks.onError(err.error || '请求失败')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''
  let currentData = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line === '' || line.startsWith(':')) {
        if (currentEvent || currentData) {
          try {
            const parsed = currentData ? JSON.parse(currentData) : {}
            if (currentEvent === 'chunk') {
              callbacks.onChunk(parsed.text || '', parsed)
            } else if (currentEvent === 'agent:phase') {
              callbacks.onPhase(parsed)
            } else if (currentEvent === 'agent:scene') {
              callbacks.onScene(parsed)
            } else if (currentEvent === 'agent:tool') {
              callbacks.onTool(parsed)
            } else if (currentEvent === 'agent:issue') {
              callbacks.onIssue?.(parsed.issue)
            } else if (currentEvent === 'agent:plan_ready') {
              callbacks.onPlanReady?.(parsed)
            } else if (currentEvent === 'agent:plan_patch') {
              callbacks.onPlanPatch?.(parsed.patch)
            } else if (currentEvent === 'result') {
              callbacks.onResult(parsed)
            } else if (currentEvent === 'done') {
              // stream complete
            } else if (currentEvent === 'error') {
              callbacks.onError(parsed.message || '未知错误')
            }
          } catch { /* ignore parse errors */ }
        }
        currentEvent = ''
        currentData = ''
        continue
      }

      const parsed = parseSSELine(line)
      if (!parsed) continue
      if ('event' in parsed) currentEvent = parsed.event
      if ('data' in parsed) currentData = parsed.data
    }
  }
}

export const getAgentRun = (runId) => api.get(`/agent-runs/${runId}`)
export const cancelAgentRun = (runId) => api.post(`/agent-runs/${runId}/cancel`)
export const acceptAgentRun = (runId) => api.post(`/agent-runs/${runId}/accept`)
export const discardAgentRun = (runId) => api.post(`/agent-runs/${runId}/discard`)
export const confirmAgentPlan = (runId, confirmedPlan) => api.post(`/agent-runs/${runId}/confirm-plan`, { confirmedPlan })
