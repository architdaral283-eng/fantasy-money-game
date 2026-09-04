-- Migration 0006: automation support.
-- reminder_sent_at: 24h kickoff reminders fire once per fixture.
-- poller skips schedule work when the provider hasn't given us a date yet.

ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS provider_fixture_id TEXT;
