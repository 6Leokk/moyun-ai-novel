import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAgentStore = defineStore('agent', () => {
  const currentRunId = ref(null)
  const status = ref(null)      // queued | running | cancelling | cancelled | completed | failed | needs_manual_review
  const phase = ref(null)       // planning | writing | reviewing
  const events = ref([])
  const lastSeq = ref(0)
  const error = ref(null)
  const issues = ref([])

  const isActive = computed(() =>
    ['queued', 'running', 'cancelling'].includes(status.value)
  )
  const isCompleted = computed(() => status.value === 'completed')
  const needsReview = computed(() => status.value === 'needs_manual_review')

  function setRun(runId, runStatus, runPhase) {
    currentRunId.value = runId
    status.value = runStatus
    phase.value = runPhase
    events.value = []
    lastSeq.value = 0
    error.value = null
    issues.value = []
  }

  function addEvent(event) {
    events.value.push(event)
    if (event.seq > lastSeq.value) lastSeq.value = event.seq
  }

  function updatePhase(newPhase, newStatus) {
    if (newPhase) phase.value = newPhase
    if (newStatus) status.value = newStatus
  }

  function setError(msg) {
    error.value = msg
    status.value = 'failed'
  }

  function setIssues(list) {
    issues.value = list || []
  }

  function reset() {
    currentRunId.value = null
    status.value = null
    phase.value = null
    events.value = []
    lastSeq.value = 0
    error.value = null
    issues.value = []
  }

  return {
    currentRunId, status, phase, events, lastSeq, error, issues,
    isActive, isCompleted, needsReview,
    setRun, addEvent, updatePhase, setError, setIssues, reset,
  }
})
