#!/usr/bin/env bash
#
# Is SparkAI still up?
#
# Run this BEFORE you touch anything, and AGAIN after every step of the domain
# move. The endpoint it checks is hardcoded into every SparkConnect build in the
# App Store (App.js:626) — if it stops answering, SparkAI is down for every
# paying user until Apple approves a new release.
#
#   ./verify-api.sh                     check production
#   ./verify-api.sh https://preview-url check a preview deploy before promoting
#
# Exit 0 = healthy. Anything else = STOP, do not promote, roll the domain back.

set -uo pipefail

BASE="${1:-https://sparkconnect-website.vercel.app}"
ASK="$BASE/api/ask-nec"
TRANSCRIBE="$BASE/api/transcribe"

pass=0
fail=0

say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m    %s\n' "$*"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; fail=$((fail+1)); }

say ""
say "Checking $BASE"
say ""

# ── 1. The endpoint exists and is not a 404 ─────────────────────────────────
# A GET on a POST-only route legitimately returns 405 — that still proves the
# function is deployed and routing. 404 is the failure that matters: it means
# the path is gone, which is what a careless static deploy over this project
# does.
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$ASK" 2>/dev/null); code="${code:-000}"
case "$code" in
  200|400|405|422) ok   "/api/ask-nec is routing (HTTP $code)" ;;
  404)             bad  "/api/ask-nec is GONE (404) — the API has been overwritten" ;;
  000)             bad  "/api/ask-nec unreachable (network, DNS or TLS)" ;;
  5*)              bad  "/api/ask-nec is erroring (HTTP $code)" ;;
  *)               bad  "/api/ask-nec returned an unexpected HTTP $code" ;;
esac

# ── 2. A real question gets a real answer ───────────────────────────────────
# The check that actually matters. A route can exist and still be broken.
body=$(curl -sS --max-time 45 -X POST "$ASK" \
  -H 'Content-Type: application/json' \
  -d '{"question":"what is a switch loop"}' 2>/dev/null || echo "")

if [ -z "$body" ]; then
  bad "POST /api/ask-nec returned nothing"
elif printf '%s' "$body" | grep -qi '"answer"'; then
  ok  "POST /api/ask-nec returned an answer"
elif printf '%s' "$body" | grep -qi 'rate.limit\|429'; then
  ok  "POST /api/ask-nec is alive (rate limited, which still proves it is running)"
else
  bad "POST /api/ask-nec answered, but with no answer field:"
  printf '        %s\n' "$(printf '%s' "$body" | head -c 300)"
fi

# ── 3. Voice ────────────────────────────────────────────────────────────────
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$TRANSCRIBE" 2>/dev/null); code="${code:-000}"
case "$code" in
  200|400|405|422) ok  "/api/transcribe is routing (HTTP $code)" ;;
  404)             bad "/api/transcribe is GONE (404) — voice ask is broken" ;;
  000)             bad "/api/transcribe unreachable" ;;
  *)               bad "/api/transcribe returned HTTP $code" ;;
esac

say ""
if [ "$fail" -eq 0 ]; then
  printf '\033[32mAll %d checks passed. SparkAI is up.\033[0m\n\n' "$pass"
  exit 0
fi

# Everything failing to connect is almost never an outage — it is the machine
# you are running this on. Saying so stops a corporate proxy or a dropped VPN
# from being read as a production incident and triggering a needless rollback.
if [ "$pass" -eq 0 ] && ! curl -sS -o /dev/null --max-time 10 https://vercel.com >/dev/null 2>&1; then
  printf '\033[33mEvery check failed AND vercel.com is unreachable from here.\033[0m\n'
  printf 'That is your network, not the API. Fix your connection and re-run\n'
  printf 'before concluding anything. Do not roll anything back on this result.\n\n'
  exit 2
fi

printf '\033[31m%d check(s) FAILED.\033[0m\n' "$fail"
cat <<'EOT'

  DO NOT PROMOTE. If you have already moved the domain:

    1. Vercel -> the sparkconnect-website project -> Deployments
    2. Find the last deployment that was live before today
    3. "Promote to Production"
    4. Re-run this script

  The app calls the *.vercel.app URL, not the custom domain, so moving
  sparkconnect.pro alone should never cause this. If it did, the API files
  moved with it and the old project needs its deployment restored.

EOT
exit 1
