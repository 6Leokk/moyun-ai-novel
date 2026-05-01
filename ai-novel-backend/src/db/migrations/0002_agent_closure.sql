-- Agent closure fields: confirmed plans and user automation preferences

ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS confirmed_plan jsonb;

ALTER TABLE user_ai_preferences ADD COLUMN IF NOT EXISTS auto_plan_approval_mode varchar(20) NOT NULL DEFAULT 'manual';

ALTER TABLE user_ai_preferences ADD COLUMN IF NOT EXISTS auto_result_handling_mode varchar(30) NOT NULL DEFAULT 'manual';
