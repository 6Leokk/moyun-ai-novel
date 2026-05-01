import crypto from 'crypto'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Pool, type PoolClient } from 'pg'

export const MIGRATIONS_TABLE = 'schema_migrations'

interface MigrationRecord {
  name: string
  checksum: string
}

export interface MigrationResult {
  migrationsDir: string
  applied: string[]
  skipped: string[]
}

function isCliEntrypoint(): boolean {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false
}

export function getBackendEnvPath(_cwd = process.cwd()): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env')
}

dotenv.config({ path: getBackendEnvPath(), quiet: true })

export function getMigrationsDir(_cwd = process.cwd()): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations')
}

export function listMigrationFiles(migrationsDir = getMigrationsDir()): string[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`)
  }
  return fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
}

export function checksumSql(sql: string): string {
  return crypto.createHash('sha256').update(sql).digest('hex')
}

export function shouldRunMigration(name: string, checksum: string, applied: Map<string, string>): boolean {
  const recordedChecksum = applied.get(name)
  if (!recordedChecksum) return true
  if (recordedChecksum !== checksum) {
    throw new Error(`Migration checksum mismatch for ${name}`)
  }
  return false
}

async function ensureExtensions(client: PoolClient): Promise<void> {
  await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS "zhparser"')
  } catch (e) {
    console.warn('zhparser extension creation skipped:', (e as Error).message)
  }
}

export function shouldCreateChineseSearchIndex(rows: Array<{ extname: string }>): boolean {
  return rows.some(row => row.extname === 'zhparser')
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

async function loadAppliedMigrations(client: PoolClient): Promise<Map<string, string>> {
  const rows = await client.query<MigrationRecord>(`SELECT name, checksum FROM ${MIGRATIONS_TABLE}`)
  return new Map(rows.rows.map(row => [row.name, row.checksum]))
}

async function createSearchIndex(client: PoolClient): Promise<void> {
  const extensions = await client.query<{ extname: string }>(
    "SELECT extname FROM pg_extension WHERE extname = 'zhparser'",
  )
  if (!shouldCreateChineseSearchIndex(extensions.rows)) return

  try {
    await client.query(`
      CREATE TEXT SEARCH CONFIGURATION IF NOT EXISTS chinese (PARSER = zhparser);
      ALTER TEXT SEARCH CONFIGURATION chinese ADD MAPPING FOR n,v,a,i,e,l WITH simple;
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chapters_fts ON chapters
      USING GIN(to_tsvector('chinese', coalesce(content, '')))
    `)
  } catch (e) {
    console.warn('FTS index creation skipped (zhparser may not be installed):', (e as Error).message)
  }
}

export async function runMigrations(opts: {
  databaseUrl?: string
  migrationsDir?: string
  log?: Pick<Console, 'log' | 'warn'>
} = {}): Promise<MigrationResult> {
  const databaseUrl = opts.databaseUrl || process.env.DATABASE_URL || 'postgres://moyun:moyun@localhost:5432/moyun'
  const migrationsDir = opts.migrationsDir || getMigrationsDir()
  const log = opts.log || console
  const pool = new Pool({ connectionString: databaseUrl, max: 1 })
  const client = await pool.connect()
  const applied: string[] = []
  const skipped: string[] = []

  try {
    await ensureExtensions(client)
    await ensureMigrationTable(client)

    const appliedMigrations = await loadAppliedMigrations(client)
    const files = listMigrationFiles(migrationsDir)

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
      const checksum = checksumSql(sql)
      if (!shouldRunMigration(file, checksum, appliedMigrations)) {
        skipped.push(file)
        continue
      }

      log.log(`Running migration: ${file}`)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          `INSERT INTO ${MIGRATIONS_TABLE} (name, checksum) VALUES ($1, $2)`,
          [file, checksum],
        )
        await client.query('COMMIT')
        applied.push(file)
        appliedMigrations.set(file, checksum)
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      }
    }

    await createSearchIndex(client)
    return { migrationsDir, applied, skipped }
  } finally {
    client.release()
    await pool.end()
  }
}

if (isCliEntrypoint()) {
  runMigrations()
    .then(result => {
      console.log(`Migrations complete. Applied: ${result.applied.length}; skipped: ${result.skipped.length}`)
    })
    .catch(err => {
      console.error('Migration failed:', err)
      process.exit(1)
    })
}
