-- Context layer 1 extensions: active filters across turns, mentioned entities,
-- and rolling session summary. All optional/nullable so existing rows still work.

ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS active_filters     JSONB,
  ADD COLUMN IF NOT EXISTS mentioned_entities JSONB,
  ADD COLUMN IF NOT EXISTS session_summary    TEXT,
  -- Tracks how many message pairs are already folded into session_summary,
  -- so the summarizer only re-runs after N new pairs.
  ADD COLUMN IF NOT EXISTS summary_msg_count  INT NOT NULL DEFAULT 0;
