-- Add last_location column for proximity search ("obras cerca de mí").
-- Referenced by web/lib/agent-kapso/session.ts since the BUSCAR_CERCANOS flow
-- was added; the column was created manually in dev and never migrated.
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS last_location JSONB;
