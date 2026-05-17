-- WhatsApp agent session store (replaces in-memory Map — required for Vercel serverless)
CREATE TABLE IF NOT EXISTS agent_sessions (
  conversation_id  TEXT        PRIMARY KEY,
  country          TEXT        NOT NULL DEFAULT 'PE',
  last_query       TEXT,
  last_result_ids  INTEGER[],
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-expire rows older than 30 minutes via pg_cron (if available)
-- otherwise the SELECT in session.ts filters by updated_at already.

CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated
  ON agent_sessions (updated_at);
