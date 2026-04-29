import fs from 'fs'
import path from 'path'
import { Pool } from 'pg'

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL || 'postgres://moyun:moyun@localhost:5432/moyun'
  const pool = new Pool({ connectionString: databaseUrl, max: 1 })

  try {
    // Ensure extensions
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    await pool.query('CREATE EXTENSION IF NOT EXISTS "zhparser"')

    const migrationsDir = path.resolve(process.cwd(), 'src/db/migrations')
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory. Run: npx drizzle-kit generate && npx drizzle-kit push')
      return
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
      console.log(`Running migration: ${file}`)
      await pool.query(sql)
    }

    // Create full-text search index separately (Drizzle doesn't support tsvector in schema)
    try {
      await pool.query(`
        CREATE TEXT SEARCH CONFIGURATION IF NOT EXISTS chinese (PARSER = zhparser);
        ALTER TEXT SEARCH CONFIGURATION chinese ADD MAPPING FOR n,v,a,i,e,l WITH simple;
      `)
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chapters_fts ON chapters
        USING GIN(to_tsvector('chinese', coalesce(content, '')))
      `)
    } catch (e) {
      console.warn('FTS index creation skipped (zhparser may not be installed):', (e as Error).message)
    }

    console.log('Migrations complete.')
  } finally {
    await pool.end()
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
