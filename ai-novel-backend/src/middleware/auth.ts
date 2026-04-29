import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken, JwtPayload } from '../lib/jwt.ts'
import { getDb } from '../db/connection.ts'
import { projects, users } from '../db/schema.ts'
import { and, eq, isNull } from 'drizzle-orm'

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string
    userEmail?: string
  }
}

const PUBLIC_POST = new Set([
  '/api/auth/login',
  '/api/auth/register',
])

const PUBLIC_GET = new Set([
  '/api/health',
  '/api/auth/oauth/linuxdo',
  '/api/auth/oauth/callback',
])

export function registerAuthMiddleware(app: FastifyInstance) {
  app.decorateRequest('userId', undefined)
  app.decorateRequest('userEmail', undefined)

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public routes
    if (request.method === 'POST' && PUBLIC_POST.has(request.url)) return
    if (request.method === 'GET' && PUBLIC_GET.has(request.url)) return

    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({ error: '未登录，请先登录' })
      return
    }

    try {
      const token = authHeader.slice(7)
      const payload: JwtPayload = verifyToken(token)
      const db = getDb()
      const activeUser = await db.select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, payload.userId), isNull(users.deletedAt)))
        .limit(1)
      if (activeUser.length === 0) {
        reply.status(401).send({ error: '用户不存在或已被禁用' })
        return
      }
      request.userId = payload.userId
      request.userEmail = payload.email
    } catch {
      reply.status(401).send({ error: '登录已过期，请重新登录' })
    }
  })
}

// Verify that a project belongs to the current user
export async function verifyProjectOwnership(
  projectId: string,
  userId: string,
): Promise<boolean> {
  if (!userId) return false
  const db = getDb()
  const result = await db.select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  return result.length > 0 && result[0].userId === userId
}
