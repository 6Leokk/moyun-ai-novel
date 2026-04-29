import crypto from 'crypto'
import { getDb } from '../db/connection'

// In-memory token store (replace with DB table for production)
const verificationTokens = new Map<string, { userId: string; email: string; expires: number }>()
const resetTokens = new Map<string, { userId: string; expires: number }>()

export class EmailService {
  static async sendVerificationEmail(userId: string, email: string): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex')
    verificationTokens.set(token, { userId, email, expires: Date.now() + 3600_000 })
    // In production: send real email via nodemailer/SES/etc.
    console.log(`[DEV] Verification link: http://localhost:3000/api/auth/verify-email?token=${token}`)
  }

  static async verifyEmail(token: string): Promise<boolean> {
    const data = verificationTokens.get(token)
    if (!data || Date.now() > data.expires) return false
    const db = getDb()
    const { users } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    await db.update(users).set({ emailVerified: true } as any).where(eq(users.id, data.userId))
    verificationTokens.delete(token)
    return true
  }

  static async sendPasswordReset(email: string): Promise<void> {
    const db = getDb()
    const { users } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    const found = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (found.length === 0) return // Don't reveal whether email exists
    const token = crypto.randomBytes(32).toString('hex')
    resetTokens.set(token, { userId: found[0].id, expires: Date.now() + 1800_000 })
    console.log(`[DEV] Password reset link: http://localhost:5173/reset-password?token=${token}`)
  }

  static async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const data = resetTokens.get(token)
    if (!data || Date.now() > data.expires) return false
    const db = getDb()
    const { users } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.hash(newPassword, 10)
    await db.update(users).set({ passwordHash: hash } as any).where(eq(users.id, data.userId))
    resetTokens.delete(token)
    return true
  }
}
