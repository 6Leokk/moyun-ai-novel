import { FastifyInstance } from 'fastify'

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
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
    if ('statusCode' in error) {
      reply.status(error.statusCode as number).send({
        error: error.message,
      })
      return
    }

    reply.status(500).send({ error: '服务器内部错误' })
  })
}
