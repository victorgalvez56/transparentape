-- Persistent per-user profile (no TTL). Survives session expiry so the bot
-- remembers a citizen's default country/region and accumulated interests
-- across visits.
--
-- NOTE: `phone` stores the raw E.164 number to stay consistent with
-- agent_sessions.conversation_id. RLS is currently disabled project-wide
-- (see 04_disable_rls.sql); when re-enabling, lock this table down or hash
-- the column at write time.

CREATE TABLE IF NOT EXISTS user_profile (
  phone            TEXT        PRIMARY KEY,
  display_name     TEXT,
  default_country  TEXT,
  default_region   TEXT,
  language         TEXT        NOT NULL DEFAULT 'es',
  total_queries    INT         NOT NULL DEFAULT 0,
  -- Frequency map { intent_name: count, region_name: count, ... } updated
  -- via JSONB merge on every message. Used to derive default_region after
  -- enough samples accumulate.
  common_topics    JSONB,
  first_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profile_last_seen
  ON user_profile (last_seen DESC);

ALTER TABLE user_profile DISABLE ROW LEVEL SECURITY;
