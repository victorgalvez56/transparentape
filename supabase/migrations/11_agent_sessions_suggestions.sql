-- Store last suggested questions so users can reply with index ("1","2","3")
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS last_suggestions jsonb;
