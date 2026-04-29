import type { Database as DatabaseType } from 'better-sqlite3'
import fs from 'fs'
import { openSQLite, runMigrations, initProjectDB } from './connection'
import { ProjectPathResolver } from '../../utils/project-path'

interface CacheEntry {
  db: DatabaseType
  lastUsed: number
}

const MAX_CACHE = 60
const IDLE_TTL_MS = 300_000 // 5 minutes

export class ProjectDBManager {
  private cache = new Map<string, CacheEntry>()
  private locks = new Map<string, Promise<void>>()
  private cleanupTimer: NodeJS.Timeout | null = null

  /** Open or retrieve a cached SQLite connection for a project */
  open(projectId: string): DatabaseType {
    const cached = this.cache.get(projectId)
    if (cached) {
      cached.lastUsed = Date.now()
      return cached.db
    }

    if (!ProjectPathResolver.exists(projectId)) {
      throw new Error(`Project database not found: ${projectId}`)
    }

    const dbPath = ProjectPathResolver.getDBPath(projectId)
    const db = openSQLite(dbPath)
    runMigrations(db)

    this.cache.set(projectId, { db, lastUsed: Date.now() })
    this.prune()
    this.startCleanup()
    return db
  }

  /** Close a specific project connection */
  close(projectId: string): void {
    const entry = this.cache.get(projectId)
    if (entry) {
      entry.db.close()
      this.cache.delete(projectId)
    }
  }

  /** Initialize a brand new project database */
  initNew(projectId: string): DatabaseType {
    ProjectPathResolver.ensureDir(projectId)
    const dbPath = ProjectPathResolver.getDBPath(projectId)
    const db = openSQLite(dbPath)
    initProjectDB(db)
    runMigrations(db)

    // Security: restrict file permissions
    try { fs.chmodSync(dbPath, 0o600) } catch { /* best effort */ }

    this.cache.set(projectId, { db, lastUsed: Date.now() })
    this.prune()
    this.startCleanup()
    return db
  }

  /** Check if a project database exists */
  exists(projectId: string): boolean {
    return ProjectPathResolver.exists(projectId)
  }

  /** Acquire a per-project write lock (simple async mutex) */
  async acquireLock(projectId: string): Promise<() => void> {
    while (this.locks.has(projectId)) {
      await this.locks.get(projectId)
    }

    let release: () => void
    const lock = new Promise<void>((resolve) => {
      release = resolve
    })

    this.locks.set(projectId, lock)
    return () => {
      this.locks.delete(projectId)
      release!()
    }
  }

  /** Close all connections */
  shutdown(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    for (const [id, entry] of this.cache) {
      try { entry.db.close() } catch { /* ignore */ }
    }
    this.cache.clear()
    this.locks.clear()
  }

  private prune(): void {
    if (this.cache.size <= MAX_CACHE) return

    const entries = [...this.cache.entries()]
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)

    const toRemove = entries.slice(0, this.cache.size - MAX_CACHE)
    for (const [id, entry] of toRemove) {
      try { entry.db.close() } catch { /* ignore */ }
      this.cache.delete(id)
    }
  }

  private startCleanup(): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [id, entry] of this.cache) {
        if (now - entry.lastUsed > IDLE_TTL_MS) {
          try { entry.db.close() } catch { /* ignore */ }
          this.cache.delete(id)
        }
      }
    }, 60_000) // Check every minute
  }
}

// Singleton
export const projectDBManager = new ProjectDBManager()
