import { FastifyReply } from 'fastify'

export function setupSSE(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
}

export function sendSSE(reply: FastifyReply, event: string, data: unknown, id?: number): void {
  const lines: string[] = []
  if (id !== undefined) lines.push(`id: ${id}`)
  if (event) lines.push(`event: ${event}`)
  lines.push(`data: ${JSON.stringify(data)}`)
  lines.push('') // blank line terminates the message
  reply.raw.write(lines.join('\n') + '\n')
}

export function sendSSEHeartbeat(reply: FastifyReply): void {
  reply.raw.write(': heartbeat\n\n')
}

export function sendSSEDone(reply: FastifyReply): void {
  sendSSE(reply, 'done', {})
  reply.raw.end()
}

export function sendSSEError(reply: FastifyReply, message: string): void {
  sendSSE(reply, 'error', { message })
}
