#!/usr/bin/env bash
# Manual Postgres backup of the league database — run on your Mac, not in CI.
#
#   npm run backup            (or: bash scripts/backup.sh)
#
# Writes a plain-SQL pg_dump of the `public` schema (players, clubs, fixtures,
# ledger_entries, pending_approvals, config, notifications, ...) to
#   ~/fantasy-money-backups/fantasy-money-game_<UTC timestamp>.sql
# (override the folder with FMG_BACKUP_DIR). The file is chmod 600: it contains
# real names, Telegram chat ids and the money ledger.
#
# WHY MANUAL AND LOCAL: the GitHub repo is PUBLIC and the Supabase project is on
# the Free plan (no automatic backups, no point-in-time recovery). A workflow
# that committed a dump or uploaded it as an Actions artifact would publish the
# ledger to the internet. So the only safe place for a copy is your own disk.
# This script refuses to write inside the repo checkout for that reason.
#
# RESTORE (new Supabase project, or the same one after a disaster):
#   psql "$NEW_DATABASE_URL" -f ~/fantasy-money-backups/fantasy-money-game_<ts>.sql
# then re-run supabase/migrations/0003_rls.sql and 0004_public_read.sql if the
# grants/policies did not come across, and `npx tsx scripts/boot-check.ts`.
#
# Connection: DATABASE_URL from .env (or the environment). Use the Supabase
# "Session pooler" URI (…pooler.supabase.com:5432). The transaction pooler
# (port 6543) does not support pg_dump, and the direct db.<ref>.supabase.co
# host is IPv6-only on the Free plan.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${FMG_BACKUP_DIR:-$HOME/fantasy-money-backups}"

die() { printf 'backup: ERROR: %s\n' "$*" >&2; exit 1; }

# ── 1. pg_dump present and usable ────────────────────────────────────────────
command -v pg_dump >/dev/null 2>&1 || die "pg_dump not found. On macOS: 'brew install libpq && brew link --force libpq' (client tools only) or 'brew install postgresql@17'. pg_dump must be at least as new as the Supabase Postgres version (check Settings → Infrastructure)."

# ── 2. DATABASE_URL from the environment or .env (never `source` .env) ───────
if [ -z "${DATABASE_URL:-}" ]; then
  ENV_FILE="$ROOT/.env"
  [ -f "$ENV_FILE" ] || die "no DATABASE_URL in the environment and no $ENV_FILE. Copy .env.example to .env and set DATABASE_URL to the Supabase Session-pooler URI."
  DATABASE_URL="$(grep -E '^[[:space:]]*DATABASE_URL=' "$ENV_FILE" | head -n 1 | sed -E 's/^[[:space:]]*DATABASE_URL=//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/; s/[[:space:]]+$//')"
fi
[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL is empty. Set it in .env (Supabase → Connect → Session pooler URI, port 5432)."
case "$DATABASE_URL" in
  postgres://*|postgresql://*) ;;
  *) die "DATABASE_URL does not look like a postgres:// URI." ;;
esac
case "$DATABASE_URL" in
  *:6543/*) printf 'backup: WARNING: DATABASE_URL uses port 6543 (transaction pooler); pg_dump usually fails there. Use the Session pooler URI (port 5432) if this errors.\n' >&2 ;;
esac

# ── 3. Backup folder must exist and must NOT be inside the (public) repo ─────
mkdir -p "$BACKUP_DIR"
BACKUP_DIR_ABS="$(cd "$BACKUP_DIR" && pwd -P)"
ROOT_ABS="$(cd "$ROOT" && pwd -P)"
case "$BACKUP_DIR_ABS/" in
  "$ROOT_ABS"/*) die "backup folder $BACKUP_DIR_ABS is inside the repo checkout ($ROOT_ABS). The repo is public — pick a folder outside it (FMG_BACKUP_DIR)." ;;
esac

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR_ABS/fantasy-money-game_${STAMP}.sql"
[ ! -e "$OUT" ] || OUT="${OUT%.sql}_$$.sql"   # never overwrite an existing backup
TMP="$OUT.partial"
trap 'rm -f "$TMP"' EXIT

# ── 4. Dump ──────────────────────────────────────────────────────────────────
printf 'backup: dumping public schema → %s\n' "$OUT"
if ! pg_dump "$DATABASE_URL" \
      --schema=public --no-owner --format=plain --encoding=UTF8 \
      --file="$TMP"; then
  die "pg_dump failed. Common causes: wrong password / URI (re-copy from Supabase → Connect → Session pooler); port 6543 (use 5432); 'server version mismatch' (upgrade pg_dump: brew upgrade libpq); project paused (Free plan pauses after 7 days idle — unpause in the dashboard)."
fi

# ── 5. Sanity-check the file before calling it a backup ──────────────────────
[ -s "$TMP" ] || die "pg_dump produced an empty file."
grep -q 'PostgreSQL database dump complete' "$TMP" || die "dump is truncated (no 'dump complete' trailer) — not keeping it."
grep -q '^COPY public\.ledger_entries ' "$TMP" || die "dump has no ledger_entries table — wrong database? Not keeping it."
LEDGER_ROWS="$(awk '/^COPY public\.ledger_entries /{f=1; next} f && /^\\\.$/{exit} f{n++} END{print n+0}' "$TMP")"
[ "$LEDGER_ROWS" -gt 0 ] || die "ledger_entries has 0 rows in the dump — refusing to keep a suspicious backup (the seed alone has entries)."

mv "$TMP" "$OUT"
chmod 600 "$OUT"
trap - EXIT

SIZE="$(du -h "$OUT" | cut -f1)"
COUNT="$(ls -1 "$BACKUP_DIR_ABS"/fantasy-money-game_*.sql 2>/dev/null | wc -l | tr -d ' ')"
printf 'backup: OK  %s  (%s, ledger_entries rows: %s)\n' "$OUT" "$SIZE" "$LEDGER_ROWS"
printf 'backup: %s backup(s) in %s — keep them; they are tiny and this ledger is permanent.\n' "$COUNT" "$BACKUP_DIR_ABS"
