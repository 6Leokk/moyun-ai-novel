import { FastifyInstance, FastifyError } from 'fastify'

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    console.error(error)

    // Zod validation errors
    if (error.name === 'ZodError') {
      reply.status(400).send({
        error: '请求参数验证失败',
        details: (error as any).issues,
      })
      return
    }

    // Fastify built-in errors
    if (error.statusCode) {
      reply.status(error.statusCode).send({
        error: error.message,
      })
      return
    }

    reply.status(500).send({ error: '服务器内部错误' })
  })
}
