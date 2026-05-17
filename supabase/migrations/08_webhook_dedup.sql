-- Idempotency table for WhatsApp webhook deduplication
-- Prevents duplicate processing when Kapso retries on timeout/network errors
CREATE TABLE IF NOT EXISTS webhook_dedup (
  msg_id      TEXT        PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cleanup index — purge rows older than 24h via pg_cron or manual job
CREATE INDEX IF NOT EXISTS idx_webhook_dedup_created
  ON webhook_dedup (created_at);
