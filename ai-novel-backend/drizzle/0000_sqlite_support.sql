-- Add SQLite storage backend support to projects table
-- New projects use 'sqlite' backend, existing projects default to 'pg_legacy'

ALTER TABLE projects ADD COLUMN IF NOT EXISTS storage_backend VARCHAR(20) NOT NULL DEFAULT 'pg_legacy';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sqlite_path TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sqlite_status VARCHAR(20);

-- Index for finding projects by storage backend
CREATE INDEX IF NOT EXISTS idx_projects_storage ON projects(storage_backend) WHERE deleted_at IS NULL;
