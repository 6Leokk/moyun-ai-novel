import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { z } from 'zod'
import { getDb } from '../db/connection.ts'
import { users, userAiPreferences } from '../db/schema.ts'
import { signToken } from '../lib/jwt.ts'
import { eq, and } from 'drizzle-orm'

// ── OAuth State Store ──
const oauthStates = new Map<string, number>()

function setOAuthState(state: string): void {
  oauthStates.set(state, Date.now())
  const now = Date.now()
  for (const [key, ts] of oauthStates) {
    if (now - ts > 600_000) oauthStates.delete(key)
  }
}

function consumeOAuthState(state: string): boolean {
  const ts = oauthStates.get(state)
  if (!ts) return false
  oauthStates.delete(state)
  return Date.now() - ts <= 600_000
}

// ── OAuth Config ──
function getOAuthConfig(request: { protocol: string; hostname: string }) {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '')
  const authUrl = process.env.LINUXDO_AUTH_URL || 'https://linux.do/oauth/authorize'
  const tokenUrl = process.env.LINUXDO_TOKEN_URL || 'https://linux.do/oauth/token'
  const userUrl = process.env.LINUXDO_USER_URL || 'https://linux.do/api/v1/me'
  const clientId = process.env.LINUXDO_CLIENT_ID || ''
  const clientSecret = process.env.LINUXDO_CLIENT_SECRET || ''
  const redirectUri = process.env.LINUXDO_REDIRECT_URI
    || `${request.protocol}://${request.hostname}/api/auth/oauth/callback`
  return { frontendUrl, authUrl, tokenUrl, userUrl, clientId, clientSecret, redirectUri }
}

export function registerAuthRoutes(app: FastifyInstance) {
  const registerSchema = z.object({
    email: z.string().email('请输入有效的邮箱'),
    username: z.string().min(1, '用户名不能为空').max(50),
    password: z.string().min(6, '密码至少6位').max(100),
  })

  const loginSchema = z.object({
    email: z.string().email('请输入有效的邮箱'),
    password: z.string().min(1, '密码不能为空'),
  })

  // POST /api/auth/register
  app.post('/api/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)
    const db = getDb()

    const existing = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1)
    if (existing.length > 0) {
      reply.status(409).send({ error: '该邮箱已被注册' })
      return
    }

    const passwordHash = await bcrypt.hash(body.password, 10)
    const result = await db.insert(users).values({
      username: body.username,
      email: body.email,
      passwordHash,
    }).returning({ id: users.id, email: users.email, username: users.username })

    const user = result[0]
    await db.insert(userAiPreferences).values({ userId: user.id })

    const token = signToken({ userId: user.id, email: user.email })
    reply.status(201).send({ token, user: { id: user.id, email: user.email, username: user.username } })
  })

  // POST /api/auth/login
  app.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const db = getDb()

    const found = await db.select()
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1)
    if (found.length === 0) {
      reply.status(401).send({ error: '邮箱或密码错误' })
      return
    }

    const user = found[0]
    const valid = await bcrypt.compare(body.password, user.passwordHash)
    if (!valid) {
      reply.status(401).send({ error: '邮箱或密码错误' })
      return
    }

    const token = signToken({ userId: user.id, email: user.email })
    reply.send({ token, user: { id: user.id, email: user.email, username: user.username } })
  })

  // GET /api/auth/me
  app.get('/api/auth/me', async (request, reply) => {
    if (!request.userId) {
      reply.status(401).send({ error: '未登录' })
      return
    }
    const db = getDb()
    const found = await db.select({
      id: users.id,
      email: users.email,
      username: users.username,
    }).from(users).where(eq(users.id, request.userId)).limit(1)

    if (found.length === 0) {
      reply.status(404).send({ error: '用户不存在' })
      return
    }
    reply.send(found[0])
  })

  // ── Linux DO OAuth ──

  // GET /api/auth/oauth/linuxdo
  app.get('/api/auth/oauth/linuxdo', async (request, reply) => {
    const cfg = getOAuthConfig(request)
    if (!cfg.clientId) {
      reply.status(500).send({ error: 'Linux DO OAuth 未配置' })
      return
    }

    const state = crypto.randomBytes(16).toString('hex')
    setOAuthState(state)

    const url = new URL(cfg.authUrl)
    url.searchParams.set('client_id', cfg.clientId)
    url.searchParams.set('redirect_uri', cfg.redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', state)
    url.searchParams.set('scope', 'read')

    reply.redirect(url.toString())
  })

  // GET /api/auth/oauth/callback
  app.get('/api/auth/oauth/callback', async (request, reply) => {
    const cfg = getOAuthConfig(request)
    const { code, state } = request.query as { code?: string; state?: string }

    if (!code || !state) {
      reply.redirect(`${cfg.frontendUrl}/login?error=${encodeURIComponent('授权参数缺失')}`)
      return
    }

    if (!consumeOAuthState(state)) {
      reply.redirect(`${cfg.frontendUrl}/login?error=${encodeURIComponent('授权状态无效或已过期')}`)
      return
    }

    if (!cfg.clientId || !cfg.clientSecret) {
      reply.redirect(`${cfg.frontendUrl}/login?error=${encodeURIComponent('OAuth 未配置')}`)
      return
    }

    try {
      // Exchange code for token
      const tokenRes = await fetch(cfg.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: cfg.redirectUri,
        }),
      })

      if (!tokenRes.ok) {
        const errText = await tokenRes.text().catch(() => '')
        console.error('OAuth token exchange failed:', tokenRes.status, errText.slice(0, 500))
        reply.redirect(`${cfg.frontendUrl}/login?error=${encodeURIComponent('授权服务器认证失败')}`)
        return
      }

      const tokenData = await tokenRes.json() as Record<string, any>
      const accessToken = tokenData.access_token as string | undefined

      // Discourse-style: user info in token response
      let oauthUser = tokenData.user as Record<string, any> | undefined

      // Fallback: fetch user info from dedicated endpoint
      if (!oauthUser && accessToken) {
        const userRes = await fetch(cfg.userUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
        })
        if (userRes.ok) {
          oauthUser = await userRes.json() as Record<string, any>
        }
      }

      if (!oauthUser || !oauthUser.id) {
        reply.redirect(`${cfg.frontendUrl}/login?error=${encodeURIComponent('无法获取用户信息')}`)
        return
      }

      const db = getDb()
      const oauthId = String(oauthUser.id)

      // Find existing user
      const existing = await db.select()
        .from(users)
        .where(and(eq(users.oauthProvider, 'linuxdo'), eq(users.oauthId, oauthId)))
        .limit(1)

      let userId: string

      if (existing.length > 0) {
        userId = existing[0].id
        await db.update(users).set({
          oauthToken: accessToken || null,
          oauthRefresh: (tokenData.refresh_token as string) || null,
          oauthExpires: tokenData.expires_in
            ? new Date(Date.now() + (tokenData.expires_in as number) * 1000)
            : null,
          avatarUrl: (oauthUser.avatar_url as string) || existing[0].avatarUrl,
          updatedAt: new Date(),
        }).where(eq(users.id, userId))
      } else {
        const username = (oauthUser.username as string) || (oauthUser.name as string) || `ld_${oauthId}`
        const email = (oauthUser.email as string) || `ld_${oauthId}@linux.do`

        // Handle username collision
        const nameCollision = await db.select({ id: users.id })
          .from(users).where(eq(users.username, username)).limit(1)

        const result = await db.insert(users).values({
          username: nameCollision.length > 0 ? `${username}_${oauthId.slice(0, 6)}` : username,
          email,
          passwordHash: '',
          oauthProvider: 'linuxdo',
          oauthId,
          oauthToken: accessToken || null,
          oauthRefresh: (tokenData.refresh_token as string) || null,
          oauthExpires: tokenData.expires_in
            ? new Date(Date.now() + (tokenData.expires_in as number) * 1000)
            : null,
          avatarUrl: (oauthUser.avatar_url as string) || null,
        }).returning({ id: users.id })

        userId = result[0].id
        await db.insert(userAiPreferences).values({ userId })
      }

      const jwt = signToken({ userId, email: '' })
      reply.redirect(`${cfg.frontendUrl}/login?token=${jwt}`)
    } catch (e: any) {
      console.error('OAuth callback error:', e)
      reply.redirect(`${cfg.frontendUrl}/login?error=${encodeURIComponent('登录失败: ' + e.message)}`)
    }
  })

  // POST /api/auth/send-verification
  app.post('/api/auth/send-verification', async (request, reply) => {
    if (!request.userId) { reply.status(401).send({ error: '未登录' }); return }
    const db = getDb()
    const found = await db.select({ email: users.email }).from(users).where(eq(users.id, request.userId)).limit(1)
    if (found.length === 0) { reply.status(404).send({ error: '用户不存在' }); return }
    const { EmailService } = await import('../services/email-service')
    await EmailService.sendVerificationEmail(request.userId, found[0].email)
    reply.send({ message: '验证邮件已发送' })
  })

  // GET /api/auth/verify-email
  app.get('/api/auth/verify-email', async (request, reply) => {
    const { token } = request.query as { token?: string }
    if (!token) { reply.status(400).send({ error: '缺少验证令牌' }); return }
    const { EmailService } = await import('../services/email-service')
    const ok = await EmailService.verifyEmail(token)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    reply.redirect(`${frontendUrl}/login?verified=${ok ? '1' : '0'}`)
  })

  // POST /api/auth/forgot-password
  app.post('/api/auth/forgot-password', async (request, reply) => {
    const { email } = request.body as { email: string }
    if (!email) { reply.status(400).send({ error: '请输入邮箱' }); return }
    const { EmailService } = await import('../services/email-service')
    await EmailService.sendPasswordReset(email)
    reply.send({ message: '如果该邮箱已注册，重置链接已发送' })
  })

  // POST /api/auth/reset-password
  app.post('/api/auth/reset-password', async (request, reply) => {
    const { token, password } = request.body as { token: string; password: string }
    if (!token || !password || password.length < 6) {
      reply.status(400).send({ error: '参数无效' }); return
    }
    const { EmailService } = await import('../services/email-service')
    const ok = await EmailService.resetPassword(token, password)
    if (!ok) { reply.status(400).send({ error: '令牌无效或已过期' }); return }
    reply.send({ message: '密码已重置' })
  })
}
