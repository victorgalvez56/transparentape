-- Add conversation history to agent_sessions for context-aware PREGUNTA_LIBRE
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS last_messages jsonb;
