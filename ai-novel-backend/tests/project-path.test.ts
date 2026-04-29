import { describe, it, expect, beforeEach } from 'vitest'
import { ProjectPathResolver } from '../src/utils/project-path'

describe('ProjectPathResolver', () => {
  const validUUID = '00000000-0000-0000-0000-000000000001'

  describe('getProjectDir', () => {
    it('returns valid path for UUID', () => {
      const dir = ProjectPathResolver.getProjectDir(validUUID)
      expect(dir).toContain('data/projects')
      expect(dir).toContain(validUUID)
    })

    it('throws on non-UUID input', () => {
      expect(() => ProjectPathResolver.getProjectDir('../../../etc/passwd')).toThrow()
      expect(() => ProjectPathResolver.getProjectDir('')).toThrow()
      expect(() => ProjectPathResolver.getProjectDir('not-a-uuid')).toThrow()
    })

    it('throws on path traversal attempt', () => {
      expect(() => ProjectPathResolver.getProjectDir('../etc/passwd')).toThrow()
    })
  })

  describe('getDBPath', () => {
    it('returns data.db path', () => {
      const path = ProjectPathResolver.getDBPath(validUUID)
      expect(path).toContain('data.db')
    })
  })

  describe('exists', () => {
    it('returns false for non-existent project', () => {
      expect(ProjectPathResolver.exists('00000000-0000-0000-0000-000000000099')).toBe(false)
    })
  })

  describe('ensureDir', () => {
    it('creates directory and returns path', () => {
      const dir = ProjectPathResolver.ensureDir(validUUID)
      expect(dir).toContain(validUUID)
      // Cleanup
      const fs = require('fs')
      fs.rmSync(dir, { recursive: true, force: true })
    })
  })
})
