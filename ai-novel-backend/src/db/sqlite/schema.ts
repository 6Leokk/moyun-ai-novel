import { sqliteTable, text, integer, real, blob, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ── Project Meta (PG projects 的缓存副本) ──
export const projectMeta = sqliteTable('project_meta', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  genre: text('genre').notNull().default(''),
  theme: text('theme').notNull().default(''),
  description: text('description').notNull().default(''),
  narrativePerspective: text('narrative_perspective'),
  targetWords: integer('target_words').notNull().default(0),
  maxWordsPerChapter: integer('max_words_per_chapter'),
  outlineMode: text('outline_mode').notNull().default('one-to-many'),
  syncedAt: text('synced_at'),
})

// ── World Settings ──
export const worldSettings = sqliteTable('world_settings', {
  id: text('id').primaryKey(),
  timePeriod: text('time_period'),
  location: text('location'),
  atmosphere: text('atmosphere'),
  rules: text('rules'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

// ── World Entries ──
export const worldEntries = sqliteTable('world_entries', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),
  icon: text('icon').notNull().default('📦'),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  iconBg: text('icon_bg').notNull().default('linear-gradient(135deg,#1a1a1c,#2a2a2d)'),
  tags: text('tags').notNull().default('[]'),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

// ── Characters ──
export const characters = sqliteTable('characters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatarChar: text('avatar_char').notNull().default('?'),
  role: text('role').notNull().default('配角'),
  roleType: text('role_type').notNull().default('supporting'),
  color: text('color').notNull().default('#5a7d94'),
  alias: text('alias').notNull().default(''),
  gender: text('gender').notNull().default('未设定'),
  age: text('age'),
  personality: text('personality').notNull().default(''),
  background: text('background').notNull().default(''),
  appearance: text('appearance').notNull().default(''),
  isOrganization: integer('is_organization').notNull().default(0),
  organizationType: text('organization_type'),
  organizationPurpose: text('organization_purpose'),
  mainCareerId: text('main_career_id'),
  mainCareerStage: integer('main_career_stage'),
  traits: text('traits').notNull().default('[]'),
  aiGenerated: integer('ai_generated').notNull().default(0),
  source: text('source').notNull().default('manual'),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index('idx_chars_role').on(t.roleType),
  index('idx_chars_org').on(t.isOrganization),
])

// ── Character Relationships ──
export const characterRelationships = sqliteTable('character_relationships', {
  id: text('id').primaryKey(),
  characterFromId: text('character_from_id').notNull(),
  characterToId: text('character_to_id').notNull(),
  relationshipTypeId: text('relationship_type_id'),
  relationshipName: text('relationship_name').notNull(),
  intimacyLevel: integer('intimacy_level').notNull().default(50),
  description: text('description').notNull().default(''),
  startedAt: text('started_at'),
  source: text('source').notNull().default('manual'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  uniqueIndex('idx_cr_unique').on(t.characterFromId, t.characterToId, t.relationshipName),
  index('idx_cr_from').on(t.characterFromId),
  index('idx_cr_to').on(t.characterToId),
])

// ── Organizations ──
export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  characterId: text('character_id').notNull().unique(),
  memberCount: integer('member_count').notNull().default(0),
  powerLevel: integer('power_level').notNull().default(50),
  location: text('location'),
  motto: text('motto'),
  color: text('color'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

// ── Organization Members ──
export const organizationMembers = sqliteTable('organization_members', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  characterId: text('character_id').notNull(),
  position: text('position').notNull().default('成员'),
  rank: integer('rank').notNull().default(0),
  loyalty: integer('loyalty').notNull().default(50),
  joinedAt: text('joined_at'),
  status: text('status').notNull().default('active'),
  source: text('source').notNull().default('manual'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  uniqueIndex('idx_om_unique').on(t.organizationId, t.characterId),
])

// ── Careers ──
export const careers = sqliteTable('careers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().default('main'),
  description: text('description'),
  category: text('category'),
  stages: text('stages').notNull().default('[]'),
  maxStage: integer('max_stage').notNull().default(10),
  requirements: text('requirements'),
  specialAbilities: text('special_abilities'),
  source: text('source').notNull().default('manual'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

// ── Character Careers ──
export const characterCareers = sqliteTable('character_careers', {
  id: text('id').primaryKey(),
  characterId: text('character_id').notNull(),
  careerId: text('career_id').notNull(),
  careerType: text('career_type').notNull().default('main'),
  currentStage: integer('current_stage').notNull().default(1),
  stageProgress: integer('stage_progress').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  uniqueIndex('idx_cc_unique').on(t.characterId, t.careerId),
])

// ── Outlines ──
export const outlines = sqliteTable('outlines', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  structure: text('structure').notNull().default('{}'),
  orderIndex: integer('order_index').notNull().default(0),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index('idx_outlines_parent').on(t.parentId),
  index('idx_outlines_order').on(t.orderIndex),
])

// ── Chapters ──
export const chapters = sqliteTable('chapters', {
  id: text('id').primaryKey(),
  outlineId: text('outline_id'),
  chapterNumber: integer('chapter_number').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  summary: text('summary'),
  summaryStatus: text('summary_status').notNull().default('pending'),
  contentHash: text('content_hash'),
  wordCount: integer('word_count').notNull().default(0),
  status: text('status').notNull().default('draft'),
  charactersPresent: text('characters_present').notNull().default('[]'),
  expansionPlan: text('expansion_plan'),
  generationMode: text('generation_mode'),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  uniqueIndex('idx_chapters_num').on(t.chapterNumber),
  index('idx_chapters_outline').on(t.outlineId),
  index('idx_chapters_status').on(t.status),
])

// ── Foreshadows ──
export const foreshadows = sqliteTable('foreshadows', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  plantedChapterId: text('planted_chapter_id'),
  plantedAt: text('planted_at'),
  resolvedChapterId: text('resolved_chapter_id'),
  resolvedAt: text('resolved_at'),
  status: text('status').notNull().default('planted'),
  color: text('color').notNull().default('#f0a040'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index('idx_fs_status').on(t.status),
  index('idx_fs_planted').on(t.plantedChapterId),
])

// ── Memories ──
export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  chapterId: text('chapter_id'),
  category: text('category').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  importance: integer('importance').notNull().default(5),
  sourceType: text('source_type').notNull().default('extracted'),
  weight: real('weight').notNull().default(1.0),
  status: text('status').notNull().default('active'),
  embeddingModel: text('embedding_model'),
  embeddingDimensions: integer('embedding_dimensions'),
  embeddingVersion: text('embedding_version'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index('idx_mem_chapter').on(t.chapterId),
  index('idx_mem_status').on(t.status),
  index('idx_mem_source').on(t.sourceType),
])

// ── Chapter Analysis ──
export const chapterAnalysis = sqliteTable('chapter_analysis', {
  id: text('id').primaryKey(),
  chapterId: text('chapter_id').notNull(),
  severity: text('severity'),
  issues: text('issues').notNull().default('[]'),
  qualityScore: integer('quality_score'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})
