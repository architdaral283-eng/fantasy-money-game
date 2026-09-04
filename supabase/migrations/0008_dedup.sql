-- Migration 0008: Telegram update dedup (serverless has no memory; Telegram redelivers).
CREATE TABLE IF NOT EXISTS processed_updates (
  update_id BIGINT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
