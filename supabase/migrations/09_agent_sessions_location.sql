-- Add GPS location to agent_sessions for "obras cerca de mí" feature
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS last_location jsonb;
