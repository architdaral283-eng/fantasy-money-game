#!/usr/bin/env bash
#
# Registers the webhook and the "/" command menu with Telegram.
#
# Neither of these lives in the repo. Both are server-side state on Telegram's
# machines, which is why deleting a command from the code never removed it from
# the menu, and why adding poll_answer to the code does not make Telegram send
# poll answers.
#
# Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from .env and prints
# nothing but Telegram's own replies, so neither value reaches the terminal
# scrollback, the clipboard, or anywhere else.
#
#   bash scripts/telegram-setup.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "No .env here. Run this from the repo root."; exit 1; }
set -a; . ./.env; set +a
: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN missing from .env}"
: "${TELEGRAM_WEBHOOK_SECRET:?TELEGRAM_WEBHOOK_SECRET missing from .env}"

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
URL="${WEBHOOK_URL:-https://fantasy-money-game.vercel.app/api/webhook/telegram}"

say() { printf '  %-20s %s\n' "$1" "$2"; }

# ── webhook ─────────────────────────────────────────────────────────────────
# allowed_updates REPLACES the list; anything left out stops being delivered.
# poll_answer is what the prediction league runs on — without it Telegram never
# sends a vote and the leaderboard stays empty forever, silently.
#
# secret_token must be sent on every setWebhook call. Omitting it CLEARS the
# secret, and the handler rejects every update that arrives without the
# X-Telegram-Bot-Api-Secret-Token header.
echo "webhook"
say "setWebhook" "$(curl -s -X POST "$API/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"$URL\",
       \"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",
       \"allowed_updates\":[\"message\",\"callback_query\",\"poll_answer\",\"my_chat_member\"]}")"

say "allowed_updates" "$(curl -s "$API/getWebhookInfo" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result",{}).get("allowed_updates","<default>"))')"

# ── command menu ────────────────────────────────────────────────────────────
# Keep this list in step with buildHelp() in src/lib/notify/format.ts.
# Commissioner commands are deliberately absent: the menu shows to all four
# players, and three of them would only ever get "Commissioner only."
read -r -d '' COMMANDS <<'JSON' || true
[{"command":"standings","description":"table + photo"},
 {"command":"balance","description":"one player, net"},
 {"command":"me","description":"your record"},
 {"command":"settle","description":"who pays whom"},
 {"command":"ledger","description":"recent payments"},
 {"command":"stakes","description":"money in play this week"},
 {"command":"exposure","description":"your ceiling and floor"},
 {"command":"swing","description":"biggest swing left"},
 {"command":"next","description":"what counts next"},
 {"command":"last","description":"recent results"},
 {"command":"trophies","description":"live races"},
 {"command":"club","description":"one club, whole season"},
 {"command":"streak","description":"everyone's form"},
 {"command":"taunt","description":"roast the latest loser"},
 {"command":"h2h","description":"two of you, head to head"},
 {"command":"nemesis","description":"who you keep paying"},
 {"command":"rewind","description":"the last seven days"},
 {"command":"predictions","description":"the prediction league"},
 {"command":"awards","description":"season honours"},
 {"command":"report","description":"file a result"},
 {"command":"rules","description":"the money rules"},
 {"command":"help","description":"all commands"}]
JSON

# Every scope, not just the default: a list set for all_private_chats silently
# overrides the default one, which is how a BotFather edit can look like it did
# nothing at all.
echo "command menu"
for SCOPE in default all_private_chats all_group_chats; do
  say "$SCOPE" "$(curl -s -X POST "$API/setMyCommands" \
    -H 'Content-Type: application/json' \
    -d "{\"scope\":{\"type\":\"$SCOPE\"},\"commands\":$COMMANDS}")"
done

echo
echo "Expect ok:true on every line, and poll_answer in allowed_updates."
echo "The menu is cached on the device — force-quit Telegram to see it change."
