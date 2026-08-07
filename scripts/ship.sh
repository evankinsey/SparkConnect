#!/usr/bin/env bash
#
# Ship SparkConnect to TestFlight.
#
#   bash scripts/ship.sh
#
# Runs the preflight first and REFUSES to build if anything fails, because a
# broken build still costs a full upload-and-wait cycle to discover.
#
# Everything before `eas build` runs locally in seconds. The build itself runs
# on Expo's servers and takes 15-25 minutes; you can close the terminal once it
# says the build is queued, and watch it at expo.dev instead.

set -euo pipefail

cd "$(dirname "$0")/.."

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n\n' "$*"; exit 1; }

bold "── What is about to ship ──"
node -e "
const a = require('./app.json').expo;
const e = require('./eas.json');
console.log('  version    ' + a.version + ' (' + a.ios.buildNumber + ')');
console.log('  bundle id  ' + a.ios.bundleIdentifier);
console.log('  ascAppId   ' + e.submit.production.ios.ascAppId);
console.log('  increment  ' + (e.build.production.autoIncrement ? 'AUTO' : 'off — ships exactly this number'));
"
echo

bold "── Preflight ──"

git diff --quiet && git diff --cached --quiet \
  || die "Uncommitted changes. Commit them first so the build matches the repo."
ok "working tree clean"

npm test >/tmp/sc-test.log 2>&1 \
  || { tail -30 /tmp/sc-test.log; die "Tests failed. Nothing shipped."; }
ok "$(grep -E '^# pass' /tmp/sc-test.log | head -1 | tr -s ' ') tests"

npx --yes esbuild App.js --bundle --platform=neutral --loader:.js=jsx \
  --loader:.png=text --loader:.jpg=text --outfile=/dev/null \
  --external:react --external:react-native --external:react-native-svg \
  --external:@expo/vector-icons --external:@react-native-async-storage/async-storage \
  --external:expo --external:'expo-*' --external:react-native-purchases \
  >/dev/null 2>&1 || die "App.js does not bundle. It would fail on Expo's builder too."
ok "App.js bundles"

npm run legal:check >/dev/null 2>&1 \
  || die "Legal pages are stale. Run: npm run legal"
ok "privacy and terms in sync across app and web"

echo

# ── eas-cli ──────────────────────────────────────────────────────────────────
if ! command -v eas >/dev/null 2>&1; then
  bold "── Installing eas-cli ──"
  npm i -g eas-cli
fi
ok "eas-cli $(eas --version 2>/dev/null | head -1)"

if ! eas whoami >/dev/null 2>&1; then
  bold "── Log in to Expo ──"
  eas login
fi
ok "logged in as $(eas whoami 2>/dev/null)"

echo
bold "── Building on Expo's servers ──"
echo "  15-25 minutes. Safe to close the terminal once it says 'Build queued'."
echo "  Watch it at https://expo.dev"
echo
eas build --platform ios --profile production

echo
bold "── Submitting to App Store Connect ──"
echo "  Apple will ask for your Apple ID and an app-specific password."
echo "  Generate one at appleid.apple.com → Sign-In and Security → App-Specific Passwords."
echo
eas submit --platform ios --profile production --latest

echo
bold "── Done ──"
cat <<'EOT'
  The build appears in TestFlight after Apple finishes processing —
  usually 5-15 minutes, occasionally an hour.

  First thing to check on the device, in this order:

    1. Ask SparkAI anything open-ended. It should ANSWER.
       If it still says it cannot answer with full confidence, the
       backend is unreachable from the phone — check /api/ask-nec on
       cellular with wifi off, and check Vercel's SSO protection.

    2. Open the paywall. Every plan should show a price.
       A plan reading "Unavailable right now" means that product id
       does not exist in App Store Connect.

    3. Fresh install → onboarding should appear, disclaimer first.
EOT
