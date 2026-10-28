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

## Message format — every outbound message goes through src/lib/notify/format.ts

There is one house style and one place that implements it. Do not hand-roll a
template literal in a route.

    HEADER LINE (caps, optional · subtitle)
    <blank>
    subject block          — the fixture, the club, the player
    <blank>
    money block            — who pays whom, or the stake
    <blank>
    context                — head to head, standings

Non-negotiable:

- **Never print a raw id.** `anmol`, `laliga`, `man-city` are database keys.
  Resolve through `player_balances.name`, `competitions.name`, `clubs.name`
  before it reaches a human. `compName()`/`compShort()` have a hardcoded
  fallback for every competition so a missing join still reads correctly.
- **Every rupee figure goes through `money()` or `signed()`.** `₹1000` is a bug;
  `₹1,000` is the format. Negatives use U+2212 (`−₹500`), never a hyphen.
- **Scores and ranges use an en dash** (`2–1`, `leads 3–1`).
- **Tables live inside `<pre>`** via `pre(esc(...))`. parse_mode is HTML, so
  anything interpolated is `esc()`d — a club name with `&` would otherwise kill
  the whole message silently.
- The three fixture announcements (24h reminder, 30-minute warning, drawn tie)
  all render through `fixtureNotice()` in `src/lib/notify/fixture-notice.ts`.
  One function, so they cannot drift apart again.
- **No taunt before a result.** Reminders, warnings and drawn-tie notices carry
  the fixture, the money and the head to head — nothing else. The roast library
  fires when money actually moves, never on a fixture that has not been played.

`npm run preview:messages` prints every shape with sample data. Run it after any
format change and read the output before shipping.

## Two result sources

- **football-data.org** is primary. Its free tier can be hours late marking a
  match FINISHED (Napoli 3–3 Roma, 24 Oct 2026: five hours and counting).
- **ESPN's public scoreboard** (`src/lib/providers/espn.ts`) is the fallback.
  For any of our fixtures still SCHEDULED 105+ minutes after kickoff that
  football-data has not returned as finished, a completed *full-time* ESPN
  result joins the same `results` array and goes through the same scoring and
  approval path. AET/penalties never come from ESPN.
- ESPN-sourced payloads carry `provider: 'espn'`. When football-data catches up
  and disagrees, Archit gets one DM (`config` key `xcheck:<fixture id>`).
  Nothing is rewritten automatically — the ledger is append-only.
- ESPN also supplies **goal scorers** (`payload.goals` → `results.raw_payload`
  → `scorerLines()`), kept only when they add up to the score being written.
  Display only. If ESPN is down, the message posts without them.
- ESPN team ids live in `TEAM_ID_MAP.espn`. Same rule as the others: no name
  matching at runtime.

## Cups are ESPN-only

football-data's free tier carries no domestic cup, so ESPN is the sole source
for the FA Cup, Copa del Rey, Coppa Italia, DFB-Pokal, Community Shield and
DFL-Supercup (`ESPN_ONLY_COMPS`). One pass in the poller both inserts ties as
they are drawn (announcing each in the group) and proposes finished ones.

- **Nothing from a cup is ever auto-written.** Every cup tie is a knockout, so
  each result goes to Archit as an Approve/Reject proposal. One tap writes it
  and posts the result + standings exactly like an auto-written one.
- **Extra time:** ESPN's final score IS the 120' score. The 90' score is
  derived from the goal minutes (`minuteOf`, stoppage folded back). No usable
  goal list → `toNormalised` returns null and the fixture waits. Never guess.
- **Penalties:** shootout kicks are counted from `details[].shootout` and never
  enter the score or the margin. A level shootout returns null.
- Outside the daily schedule sync the cup pass only runs when one of our cup
  fixtures is actually due a result — ESPN is unofficial, don't hammer it.
- **Matching a cup tie is the dangerous part.** Find our row by competition +
  UNORDERED club pair, then: kickoff within 36h → same round → an undated,
  unrecorded row (adopt it: fill in kickoff and round). If the pair has rows
  and none fits, SKIP — never insert. The first version matched only on date
  or exact round, so two hand-entered one-off cups (NULL kickoff, different
  round label) got duplicate rows in ESPN's venue order — which slipped past
  UNIQUE(competition, round, home, away) — and money was proposed on matches
  settled in August. A missed tie is a /report away; a duplicate is a wrong
  ledger entry. `cup-match.test.ts` holds the decision table.
- **Cups run in their own route and their own cron job**: `/api/cron/cups`,
  every 15 minutes (migration 0021). They are NOT part of `/api/cron/poll`. A
  full schedule sync in the poller already spends ~60s on football-data's 6.5s
  call spacing; everything in one handler shares one function timeout, so the
  combined version returned nothing at all — no results, no reminders, no sync
  — and the only evidence was a NULL row in `net._http_response` where every
  other tick has a 200. **Check that table after any change to a cron route.**
- **The cup pass has a request budget and a 20s deadline.** The first version
  fetched 6 cups × 18 dates sequentially on a schedule sync; the poll function
  timed out and the ENTIRE tick returned nothing — no results, no reminders.
  `espnCupSweep` fetches dates concurrently and stops at the deadline; a cup
  skipped this tick is picked up on the next one. Anything added to the poller
  must respect that: the whole handler shares one function timeout, so a slow
  new source silently kills every job above it.
- **API-Football is no longer used.** `src/lib/providers/api-football.ts`
  remains for reference; `API_FOOTBALL_KEY` is dead config and can be removed
  from Vercel.

## The nightly brief (23:00 IST)

`/api/cron/digest`, pg_cron job `nightly-digest` at 17:30 UTC (migration 0023).
Fills the week-long gaps between counted fixtures.

- **Club, owner, headline. Nothing else.** Straight headlines, nothing
  generated and nothing editorialised — Archit chose this over an AI-written
  version. Three things were in the first draft and were cut after he read one:
  section headings (noise), general football headlines (a bare headline about a
  club nobody owns has no name to anchor it and reads as a non sequitur), and
  the next fixture (the 24-hour reminder and 30-minute warning already cover
  it; repeating it nightly just teaches people to skim). Do not add them back.
- Source is ESPN's news feed, one call per league (`NEWS_LEAGUES`). Articles
  are matched to our clubs **by ESPN team id** out of `TEAM_ID_MAP.espn`, never
  by club name — "United", "Inter" and "Madrid" are why that rule exists.
- `Media` (video) and `Recap` (match reports we post ourselves) are dropped.
- One slot per club, so a busy Arsenal week cannot fill the whole brief.
- Headlines already sent are remembered in `config.digest_seen_ids` (newest
  400) and never repeat.
- Sends with `urgent: true`: 23:00 is outside quiet hours anyway, but the flag
  also keeps it from being pushed past the six-message group ceiling.

## The roast library (0022 is the live one)

0012 was brutal about clubs and silent about the men. 0019 was sharp about the
men and the ledger and read like accountancy. **0022 fuses them**: every line
humiliates the club on its real reputation, then turns on the owner who drafted
it, then takes his money. 0019 is retired; un-retiring it is one UPDATE if the
register is ever wanted back.

- **Length is the point.** Long and medium, never one-liners — median ~270
  characters. Short lines were written, shown and explicitly rejected. A roast
  here is club → owner → direct second person → money → something final.
- **It stays on football**: clubs, draft picks, records, and what they say in
  the group. Nothing about anyone's life off the pitch. This fires
  automatically with no human deciding whether today is a good day for it.
- **The severity gate is gone.** `severityOk()` used to hold severity 3 back
  unless margin >= 3, a derby, or an upset, so a third of the library almost
  never played. Aiming now lives on the template
  (`conditions.margin_min` / `is_derby` / `is_upset`), where it can be pointed
  at the right fixture.
- `{rank}` renders as a word (`third of four`), not a digit.
- **`club_dossiers` goes stale.** It was seeded Jan 2026 and by Oct the
  `{manager}` slot was naming six men who had left. Re-check every window.
  Manchester United is deliberately NOT set: Amorim was sacked, Carrick was
  interim, the 2026-27 holder is unconfirmed. No 0022 line uses `{manager}`
  for United.

## Draws

A draw has no loser. `condMatch()` gives draws only lines with
`conditions.draw = true` (0020) and keeps those lines away from real results.
Draw lines use `{home_owner} {away_owner} {home_club} {away_club}`, never
`{loser}`/`{winner}`/`{amount}`. 0019's retire step spares lib 0020 — if a
later library adds its own retire step, it must spare 0020 too.

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
