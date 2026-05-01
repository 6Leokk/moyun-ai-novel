import { describe, it, expect } from 'vitest'
import { encryptApiKey, decryptApiKey } from '../src/utils/crypto'
import { setupSSE, sendSSE, sendSSEHeartbeat, sendSSEDone, sendSSEError } from '../src/utils/sse'
import { signToken, verifyToken } from '../src/lib/jwt'

process.env.JWT_SECRET = 'test-secret-key-for-testing-12345678'
process.env.ENCRYPTION_KEY = 'test-only-encryption-key-1234567'

describe('Crypto', () => {
  it('encrypts and decrypts API key', () => {
    const key = 'sk-test-key-12345'
    const encrypted = encryptApiKey(key)
    expect(encrypted).not.toBe(key)
    const decrypted = decryptApiKey(encrypted)
    expect(decrypted).toBe(key)
  })

  it('produces different ciphertext for same plaintext', () => {
    const key = 'sk-test-key-12345'
    const e1 = encryptApiKey(key)
    const e2 = encryptApiKey(key)
    expect(e1).not.toBe(e2) // Different IV each time
  })
})

describe('JWT', () => {
  it('signs and verifies token', () => {
    const payload = { userId: 'u1', email: 'test@test.com' }
    const token = signToken(payload)
    const decoded = verifyToken(token)
    expect(decoded.userId).toBe('u1')
  })

  it('rejects invalid token', () => {
    expect(() => verifyToken('invalid-token')).toThrow()
  })
})

describe('SSE Utilities', () => {
  it('sendSSEHeartbeat sends comment', () => {
    const lines: string[] = []
    const mockReply = { raw: { write(chunk: string) { lines.push(chunk) } } } as any
    sendSSEHeartbeat(mockReply)
    expect(lines[0]).toContain(': heartbeat')
  })

  it('sendSSE formats event correctly', () => {
    const lines: string[] = []
    const mockReply = { raw: { write(chunk: string) { lines.push(chunk) } } } as any
    sendSSE(mockReply, 'test', { key: 'value' }, 1)
    const output = lines.join('')
    expect(output).toContain('id: 1')
    expect(output).toContain('event: test')
    expect(output).toContain('"key":"value"')
  })

  it('sendSSEDone sends done event and closes the response', () => {
    const lines: string[] = []
    let closed = false
    const mockReply = {
      raw: {
        write(chunk: string) { lines.push(chunk) },
        end() { closed = true },
      },
    } as any
    sendSSEDone(mockReply)
    expect(lines.join('')).toContain('event: done')
    expect(closed).toBe(true)
  })

  it('sendSSEError sends error event', () => {
    const lines: string[] = []
    const mockReply = { raw: { write(chunk: string) { lines.push(chunk) } } } as any
    sendSSEError(mockReply, 'test error')
    expect(lines.join('')).toContain('event: error')
    expect(lines.join('')).toContain('test error')
  })
})
