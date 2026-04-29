import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    console.warn('ENCRYPTION_KEY not set. Using insecure default for API key encryption.')
    return crypto.scryptSync('dev-fallback-key-change-in-production', 'salt', 32)
  }
  // Key must be exactly 32 bytes for AES-256
  if (Buffer.byteLength(key, 'utf-8') === 32) {
    return Buffer.from(key, 'utf-8')
  }
  // If hex-encoded 64-char key
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, 'hex')
  }
  // Derive from passphrase
  return crypto.scryptSync(key, 'moyun-salt', 32)
}

export function encryptApiKey(plainText: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plainText, 'utf-8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()

  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
}

export function decryptApiKey(encrypted: string): string {
  const key = getKey()
  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted API key format')
  }

  const iv = Buffer.from(parts[0], 'hex')
  const tag = Buffer.from(parts[1], 'hex')
  const ciphertext = parts[2]

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(ciphertext, 'hex', 'utf-8')
  decrypted += decipher.final('utf-8')
  return decrypted
}
