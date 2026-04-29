export function validateEnv() {
  const encryptionKey = process.env.ENCRYPTION_KEY
  if (!encryptionKey) {
    console.warn('WARNING: ENCRYPTION_KEY not set. AI API key encryption will be disabled.')
    console.warn('Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
  } else if (Buffer.byteLength(encryptionKey, 'utf-8') !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (256 bits) for AES-256-GCM')
  }

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    console.warn('WARNING: JWT_SECRET not set. Using insecure default.')
  } else if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters')
  }

  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set. Using default: postgres://moyun:moyun@localhost:5432/moyun')
  }

  // OAuth is optional — only warn if some but not all OAuth vars are set
  const oauthVars = ['LINUXDO_CLIENT_ID', 'LINUXDO_CLIENT_SECRET']
  const setCount = oauthVars.filter(v => process.env[v]).length
  if (setCount > 0 && setCount < oauthVars.length) {
    console.warn('WARNING: Some Linux DO OAuth env vars are set but others are missing. OAuth login may not work.')
  }
}
