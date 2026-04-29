import { FastifyInstance } from 'fastify'
import { getPool } from '../db/connection.ts'

export function registerHealthRoutes(app: FastifyInstance) {
  app.get('/api/health', async (_request, reply) => {
    let dbStatus = 'disconnected'
    try {
      const pool = getPool()
      await pool.query('SELECT 1')
      dbStatus = 'connected'
    } catch {
      dbStatus = 'disconnected'
    }

    const mem = process.memoryUsage()
    reply.send({
      status: 'ok',
      uptime: process.uptime(),
      db: dbStatus,
      memory: {
        rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
      },
      node: process.version,
      timestamp: new Date().toISOString(),
    })
  })
}
