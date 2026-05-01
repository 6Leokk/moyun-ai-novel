import { describe, it, expect } from 'vitest'
import {
  normalizePlannerOutput,
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

describe('Agent planner output normalization', () => {
  it('normalizes Ollama-style planner JSON into the internal writer schema', () => {
    const raw = {
      title: '局域网验收夜',
      summary: '林澈和许安完成闭环验收。',
      scenes: [{
        sceneNumber: 1,
        description: '林澈和许安在局域网终端前完成校验闭环。',
        characters: ['林澈', '许安'],
        keyActions: ['计划确认', '审稿记录', '保存成功'],
        expectedWordCount: '120-220',
      }],
      worldRuleCompliance: '所有操作均通过本地终端进行，并生成可审计记录。',
    }

    expect(normalizePlannerOutput(raw)).toEqual({
      schema_version: 1,
      chapterGoal: '林澈和许安完成闭环验收。',
      tone: '冷静',
      scenes: [{
        id: 'scene-1',
        title: '场景 1',
        goal: '林澈和许安在局域网终端前完成校验闭环。',
        characters: ['林澈', '许安'],
        beats: ['计划确认', '审稿记录', '保存成功'],
        expectedWords: 170,
        exitState: '所有操作均通过本地终端进行，并生成可审计记录。',
      }],
      constraints: [],
      writerBrief: '林澈和许安完成闭环验收。',
    })
  })
})
