-- Migration 0009: queued-message store for quiet hours + daily ceiling digest.
CREATE TABLE IF NOT EXISTS message_queue (
  id BIGSERIAL PRIMARY KEY,
  dest TEXT NOT NULL, -- 'group' or 'player:<id>'
  channel TEXT NOT NULL DEFAULT 'telegram',
  template_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  urgent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  not_before TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
