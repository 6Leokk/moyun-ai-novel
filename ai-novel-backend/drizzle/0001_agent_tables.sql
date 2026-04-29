-- Phase 1B: Agent runtime tables

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'generate',
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  phase VARCHAR(20),
  current_scene INTEGER,
  plan JSONB,
  word_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  checkpoint JSONB,
  result_data JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ar_idempotent ON agent_runs(user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ar_project_chapter ON agent_runs(project_id, chapter_id);
CREATE INDEX IF NOT EXISTS idx_ar_status ON agent_runs(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ar_chapter_active ON agent_runs(project_id, chapter_id)
  WHERE status IN ('queued','running','cancelling');

CREATE TABLE IF NOT EXISTS agent_run_events (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  event_type VARCHAR(30) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_are_seq ON agent_run_events(run_id, seq);
CREATE INDEX IF NOT EXISTS idx_are_created ON agent_run_events(created_at);

CREATE TABLE IF NOT EXISTS post_processing_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  task_type VARCHAR(30) NOT NULL,
  task_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_code TEXT,
  error_message TEXT,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppt_status ON post_processing_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ppt_project ON post_processing_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_ppt_locked ON post_processing_tasks(locked_at);

CREATE TABLE IF NOT EXISTS llm_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  chapter_id TEXT,
  phase VARCHAR(20),
  provider VARCHAR(20) NOT NULL,
  model VARCHAR(100) NOT NULL,
  request_type VARCHAR(20) NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost NUMERIC(10,6),
  latency_ms INTEGER,
  retry_index INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'success',
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_run ON llm_call_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_llm_project ON llm_call_logs(project_id, created_at DESC);
