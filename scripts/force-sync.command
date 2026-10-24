#!/bin/bash
# Forces one full schedule + cup-discovery pass on the deployed poller instead
# of waiting for the 24-hour quota gate. Asks for CRON_SECRET and never stores it.
APP="${APP_URL:-https://fantasy-money-game.vercel.app}"
echo "Forcing a schedule + cup sync on $APP"
echo
read -s -p "CRON_SECRET (paste, nothing is echoed): " SECRET
echo
echo
RESP=$(curl -sS -X POST "$APP/api/cron/poll?sync=1" -H "Authorization: Bearer $SECRET" -w $'\n%{http_code}')
unset SECRET
CODE=$(printf '%s' "$RESP" | tail -1)
BODY=$(printf '%s' "$RESP" | sed '$d')
echo "HTTP $CODE"
printf '%s\n' "$BODY" | python3 -m json.tool 2>/dev/null || printf '%s\n' "$BODY"
echo
echo 'Look for "forced": true and a cupsFound count.'
read -n 1 -s -r -p "Press any key to close."
