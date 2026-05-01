import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import { initProjectDB } from '../src/db/sqlite/connection'
import { applyProjectSnapshotToSQLite } from '../src/services/project-sqlite-sync'

const TEST_DB = '/tmp/test-project-sqlite-sync.db'

function cleanup() {
  try { fs.unlinkSync(TEST_DB) } catch {}
  try { fs.unlinkSync(`${TEST_DB}-wal`) } catch {}
  try { fs.unlinkSync(`${TEST_DB}-shm`) } catch {}
}

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date('2026-05-01T00:00:00.000Z')
  const updatedAt = new Date('2026-05-01T00:10:00.000Z')

  return {
    project: {
      id: 'project-1',
      title: '雾城纪事',
      genre: '悬疑',
      theme: '记忆与真相',
      description: '雨夜调查',
      narrativePerspective: '第三人称',
      targetWords: 30000,
      maxWordsPerChapter: 1200,
      outlineMode: 'one-to-many',
    },
    worldSettings: {
      id: 'world-settings-1',
      timePeriod: '近未来',
      location: '雾都',
      atmosphere: '冷雨',
      rules: '记忆可被交易',
      createdAt,
      updatedAt,
    },
    worldEntries: [{
      id: 'world-entry-1',
      category: 'location',
      icon: '*',
      name: '旧港',
      description: '雾都的地下交易区',
      iconBg: '#111111',
      tags: ['城市', '港口'],
      createdAt,
      updatedAt,
    }],
    characters: [{
      id: 'character-1',
      name: '林澈',
      avatarChar: '林',
      role: '主角',
      roleType: 'protagonist',
      color: '#5a7d94',
      alias: '',
      gender: '男',
      age: '27',
      personality: '冷静敏锐',
      background: '前调查员',
      appearance: '黑色风衣',
      isOrganization: false,
      organizationType: null,
      organizationPurpose: null,
      mainCareerId: null,
      mainCareerStage: null,
      traits: ['观察'],
      aiGenerated: false,
      source: 'manual',
      deletedAt: null,
      createdAt,
      updatedAt,
    }],
    relationships: [{
      id: 'relationship-1',
      characterFromId: 'character-1',
      characterToId: 'character-2',
      relationshipTypeId: null,
      relationshipName: '调查搭档',
      intimacyLevel: 71,
      description: '互相信任但保持距离',
      startedAt: null,
      source: 'manual',
      createdAt,
      updatedAt,
    }],
    outlines: [{
      id: 'outline-1',
      parentId: null,
      title: '雨夜线索',
      content: '林澈在旧港发现记忆交易证据',
      structure: { type: 'main', chapterId: 'chapter-1' },
      orderIndex: 1,
      createdAt,
      updatedAt,
    }],
    chapters: [{
      id: 'chapter-1',
      outlineId: 'outline-1',
      chapterNumber: 1,
      title: '雨夜开场',
      content: '旧内容',
      wordCount: 3,
      status: 'draft',
      charactersPresent: ['character-1'],
      expansionPlan: { goal: '调查旧港' },
      createdAt,
      updatedAt,
    }],
    foreshadows: [{
      id: 'foreshadow-1',
      title: '银色钥匙',
      description: '通往旧港仓库',
      plantedChapterId: 'chapter-1',
      plantedAt: '第一章',
      resolvedChapterId: null,
      resolvedAt: null,
      status: 'planted',
      color: '#f0a040',
      createdAt,
      updatedAt,
    }],
    ...overrides,
  }
}

describe('project SQLite snapshot sync', () => {
  afterEach(() => cleanup())

  it('copies PG writing-layer rows into the project SQLite database idempotently', () => {
    cleanup()
    const db = new Database(TEST_DB)
    initProjectDB(db)

    applyProjectSnapshotToSQLite(db, makeSnapshot())
    applyProjectSnapshotToSQLite(db, makeSnapshot({
      chapters: [{
        ...makeSnapshot().chapters[0],
        content: '新内容',
        wordCount: 3,
        status: 'done',
      }],
    }))

    const chapter = db.prepare('SELECT title, content, word_count, status, characters_present, expansion_plan FROM chapters WHERE id = ?').get('chapter-1') as any
    expect(chapter).toMatchObject({
      title: '雨夜开场',
      content: '新内容',
      word_count: 3,
      status: 'done',
    })
    expect(JSON.parse(chapter.characters_present)).toEqual(['character-1'])
    expect(JSON.parse(chapter.expansion_plan)).toEqual({ goal: '调查旧港' })

    const character = db.prepare('SELECT name, role_type, traits FROM characters WHERE id = ?').get('character-1') as any
    expect(character.name).toBe('林澈')
    expect(character.role_type).toBe('protagonist')
    expect(JSON.parse(character.traits)).toEqual(['观察'])

    const worldEntry = db.prepare('SELECT name, tags FROM world_entries WHERE id = ?').get('world-entry-1') as any
    expect(worldEntry.name).toBe('旧港')
    expect(JSON.parse(worldEntry.tags)).toEqual(['城市', '港口'])

    expect(db.prepare('SELECT count(*) AS count FROM chapters').get()).toEqual({ count: 1 })
    db.close()
  })
})
