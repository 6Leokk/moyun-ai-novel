import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import helmet from '@fastify/helmet'
import { validateEnv } from './config/env.ts'
import { registerAuthMiddleware } from './middleware/auth.ts'
import { registerErrorHandler } from './middleware/error.ts'
import { registerAuthRoutes } from './routes/auth.ts'
import { registerProjectRoutes } from './routes/projects.ts'
import { registerChapterRoutes } from './routes/chapters.ts'
import { registerCharacterRoutes } from './routes/characters.ts'
import { registerHealthRoutes } from './routes/health.ts'
import { registerAISettingsRoutes } from './routes/ai-settings.ts'
import { registerWizardRoutes } from './routes/wizard.ts'
import { registerChapterAIRoutes } from './routes/chapter-ai.ts'
import { registerInspirationRoutes } from './routes/inspirations.ts'
import { registerWritingStyleRoutes } from './routes/writing-styles.ts'
import { registerPromptTemplateRoutes } from './routes/prompt-templates.ts'
import { registerForeshadowRoutes } from './routes/foreshadows.ts'
import { registerCareerRoutes } from './routes/careers.ts'
import { registerPromptWorkshopRoutes } from './routes/prompt-workshop.ts'
import { registerAnalyzeBookRoutes } from './routes/analyze-book.ts'
import { registerAgentRunRoutes } from './routes/agent-runs.ts'
import { registerOutlineRoutes } from './routes/outlines.ts'
import { registerAdminRoutes } from './routes/admin.ts'
import { registerUsageRoutes } from './routes/usage.ts'
import { closeDb } from './db/connection.ts'

async function main() {
  validateEnv()

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  })

  // CORS
  const allowedOrigins = process.env.ALLOWED_ORIGINS
  await app.register(cors, {
    origin: allowedOrigins
      ? allowedOrigins.split(',').map(s => s.trim())
      : (process.env.NODE_ENV === 'production' ? false : true),
  })

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // SPA needs inline styles/scripts
    crossOriginEmbedderPolicy: false,
  })

  // Rate limiting
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  })

  // Error handler
  registerErrorHandler(app)

  // Auth middleware
  registerAuthMiddleware(app)

  // Routes
  registerHealthRoutes(app)
  registerAuthRoutes(app)
  registerProjectRoutes(app)
  registerChapterRoutes(app)
  registerCharacterRoutes(app)
  registerAISettingsRoutes(app)
  registerWizardRoutes(app)
  registerChapterAIRoutes(app)
  registerInspirationRoutes(app)
  registerWritingStyleRoutes(app)
  registerPromptTemplateRoutes(app)
  registerForeshadowRoutes(app)
  registerCareerRoutes(app)
  registerPromptWorkshopRoutes(app)
  registerAnalyzeBookRoutes(app)
  registerAgentRunRoutes(app)
  registerOutlineRoutes(app)
  registerAdminRoutes(app)
  registerUsageRoutes(app)

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down...')
    await closeDb()
    await app.close()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  const port = parseInt(process.env.PORT || '3000')
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`Server listening on port ${port}`)
}

main().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
