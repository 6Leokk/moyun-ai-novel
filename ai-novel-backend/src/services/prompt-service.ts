import { getDb } from '../db/connection.ts'
import { promptTemplates } from '../db/schema.ts'
import { eq, and, sql } from 'drizzle-orm'

export interface PromptTemplate {
  id: string
  userId: string | null
  templateKey: string
  name: string
  content: string
  variables: string[]
  isPublic: boolean
}

export class PromptService {
  /**
   * Get a template by key, preferring user's custom version over system default.
   */
  static async getTemplate(
    templateKey: string,
    userId: string | null,
  ): Promise<string> {
    const db = getDb()

    // Try user's custom template first
    if (userId) {
      const userTmpl = await db.select()
        .from(promptTemplates)
        .where(and(
          eq(promptTemplates.templateKey, templateKey),
          eq(promptTemplates.userId, userId),
        ))
        .limit(1)

      if (userTmpl.length > 0) return userTmpl[0].content
    }

    // Fall back to system template
    const sysTmpl = await db.select()
      .from(promptTemplates)
      .where(and(
        eq(promptTemplates.templateKey, templateKey),
        sql`${promptTemplates.userId} IS NULL`,
      ))
      .limit(1)

    if (sysTmpl.length > 0) return sysTmpl[0].content

    throw new Error(`Prompt template not found: ${templateKey}`)
  }

  /**
   * Format a template by replacing {variable} placeholders with actual values.
   */
  static formatPrompt(template: string, variables: Record<string, string | number>): string {
    let result = template
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value))
    }
    return result
  }
}
