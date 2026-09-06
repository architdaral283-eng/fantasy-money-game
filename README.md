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

## Backups (manual, on your Mac — there are none otherwise)

The Supabase project is on the Free plan: **no automatic backups, no point-in-time recovery**, and a paused/deleted project takes the whole ledger with it. The repo is **public**, so a backup must never be committed or uploaded as an Actions artifact (that would publish the ledger, real names and chat ids). The only safe copy is on your own disk:

```bash
npm run backup      # = bash scripts/backup.sh → ~/fantasy-money-backups/fantasy-money-game_<utc>.sql (chmod 600)
```

Needs `pg_dump` (`brew install libpq && brew link --force libpq`) and `DATABASE_URL` in `.env` set to the Supabase **Session pooler** URI (`…pooler.supabase.com:5432`; the 6543 transaction pooler cannot pg_dump, and the direct host is IPv6-only on Free). The script refuses to write inside the repo, rejects truncated dumps, and prints the number of `ledger_entries` rows it captured.

**When to run it**

- Before running any migration (`supabase/migrations/00xx_*.sql`) or `/api/corrections` / `/api/backfill` call.
- Weekly during the season (Monday, after the weekend's results are approved), and after any trophy is recorded.
- At season end (May 2027) before settling up — that file *is* the final ledger.

Restore into a fresh Supabase project: `psql "$NEW_DATABASE_URL" -f <backup>.sql`, re-run `0003_rls.sql` / `0004_public_read.sql` if grants did not carry over, then `npx tsx scripts/boot-check.ts`. Paid alternative: Supabase Pro (US$25/mo) adds daily backups with 7-day retention (PITR is an add-on) — worth it if you would rather not remember to run this.

## Failure alerts (Telegram DM)

`poll.yml` and `keepalive.yml` fail loudly and, if two **GitHub repository secrets** are set, DM you on Telegram (your private chat with the bot — never the league group): `TELEGRAM_BOT_TOKEN` (same value as on Vercel) and `TELEGRAM_ALERT_CHAT_ID` (your own Telegram user id; the bot can only DM you after you have pressed Start on it once). Without them the workflows only send GitHub's failure email. The poll job alerts when an outage starts and then roughly hourly while it continues, not on all 156 daily ticks.

## Non-goals (§16)

No live minute-by-minute scores, no xG/odds, no payments/UPI, no native app, no public signup, no AI anywhere near the scoring engine.
