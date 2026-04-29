import {
  pgTable, uuid, varchar, text, integer, smallint,
  boolean, real, numeric, timestamp, uniqueIndex, index,
  foreignKey, jsonb, pgEnum, bigserial, bigint, primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ── Enums ──
export const projectStatusEnum = pgEnum('project_status', ['planning', 'writing', 'completed'])
export const chapterStatusEnum = pgEnum('chapter_status', ['draft', 'writing', 'done', 'archived'])
export const wizardStatusEnum = pgEnum('wizard_status', ['idle', 'in_progress', 'completed'])
export const outlineModeEnum = pgEnum('outline_mode', ['one-to-one', 'one-to-many'])
export const aiProviderEnum = pgEnum('ai_provider', ['openai', 'anthropic', 'gemini'])
export const careerTypeEnum = pgEnum('career_type', ['main', 'sub'])
export const relationCategoryEnum = pgEnum('relation_category', ['positive', 'negative', 'neutral'])
export const memberStatusEnum = pgEnum('member_status', ['active', 'inactive', 'left'])
export const foreshadowStatusEnum = pgEnum('foreshadow_status', ['planted', 'hinted', 'resolved'])
export const genErrorCategoryEnum = pgEnum('gen_error_category', [
  'rate_limited', 'content_filtered', 'context_overflow',
  'auth_error', 'network_error', 'provider_internal', 'timeout', 'unknown',
])

// ── Users ──
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  oauthProvider: varchar('oauth_provider', { length: 20 }),
  oauthId: varchar('oauth_id', { length: 100 }),
  oauthToken: text('oauth_token'),
  oauthRefresh: text('oauth_refresh'),
  oauthExpires: timestamp('oauth_expires', { withTimezone: true }),
  avatarUrl: text('avatar_url'),
  emailVerified: boolean('email_verified').notNull().default(false),
  isAdmin: boolean('is_admin').notNull().default(false),
  trustLevel: smallint('trust_level').notNull().default(0),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_users_email').on(t.email),
  index('idx_users_oauth').on(t.oauthProvider, t.oauthId).where(sql`${t.oauthProvider} IS NOT NULL AND ${t.deletedAt} IS NULL`),
])

// ── User AI Keys ──
export const userAiKeys = pgTable('user_ai_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: aiProviderEnum('provider').notNull(),
  label: varchar('label', { length: 100 }).notNull().default(''),
  apiKeyEnc: text('api_key_enc').notNull(),
  apiBaseUrl: text('api_base_url'),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_uaik_user').on(t.userId),
  uniqueIndex('idx_uaik_default').on(t.userId, t.provider).where(sql`${t.isDefault} = true`),
])

// ── User AI Preferences ──
export const userAiPreferences = pgTable('user_ai_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  defaultProvider: aiProviderEnum('default_provider').notNull().default('openai'),
  defaultModel: varchar('default_model', { length: 100 }).notNull().default('gpt-4o'),
  defaultTemp: real('default_temp').notNull().default(0.8),
  defaultMaxTokens: integer('default_max_tokens').notNull().default(4096),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Projects ──
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  genre: varchar('genre', { length: 50 }).notNull().default(''),
  theme: text('theme').notNull().default(''),
  description: text('description').notNull().default(''),
  targetWords: integer('target_words').notNull().default(0),
  currentWords: integer('current_words').notNull().default(0),
  coverGradient: text('cover_gradient').notNull().default('linear-gradient(135deg,#0e0e10,#1a1a1c)'),
  status: projectStatusEnum('status').notNull().default('planning'),
  narrativePerspective: varchar('narrative_perspective', { length: 20 }),
  chapterCount: integer('chapter_count').notNull().default(0),
  maxWordsPerChapter: integer('max_words_per_chapter'),
  wizardStatus: wizardStatusEnum('wizard_status').notNull().default('idle'),
  wizardStep: smallint('wizard_step').notNull().default(0),
  aiKeyId: uuid('ai_key_id').references(() => userAiKeys.id, { onDelete: 'set null' }),
  aiModel: varchar('ai_model', { length: 100 }),
  outlineMode: outlineModeEnum('outline_mode').notNull().default('one-to-many'),
  deadline: timestamp('deadline', { withTimezone: true }),
  storageBackend: varchar('storage_backend', { length: 20 }).notNull().default('pg_legacy'),
  sqlitePath: text('sqlite_path'),
  sqliteStatus: varchar('sqlite_status', { length: 20 }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_projects_user').on(t.userId).where(sql`${t.deletedAt} IS NULL`),
  index('idx_projects_user_status').on(t.userId, t.status).where(sql`${t.deletedAt} IS NULL`),
  index('idx_projects_writing').on(t.userId, t.updatedAt.desc())
    .where(sql`${t.status} = 'writing' AND ${t.deletedAt} IS NULL`),
])

// ── World Settings (singleton per project) ──
export const worldSettings = pgTable('world_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().unique().references(() => projects.id, { onDelete: 'cascade' }),
  timePeriod: text('time_period'),
  location: text('location'),
  atmosphere: text('atmosphere'),
  rules: text('rules'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── World Entries (multi-row list items) ──
export const worldEntries = pgTable('world_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  category: varchar('category', { length: 20 }).notNull(),
  icon: varchar('icon', { length: 10 }).notNull().default('📦'),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description').notNull().default(''),
  iconBg: text('icon_bg').notNull().default('linear-gradient(135deg,#1a1a1c,#2a2a2d)'),
  tags: jsonb('tags').notNull().default(sql`'[]'`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_world_project').on(t.projectId),
  index('idx_world_category').on(t.projectId, t.category),
  index('idx_world_tags').on(t.tags),
])

// ── Careers ──
export const careers = pgTable('careers', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  type: careerTypeEnum('type').notNull().default('main'),
  description: text('description'),
  category: varchar('category', { length: 50 }),
  stages: jsonb('stages').notNull().default(sql`'[]'`),
  maxStage: smallint('max_stage').notNull().default(10),
  requirements: text('requirements'),
  specialAbilities: text('special_abilities'),
  source: varchar('source', { length: 10 }).notNull().default('ai'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_careers_project').on(t.projectId),
])

// ── Characters ──
export const characters = pgTable('characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  avatarChar: varchar('avatar_char', { length: 10 }).notNull().default('?'),
  role: varchar('role', { length: 50 }).notNull().default('配角'),
  roleType: varchar('role_type', { length: 20 }).notNull().default('supporting'),
  color: varchar('color', { length: 7 }).notNull().default('#5a7d94'),
  alias: varchar('alias', { length: 200 }).notNull().default(''),
  gender: varchar('gender', { length: 10 }).notNull().default('未设定'),
  age: varchar('age', { length: 20 }),
  personality: text('personality').notNull().default(''),
  background: text('background').notNull().default(''),
  appearance: text('appearance').notNull().default(''),
  isOrganization: boolean('is_organization').notNull().default(false),
  organizationType: varchar('organization_type', { length: 50 }),
  organizationPurpose: text('organization_purpose'),
  mainCareerId: uuid('main_career_id').references(() => careers.id, { onDelete: 'set null' }),
  mainCareerStage: smallint('main_career_stage'),
  traits: jsonb('traits').notNull().default(sql`'[]'`),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  source: varchar('source', { length: 10 }).notNull().default('manual'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_chars_project').on(t.projectId).where(sql`${t.deletedAt} IS NULL`),
  index('idx_chars_role').on(t.projectId, t.roleType).where(sql`${t.deletedAt} IS NULL`),
  index('idx_chars_org').on(t.projectId).where(sql`${t.isOrganization} = true AND ${t.deletedAt} IS NULL`),
  index('idx_chars_traits').on(t.traits),
])

// ── Character-Career Junction ──
export const characterCareers = pgTable('character_careers', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  careerId: uuid('career_id').notNull().references(() => careers.id, { onDelete: 'cascade' }),
  careerType: careerTypeEnum('career_type').notNull().default('main'),
  currentStage: smallint('current_stage').notNull().default(1),
  stageProgress: smallint('stage_progress').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('idx_cc_unique').on(t.characterId, t.careerId),
  index('idx_cc_char').on(t.characterId),
  index('idx_cc_career').on(t.careerId),
])

// ── Relationship Types ──
export const relationshipTypes = pgTable('relationship_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  category: relationCategoryEnum('category').notNull().default('neutral'),
  icon: varchar('icon', { length: 10 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Character Relationships ──
export const characterRelationships = pgTable('character_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  characterFromId: uuid('character_from_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  characterToId: uuid('character_to_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  relationshipTypeId: uuid('relationship_type_id').references(() => relationshipTypes.id),
  relationshipName: varchar('relationship_name', { length: 50 }).notNull(),
  intimacyLevel: smallint('intimacy_level').notNull().default(50),
  description: text('description').notNull().default(''),
  startedAt: text('started_at'),
  source: varchar('source', { length: 10 }).notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('idx_cr_unique').on(t.projectId, t.characterFromId, t.characterToId, t.relationshipName),
  index('idx_cr_project').on(t.projectId),
  index('idx_cr_from').on(t.characterFromId),
  index('idx_cr_to').on(t.characterToId),
])

// ── Organizations ──
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().unique().references(() => characters.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  memberCount: integer('member_count').notNull().default(0),
  powerLevel: smallint('power_level').notNull().default(50),
  location: varchar('location', { length: 200 }),
  motto: text('motto'),
  color: varchar('color', { length: 7 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_orgs_project').on(t.projectId),
])

// ── Organization Members ──
export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  position: varchar('position', { length: 50 }).notNull().default('成员'),
  rank: smallint('rank').notNull().default(0),
  loyalty: smallint('loyalty').notNull().default(50),
  joinedAt: text('joined_at'),
  status: memberStatusEnum('status').notNull().default('active'),
  source: varchar('source', { length: 10 }).notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('idx_om_unique').on(t.organizationId, t.characterId),
  index('idx_om_org').on(t.organizationId),
  index('idx_om_char').on(t.characterId),
])

// ── Outlines ──
export const outlines = pgTable('outlines', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): any => outlines.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull().default(''),
  structure: jsonb('structure').notNull().default(sql`'{}'`),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_outlines_project').on(t.projectId),
  index('idx_outlines_parent').on(t.projectId, t.parentId),
  index('idx_outlines_order').on(t.projectId, t.orderIndex),
])

// ── Chapters ──
export const chapters = pgTable('chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  outlineId: uuid('outline_id').references(() => outlines.id, { onDelete: 'set null' }),
  chapterNumber: integer('chapter_number').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull().default(''),
  wordCount: integer('word_count').notNull().default(0),
  status: chapterStatusEnum('status').notNull().default('draft'),
  charactersPresent: jsonb('characters_present').notNull().default(sql`'[]'`),
  expansionPlan: jsonb('expansion_plan'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('idx_chapters_num').on(t.projectId, t.chapterNumber),
  index('idx_chapters_project').on(t.projectId),
  index('idx_chapters_outline').on(t.outlineId),
  index('idx_chapters_status').on(t.projectId, t.status),
  // Full-text search will be created in raw SQL migration
])

// ── Foreshadows ──
export const foreshadows = pgTable('foreshadows', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description').notNull().default(''),
  plantedChapterId: uuid('planted_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  plantedAt: text('planted_at'),
  resolvedChapterId: uuid('resolved_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  resolvedAt: text('resolved_at'),
  status: foreshadowStatusEnum('status').notNull().default('planted'),
  color: varchar('color', { length: 7 }).notNull().default('#f0a040'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_foreshadows_project').on(t.projectId),
  index('idx_foreshadows_status').on(t.projectId, t.status),
  index('idx_foreshadows_chapter').on(t.plantedChapterId),
])

// ── Writing Styles ──
export const writingStyles = pgTable('writing_styles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  styleContent: text('style_content').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_wstyles_user').on(t.userId),
  uniqueIndex('idx_ws_user_name').on(t.userId, t.name).where(sql`${t.userId} IS NOT NULL`),
  uniqueIndex('idx_ws_system_name').on(t.name).where(sql`${t.userId} IS NULL`),
])

// ── Project Default Styles ──
export const projectDefaultStyles = pgTable('project_default_styles', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  styleId: uuid('style_id').notNull().references(() => writingStyles.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.projectId, t.styleId] }),
])

// ── Prompt Templates ──
export const promptTemplates = pgTable('prompt_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  templateKey: varchar('template_key', { length: 100 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  content: text('content').notNull(),
  variables: jsonb('variables').notNull().default(sql`'[]'`),
  isPublic: boolean('is_public').notNull().default(false),
  forkFromId: uuid('fork_from_id').references((): any => promptTemplates.id, { onDelete: 'set null' }),
  rating: integer('rating').notNull().default(0),
  downloads: integer('downloads').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('idx_pt_user_key').on(t.userId, t.templateKey).where(sql`${t.userId} IS NOT NULL`),
  uniqueIndex('idx_pt_system_key').on(t.templateKey).where(sql`${t.userId} IS NULL`),
  index('idx_pt_public').on(t.templateKey).where(sql`${t.isPublic} = true`),
])

// ── Inspirations ──
export const inspirations = pgTable('inspirations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  content: text('content').notNull(),
  category: varchar('category', { length: 20 }).notNull().default('idea'),
  isUsed: boolean('is_used').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_inspirations_user').on(t.userId, t.createdAt.desc()),
  index('idx_inspirations_project').on(t.projectId),
])

// ── Generation History ──
// ── Agent Runs ──
export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  mode: varchar('mode', { length: 20 }).notNull().default('generate'),
  status: varchar('status', { length: 30 }).notNull().default('queued'),
  phase: varchar('phase', { length: 20 }),
  currentScene: integer('current_scene'),
  plan: jsonb('plan'),
  wordCount: integer('word_count').notNull().default(0),
  errorMessage: text('error_message'),
  checkpoint: jsonb('checkpoint'),
  resultData: jsonb('result_data'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('idx_ar_idempotent').on(t.userId, t.idempotencyKey),
  index('idx_ar_project_chapter').on(t.projectId, t.chapterId),
  index('idx_ar_status').on(t.status),
  // Prevent concurrent runs on same chapter
  index('idx_ar_chapter_active').on(t.projectId, t.chapterId)
    .where(sql`${t.status} IN ('queued','running','cancelling')`),
])

// ── Agent Run Events (SSE event persistence) ──
export const agentRunEvents = pgTable('agent_run_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  eventType: varchar('event_type', { length: 30 }).notNull(),
  payload: jsonb('payload').notNull().default(sql`'{}'`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('idx_are_seq').on(t.runId, t.seq),
  index('idx_are_created').on(t.createdAt),
])

// ── Post-Processing Tasks ──
export const postProcessingTasks = pgTable('post_processing_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull(),
  taskType: varchar('task_type', { length: 30 }).notNull(),
  taskKey: text('task_key').notNull().unique(),
  payload: jsonb('payload').notNull().default(sql`'{}'`),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  priority: integer('priority').notNull().default(0),
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  lockedBy: text('locked_by'),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ppt_status').on(t.status),
  index('idx_ppt_project').on(t.projectId),
  index('idx_ppt_locked').on(t.lockedAt),
])

// ── LLM Call Logs ──
export const llmCallLogs = pgTable('llm_call_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  chapterId: text('chapter_id'),
  phase: varchar('phase', { length: 20 }),
  provider: varchar('provider', { length: 20 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  requestType: varchar('request_type', { length: 20 }).notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  estimatedCost: numeric('estimated_cost', { precision: 10, scale: 6 }),
  latencyMs: integer('latency_ms'),
  retryIndex: integer('retry_index').notNull().default(0),
  status: varchar('status', { length: 10 }).notNull().default('success'),
  errorCode: text('error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_llm_run').on(t.runId),
  index('idx_llm_project').on(t.projectId, t.createdAt.desc()),
])

// ── Generation History ──
export const generationHistory = pgTable('generation_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  genType: varchar('gen_type', { length: 30 }).notNull(),
  provider: varchar('provider', { length: 20 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
  durationMs: integer('duration_ms'),
  errorCategory: genErrorCategoryEnum('error_category'),
  status: varchar('status', { length: 10 }).notNull().default('success'),
  errorMsg: text('error_msg'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_gh_user').on(t.userId, t.createdAt.desc()),
  index('idx_gh_user_project').on(t.userId, t.projectId, t.createdAt.desc()),
])
