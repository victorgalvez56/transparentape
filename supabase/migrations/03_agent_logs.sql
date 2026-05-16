-- Logs de llamadas al agente WhatsApp (Kapso)
-- Útil para monitorear uso durante la demo y detectar errores

CREATE TABLE IF NOT EXISTS agent_logs (
    id           SERIAL PRIMARY KEY,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    endpoint     TEXT NOT NULL,
    params       JSONB,
    n_resultados INTEGER,
    latencia_ms  INTEGER,
    error        TEXT
);
