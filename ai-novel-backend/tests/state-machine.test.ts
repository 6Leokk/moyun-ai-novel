import { describe, it, expect } from 'vitest'

const VALID_TRANSITIONS: Record<string, string[]> = {
  queued: ['running', 'cancelled'],
  running: ['cancelling', 'completed', 'failed', 'interrupted', 'needs_manual_review'],
  cancelling: ['cancelled'],
  cancelled: [],
  completed: [],
  failed: [],
  interrupted: ['running', 'failed'],
  needs_manual_review: ['completed', 'failed'],
}

const TERMINAL_STATES = ['cancelled', 'completed', 'failed']
const ALL_STATES = ['queued', 'running', 'cancelling', 'cancelled', 'completed', 'failed', 'interrupted', 'needs_manual_review']

describe('Agent Run State Machine', () => {
  it('has 8 states', () => {
    expect(ALL_STATES.length).toBe(8)
  })

  it('queued can transition to running or cancelled', () => {
    expect(VALID_TRANSITIONS.queued).toContain('running')
    expect(VALID_TRANSITIONS.queued).toContain('cancelled')
    expect(VALID_TRANSITIONS.queued.length).toBe(2)
  })

  it('running can transition to 5 states', () => {
    expect(VALID_TRANSITIONS.running).toContain('cancelling')
    expect(VALID_TRANSITIONS.running).toContain('completed')
    expect(VALID_TRANSITIONS.running).toContain('failed')
    expect(VALID_TRANSITIONS.running).toContain('interrupted')
    expect(VALID_TRANSITIONS.running).toContain('needs_manual_review')
  })

  it('cancelling only goes to cancelled', () => {
    expect(VALID_TRANSITIONS.cancelling).toEqual(['cancelled'])
  })

  it('terminal states have no transitions', () => {
    for (const state of TERMINAL_STATES) {
      expect(VALID_TRANSITIONS[state]).toEqual([])
    }
  })

  it('interrupted can recover to running or fail', () => {
    expect(VALID_TRANSITIONS.interrupted).toContain('running')
    expect(VALID_TRANSITIONS.interrupted).toContain('failed')
  })

  it('needs_manual_review can go to completed or failed', () => {
    expect(VALID_TRANSITIONS.needs_manual_review).toContain('completed')
    expect(VALID_TRANSITIONS.needs_manual_review).toContain('failed')
  })

  it('every state has defined transitions', () => {
    for (const state of ALL_STATES) {
      expect(VALID_TRANSITIONS[state]).toBeDefined()
    }
  })

  it('no transition goes to non-existent state', () => {
    for (const [from, tos] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of tos) {
        expect(ALL_STATES).toContain(to)
      }
    }
  })

  it('cancel path: queued→cancelled (skip cancelling)', () => {
    expect(VALID_TRANSITIONS.queued).toContain('cancelled')
    expect(VALID_TRANSITIONS.queued).not.toContain('cancelling')
  })

  it('cancel path: running→cancelling→cancelled', () => {
    expect(VALID_TRANSITIONS.running).toContain('cancelling')
    expect(VALID_TRANSITIONS.cancelling).toContain('cancelled')
  })
})
