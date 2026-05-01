import { describe, it, expect } from 'vitest'
import {
  selectFinalRunState,
  shouldAutoAcceptResult,
} from '../src/services/agent-orchestrator'

describe('Agent orchestrator automation policy', () => {
  it('manual mode sends high severity issues to manual review', () => {
    expect(selectFinalRunState('manual', [{ severity: 'high' }])).toEqual({
      status: 'needs_manual_review',
      phase: 'needs_manual_review',
    })
  })

  it('auto_accept_safe completes only when no high severity issue exists', () => {
    expect(shouldAutoAcceptResult('auto_accept_safe', [{ severity: 'medium' }])).toBe(true)
    expect(selectFinalRunState('auto_accept_safe', [{ severity: 'high' }])).toEqual({
      status: 'needs_manual_review',
      phase: 'needs_manual_review',
    })
  })

  it('auto_accept_all completes even with high severity issues', () => {
    expect(selectFinalRunState('auto_accept_all', [{ severity: 'high' }])).toEqual({
      status: 'completed',
      phase: null,
    })
  })
})
