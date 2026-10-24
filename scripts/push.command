#!/bin/bash
# Double-click to push whatever is committed locally up to GitHub.
# No secrets live in this file.
cd "$(dirname "$0")/.." || exit 1
echo "Repo: $(pwd)"
echo
git log --oneline -3
echo
echo "Pushing to origin main…"
git push origin main
code=$?
echo
if [ $code -eq 0 ]; then
  echo "Pushed. Vercel will redeploy in a minute or two."
else
  echo "Push failed (exit $code). If it asked for a username, run: gh auth login"
fi
echo
read -n 1 -s -r -p "Press any key to close."
