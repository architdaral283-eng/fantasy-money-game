#!/usr/bin/env bash
#
# FALLBACK ONLY. The normal way to do this is to send /setup to the bot as
# Commissioner: it runs server-side on Vercel, where the bot token actually
# lives, and no copy of the token has to exist anywhere else.
#
# Use this script only when the bot cannot receive /setup — which is exactly
# the case this exists for, because a broken webhook registration cannot be
# repaired by a command that arrives over that same webhook.
#
#   bash scripts/telegram-setup.sh
#
# .env here has TELEGRAM_BOT_TOKEN deliberately blank (the live token is in
# Vercel only), so this prompts for it with echo off and never writes it down.
# NOTE: zsh's `read -p` reads from a coprocess and is NOT a prompt — that is
# why `read -s -p` has silently produced an empty token here before. Hence
# `printf` then `read -s`, and hence this file being bash, not zsh.
#
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "No .env here. Run this from the repo root."; exit 1; }
set -a; . ./.env; set +a
: "${TELEGRAM_WEBHOOK_SECRET:?TELEGRAM_WEBHOOK_SECRET missing from .env}"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  printf 'Bot token (not echoed, not saved): '
  read -rs TELEGRAM_BOT_TOKEN
  echo
  echo "  token length: ${#TELEGRAM_BOT_TOKEN} (expect 46)"
  # pbpaste is a trap here: copying this command block overwrites the token
  # that was on the clipboard.
fi
[ -n "${TELEGRAM_BOT_TOKEN:-}" ] || { echo "No token given."; exit 1; }

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
URL="${WEBHOOK_URL:-https://fantasy-money-game.vercel.app/api/webhook/telegram}"
say() { printf '  %-18s %s\n' "$1" "$2"; }

# allowed_updates REPLACES the list; anything left out stops being delivered,
# and poll_answer is not in the default set — without it the prediction league
# collects taps and scores nothing, silently.
#
# secret_token must be sent every time. Omitting it CLEARS the secret, after
# which the handler rejects every update for missing the header.
echo "webhook"
say "setWebhook" "$(curl -s -X POST "$API/setWebhook" -H 'Content-Type: application/json' \
  -d "{\"url\":\"$URL\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\",\"callback_query\",\"poll_answer\",\"my_chat_member\"]}")"
say "allowed_updates" "$(curl -s "$API/getWebhookInfo" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result",{}).get("allowed_updates","<default>"))')"

echo
echo "Webhook is back. Send /setup to the bot for the command menu —"
echo "it reads the list straight from COMMAND_SECTIONS so it cannot drift."
unset TELEGRAM_BOT_TOKEN
