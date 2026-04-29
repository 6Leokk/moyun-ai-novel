import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.ts'

let pool: Pool | null = null
let db: ReturnType<typeof drizzle> | null = null

export function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL || 'postgres://moyun:moyun@localhost:5432/moyun'
    pool = new Pool({
      connectionString: databaseUrl,
      min: parseInt(process.env.DB_POOL_MIN || '2'),
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000'),
    })

    pool.on('error', (err) => {
      console.error('Unexpected PG pool error:', err)
    })
  }
  return pool
}

export function getDb() {
  if (!db) {
    db = drizzle(getPool(), { schema })
  }
  return db
}

export async function closeDb() {
  if (pool) {
    await pool.end()
    pool = null
    db = null
  }
}
