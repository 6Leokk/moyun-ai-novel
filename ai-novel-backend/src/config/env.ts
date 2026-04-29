const isProduction = process.env.NODE_ENV === 'production'

export function validateEnv() {
  const issues: string[] = []

  // ENCRYPTION_KEY: required in production, warn in dev
  const encryptionKey = process.env.ENCRYPTION_KEY
  if (!encryptionKey) {
    if (isProduction) issues.push('ENCRYPTION_KEY is required in production')
    else console.warn('WARNING: ENCRYPTION_KEY not set. AI API key encryption will be disabled.')
  } else if (Buffer.byteLength(encryptionKey, 'utf-8') !== 32) {
    issues.push('ENCRYPTION_KEY must be exactly 32 bytes (256 bits) for AES-256-GCM')
  }

  // JWT_SECRET: required in production, warn in dev
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    if (isProduction) issues.push('JWT_SECRET is required in production')
    else console.warn('WARNING: JWT_SECRET not set. Using insecure default.')
  } else if (jwtSecret.length < 32) {
    issues.push('JWT_SECRET must be at least 32 characters')
  }

  // DATABASE_URL: required in production
  if (!process.env.DATABASE_URL) {
    if (isProduction) issues.push('DATABASE_URL is required in production')
    else console.warn('DATABASE_URL not set. Using default: postgres://moyun:moyun@localhost:5432/moyun')
  }

  // Default DB password check
  if (process.env.DATABASE_URL?.includes(':moyun@') && isProduction) {
    issues.push('DATABASE_URL contains default password "moyun" — change for production')
  }

  if (issues.length > 0) {
    throw new Error(`Environment validation failed:\n${issues.map(i => '  - ' + i).join('\n')}`)
  }
}
