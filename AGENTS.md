<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# fantasy-money-game — agent contract

Read this before changing anything. It records decisions that are not obvious
from the code, and which have been made and then re-made. Ignoring it will
reintroduce a security hole or a money bug.

## What this is

Four friends in Delhi each own four football clubs. When two owned clubs meet
in one of nine in-scope competitions, rupees move between exactly two players.
Trophies pay out too. The system polls football data APIs, detects finished
fixtures, computes the movement under a ratified Constitution, writes to a
**permanent append-only ledger**, and notifies the group over Telegram.

This is real money between real friends. **Fidelity to the rules beats
elegance, performance and feature completeness.** A correct slow ledger beats
a fast wrong one. When in doubt, do less.

## Hard invariants — a design that can break these is wrong

1. **Zero-sum.** The four net balances sum to exactly Rs 0 after every write.
   Enforced structurally, not by an assert after the fact.
2. **Append-only.** NEVER `UPDATE` or `DELETE` a `ledger_entries` row. A
   correction appends a REVERSAL of every original row plus the corrected
   row(s), both flagged `is_correction` with `corrects_entry_id` set.
3. **Idempotent.** The poller runs every 5 minutes and re-sees the same
   fixtures. Re-processing must never double-write. `processed_updates`
   dedupes Telegram, unique constraints dedupe fixtures.
4. **Machine-verified results write automatically** (Amendment III, migration
   0013). Human-reported results (`/report`, one-offs) and disputes still need
   the Commissioner. Do NOT reintroduce approval for API-detected results —
   this was explicitly decided and all four players agreed.

## Security contract — DO NOT REGRESS THIS

Every money-writing route uses `supabaseService()`, the Supabase **service-role**
client, which **bypasses RLS entirely**. RLS is therefore NOT the gate. The
handler's own check is the only thing standing between the internet and the
ledger. The repo is **public**, so any weakness is readable by anyone.

**The rule: authenticate the caller from a verified credential, never from a
request-body field.**

Use `requireCommissioner(req)` from `src/lib/auth/require-commissioner.ts`:

```ts
const denied = requireCommissioner(req); if (denied) return denied;
```

It checks `Authorization: Bearer <ADMIN_SECRET>` and **fails closed** — an
unset secret means every route 401s. That is intentional. Do not add a
fallback, a default, or an `if (secret)` guard around it.

### Anti-patterns that were live in production and must never come back

```ts
// WRONG — anyone can type this. Was exploitable on the public internet.
const { decidedBy } = await req.json()
const { data: actor } = await db.from('players').select('role').eq('id', decidedBy ?? 'archit')
if (actor?.role !== 'COMMISSIONER') return 403
```
An empty-body POST resolved `decidedBy` to `'archit'` and passed. This shipped
in `/api/amendments/ratify` and `/api/corrections`. `/api/approvals/[id]` had
the same body-trust without the default. `/api/manual-entry` had no check at
all. `/api/backfill` hardcoded the id, so its check was always true.

```ts
// WRONG — disables itself when the env var is unset.
if (process.env.SOME_SECRET && provided !== process.env.SOME_SECRET) return 403
```
Fail closed instead: `if (!secret) return false`.

Other standing rules:

- Compare secrets with `secretsEqual()` (hashes both sides, then
  `timingSafeEqual`). Never `===`.
- Secrets go in **headers**, never query strings — query strings land in access
  logs, proxy logs and referrer headers.
- Telegram: verify `X-Telegram-Bot-Api-Secret-Token`. Meta/WhatsApp: HMAC-SHA256
  over the **raw request bytes** (`req.arrayBuffer()`), never re-serialized JSON.
- Attribution (`decided_by`, `actor_id`) comes from `COMMISSIONER_ID`, not the body.
- Anon RLS policies are `SELECT`-only. Do not add an anon INSERT/UPDATE policy.

## What changed in commit 4d1dbc8, and why

Auth: added the helper above; closed all five write routes; fixed the Telegram
fail-open; implemented the WhatsApp HMAC; `/api/approvals/[id]` now rejects an
unknown `action` instead of treating it as APPROVE.

CI: `.github/workflows/poll.yml` — a plain `curl -sS` **exits 0 on 401 and 500**,
so a dead poller showed a green checkmark over `{"error":"unauthorized"}`. It now
fails on non-2xx, empty or non-JSON body, `ok:false`, or a non-empty `errors[]`
(the poller returns HTTP 200 with `{"ok":true,"errors":[...]}` when a provider
call fails — that was invisible before). Telegram DM alerts on failure, rate
limited so the alerting survives being read.

`.github/workflows/keepalive.yml` — **do not delete this.** GitHub disables
scheduled workflows after 60 days of repo inactivity. The season runs to May
2027. Once development stops, the poller would silently die around November.

Cleanup: removed `/roastadd`, `/roastkill`, `/roaststats` (requested twice
during the build, only hidden from `/help`, never removed). Added
`scripts/backup.sh`, `supabase/migrations/0017_indexes.sql`, `!.env.example`.

## Regression traps — things that look like cleanup but are not

- **`.github/workflows/keepalive.yml`** looks like pointless commit noise. It is
  what keeps the game alive past November. Read its header comment.
- **The `poll` job has no `if:` guard**, so it also runs on the 03:30 UTC brief
  tick. That is deliberate: a DB-only daily heartbeat. Leave it.
- **`src/lib/providers/api-football.ts`, `WhatsAppCloudAdapter`, `scoreTrophy`,
  `scoreTwoLeggedTie`, `legCountFor`** are unreferenced but are the planned
  second provider, WhatsApp channel and cup engine. Not dead code.
- **Quiet window is 04:30–16:29 IST** (`QUIET_START_MIN`/`QUIET_END_MIN` in
  `src/lib/notify/quiet.ts`). It deliberately matches the non-polling window.
  Anything from 16:30 to 04:29 sends immediately — when a paying fixture ends
  the four are in the group discussing it, so the standings pin and roast must
  be instant, not batched into a digest.
- **`cron/poll` dynamically imports `refreshPin`/`fireRoast` from the Telegram
  route file.** Ugly (a route used as a library) but working. Moving it to
  `src/lib/telegram/` is fine; breaking it is not.

## Open backlog

**Deliberately NOT done — read the reasoning before "fixing" it:**

- **Fixture prefetch in `src/app/api/cron/poll/route.ts`.** The obvious N+1 fix
  (snapshot all fixtures once, index in memory) was analysed and rejected. The
  schedule pass *writes* `kickoff_utc` and `provider_fixture_id` that the
  results loop then re-reads, and status writes that a reversed second match
  re-reads. A snapshot breaks that read-after-write dependency and widens the
  window for a concurrent manual entry or Telegram approval to produce a
  duplicate proposal, from ~50 ms to a minute or more. Constraints would still
  block a double ledger write, but the gain is about one second on the path
  that moves money. Not worth it. The read-only repeats (`amendment_3_auto_write`,
  the commissioner chat id, the club map) were hoisted — those are safe.

**Genuinely open, roughly by value:**

1. **Backups are manual.** `npm run backup` dumps to `~/fantasy-money-backups/`.
   Automating it is unsafe here: the repo is public, so a committed dump or an
   Actions artifact is world-readable (ledger, names, chat ids). The paid fix is
   Supabase Pro (~$25/mo) for daily backups and PITR.
2. **Supabase Free pauses after 7 days of inactivity.** If the poller ever dies,
   the database follows about a week later. The two failure modes are linked.
3. **`/api/amendments/ratify` accepts any `config` key**, not just `amendment_*`.
   Authenticated-only now, so low risk, but it could stamp `status:'ratified'`
   onto an unrelated key.
4. `club_external_ids` and `competition_rounds` are seeded/created but never
   read. `POLLER_ENABLED` is documented in `.env.example` but no code reads it.
5. `.next/types` contains macOS duplicate-name artifacts (`... 2.ts`) that emit
   TS6053 noise on every typecheck. Cosmetic.

## Git and repo conventions

- **The repo is PUBLIC.** Never commit `.env`, a database dump, real chat ids,
  or any token. `.gitignore` has `.env*` with a `!.env.example` exception —
  `.env.example` carries **names only**, no values.
- Never force-push `main`; the keepalive bot also commits there, so pull first.
- Don't rewrite history — the ledger's audit story depends on it.
- Migrations are append-only and numbered (`00NN_name.sql`); never edit a
  migration that has been applied, add a new one.

## Verify before you claim you are done

```
npx vitest run     # must stay at 11 files / 75 tests passing
npx tsc --noEmit   # clean under src/ (ignore pre-existing TS6053 from .next/types)
npx eslint <files you touched>
```

The 25 scoring-engine tests and 4 invariant tests are the safety net for the
money math. If they cannot run, **stop and fix the test runner first** — do not
refactor the ledger blind.

The single check that proves the security fix is intact:

```
curl -sS -X POST https://fantasy-money-game.vercel.app/api/amendments/ratify \
  -H 'Content-Type: application/json' -d '{}'
```

Expect `401`. Before this work it returned `{"ok":true}` and ratified a
constitutional amendment for anyone on the internet. If it ever returns
anything other than 401 again, the contract at the top of this file has been
broken.

## A note on method

Four findings in the audit that produced this file were wrong on first pass,
each because a `grep` result was treated as a conclusion instead of a lead. The
Telegram webhook did have auth; `api_call_log` held nothing sensitive; the test
suite was never broken; `TELEGRAM_WEBHOOK_SECRET` was set in production. What
survived was what was read line by line or verified against the live system.
Do the same: open the handler, run the query, check the deployment.
