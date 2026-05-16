-- Deshabilitar Row Level Security para la demo del hackathon.
-- En producción real: habilitar con políticas apropiadas.

ALTER TABLE obras      DISABLE ROW LEVEL SECURITY;
ALTER TABLE red_flags  DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs DISABLE ROW LEVEL SECURITY;
