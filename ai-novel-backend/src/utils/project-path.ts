import path from 'path'
import fs from 'fs'
import { z } from 'zod'

const uuidSchema = z.string().uuid()

const PROJECTS_ROOT = path.resolve(process.env.PROJECTS_DATA_DIR || './data/projects')

export class ProjectPathResolver {
  static getProjectDir(projectId: string): string {
    if (!uuidSchema.safeParse(projectId).success) {
      throw new Error(`Invalid project ID: ${projectId}`)
    }
    const dir = path.resolve(PROJECTS_ROOT, projectId)
    if (!dir.startsWith(PROJECTS_ROOT + path.sep)) {
      throw new Error(`Path traversal detected: ${projectId}`)
    }
    return dir
  }

  static getDBPath(projectId: string): string {
    return path.join(this.getProjectDir(projectId), 'data.db')
  }

  static getRoot(): string {
    return PROJECTS_ROOT
  }

  static ensureDir(projectId: string): string {
    const dir = this.getProjectDir(projectId)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    return dir
  }

  static exists(projectId: string): boolean {
    try {
      return fs.existsSync(this.getDBPath(projectId))
    } catch {
      return false
    }
  }
}
