import { describe, it, expect } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  getBackendEnvPath,
  getMigrationsDir,
  listMigrationFiles,
  shouldCreateChineseSearchIndex,
  shouldRunMigration,
} from '../src/db/migrate'

describe('Postgres migration runner', () => {
  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

  it('resolves migrations from the source file instead of cwd', () => {
    expect(getMigrationsDir('/tmp')).toBe(path.join(backendRoot, 'src/db/migrations'))
    expect(getMigrationsDir(backendRoot)).toBe(path.join(backendRoot, 'src/db/migrations'))
  })

  it('resolves the backend env file independently of cwd', () => {
    expect(getBackendEnvPath('/tmp')).toBe(path.join(backendRoot, '.env'))
    expect(getBackendEnvPath(backendRoot)).toBe(path.join(backendRoot, '.env'))
  })

  it('lists sql migrations in stable order', () => {
    const files = listMigrationFiles(getMigrationsDir())

    expect(files).toContain('0002_agent_closure.sql')
    expect(files).toEqual([...files].sort())
  })

  it('skips migrations already recorded with the same checksum', () => {
    expect(shouldRunMigration('0002_agent_closure.sql', 'abc', new Map([
      ['0002_agent_closure.sql', 'abc'],
    ]))).toBe(false)
  })

  it('fails when a recorded migration checksum changes', () => {
    expect(() => shouldRunMigration('0002_agent_closure.sql', 'new', new Map([
      ['0002_agent_closure.sql', 'old'],
    ]))).toThrow(/checksum mismatch/)
  })

  it('creates chinese FTS only when zhparser extension is available', () => {
    expect(shouldCreateChineseSearchIndex([{ extname: 'uuid-ossp' }])).toBe(false)
    expect(shouldCreateChineseSearchIndex([{ extname: 'zhparser' }])).toBe(true)
  })
})
