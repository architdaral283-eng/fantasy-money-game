# Fantasy Football Money Game — 2026/27

Four friends, sixteen clubs, nine competitions. When two owned clubs meet, money moves. Append-only ledger, zero-sum by construction.

## Quick start

```bash
npm install
npm test                    # scoring engine: 22 spec cases + seed assertions (must be green)
npx tsx scripts/boot-check.ts   # 69 logged · 63 paying · 10/9/7/4 (boot refuses otherwise)
psql $DATABASE_URL -f supabase/migrations/0001_schema.sql
psql $DATABASE_URL -f supabase/migrations/0002_seed.sql
psql $DATABASE_URL -f supabase/migrations/0003_rls.sql
cp .env.example .env        # fill in provider + Supabase keys
npm run dev
```

## Build order (per spec §15)

1. ✅ Schema + seed + boot assertions (`supabase/migrations/`, `src/lib/seed/`)
2. ✅ Pure scoring engine + 22 tests (`src/lib/scoring/` — the ONLY place money is computed)
3. ✅ Provider adapters + verification script (`src/lib/providers/`, `scripts/verify-score-semantics.ts`)
4. ✅ Team-ID mapping script (`scripts/map-team-ids.ts`, IDs in `src/lib/providers/team-ids.ts`)
5. ✅ Manual entry path (Commissioner console one-line format → proposal preview)
6. ✅ Read-only web app (all §11 routes)
7. ✅ Telegram notifications (`TelegramAdapter` active; WhatsApp behind `WHATSAPP_ENABLED`)
8. ✅ Poller + approval queue (`/api/cron/poll`, `/api/approvals/[id]`, WhatsApp/Telegram webhooks)
9. ✅ Backfill (`/api/backfill`, bulk approve)
10. ✅ WhatsApp adapter (needs Meta verification + template approval — see below)
11. ✅ Awards, settlement, weekly report

## Invariants (§1)

- **Zero-sum**: every movement is a `from → to` row; trophy = 3 rows. Asserted after every write.
- **Append-only**: `ledger_append_only` trigger rejects UPDATE/DELETE. Corrections = reversal + new row.
- **Never guess / never auto-approve**: ambiguity → manual review; proposals escalate forever.
- **Idempotency**: unique partial indexes on fixture/tie/(trophy,from).
- **Integer rupees**: `CHECK (amount_inr % 500 = 0)`, no floats anywhere in the money path.

## Providers (§5)

| Provider | Covers | Quota | Role |
|---|---|---|---|
| football-data.org | EPL/La Liga/Bundesliga/Serie A/UCL | 10 req/min | Primary for the five |
| API-Football | all incl. 4 domestic cups | 100 req/day | Only source for cups |

Web app never calls APIs on page load — Postgres only. `api_call_log` enforces the quota; under 15 remaining, non-urgent work defers and the Commissioner is alerted.

Before trusting score fields: `FOOTBALL_DATA_ORG_TOKEN=... API_FOOTBALL_KEY=... npx tsx scripts/verify-score-semantics.ts` and commit the output.

## Amendment I (§2)

Ships **pending** in `/constitution` and the Commissioner console. The poller refuses to run until Archit ratifies it (`poller_enabled` in `config`).

## WhatsApp setup (§7.2, human steps)

Meta Business account → verification → WhatsApp Business Account → dedicated phone number (not on consumer WhatsApp) → permanent System User token → public HTTPS webhook. Submit the six `UTILITY` templates (`result_approval_request`, `result_recorded`, `tie_resolved`, `trophy_recorded`, `manual_review_needed`, `weekly_summary`). Cost: per-message since 1 Jul 2025; utility templates at Indian rates are fractions of a cent — a season at ~20 msgs/week is single-digit dollars. Every send is logged in `notifications` with provider ID + delivery status.

## Non-goals (§16)

No live minute-by-minute scores, no xG/odds, no payments/UPI, no native app, no public signup, no AI anywhere near the scoring engine.
