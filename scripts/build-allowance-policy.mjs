// ─── ONE POLICY, TWO SYSTEMS ─────────────────────────────────────────────────
// Generate the machine-readable allowance policy from ASK_ALLOWANCE, so the app
// and the backend read the SAME number instead of each holding their own copy.
//
// This is the legal-pages pattern applied to money: one source, a generator, and
// a drift check that fails the build when the published artifact stops matching
// the code. The client already has this discipline internally — every screen
// reads ASK_ALLOWANCE — but the SERVER is a separate system with its own
// hardcoded figure, which is how the app came to advertise limits the backend
// would not honour.
//
//   npm run allowance         write website/allowance-policy.json
//   npm run allowance:check   fail if it is stale
//
// The published file deploys with the website, so /api/ask-nec can fetch it and
// enforce exactly what the app promises.

import { readFileSync, writeFileSync } from 'node:fs';
import { ASK_ALLOWANCE, ALLOWANCE_CHANGED_AT } from '../src/core/paywall/entitlements.js';

const OUT = 'website/allowance-policy.json';

const policy = () => ({
  _readme:
    'Generated from src/core/paywall/entitlements.js by scripts/build-allowance-policy.mjs. '
    + 'DO NOT EDIT BY HAND — run `npm run allowance`. /api/ask-nec must enforce exactly these '
    + 'numbers, or the app advertises a limit the server does not honour.',
  version: 2,
  tiers: {
    free: { perDay: ASK_ALLOWANCE.free.perDay, perMonth: null },
    pro: { perDay: ASK_ALLOWANCE.pro.perDay, perMonth: ASK_ALLOWANCE.pro.monthlyBackstop },
    // Grandfathered: sold as 20/day on the App Store before the cutoff, and
    // kept for as long as the subscription stays active. The app sends
    // planType 'pro_legacy' for these accounts.
    pro_legacy: {
      perDay: ASK_ALLOWANCE.legacyPro.perDay,
      perMonth: ASK_ALLOWANCE.legacyPro.monthlyBackstop,
    },
    lifetime: { perDay: ASK_ALLOWANCE.lifetime.perDay, perMonth: null },
  },
  // Anything the server does not recognise is metered as free. An unknown tier
  // is either an older app or a tampered request, and free is the safe answer
  // to both — it never grants more than was paid for.
  unknownTierFallsBackTo: 'free',
  grandfatheredAt: ALLOWANCE_CHANGED_AT,
  // Purchased answers are NOT part of the allowance. They are permanent until
  // spent and must survive every daily and monthly reset.
  purchasedAnswers: {
    consumedAfterIncluded: true,
    expires: false,
    resetByDaily: false,
    resetByMonthly: false,
  },
});

const json = () => `${JSON.stringify(policy(), null, 2)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing counts as stale */ }
  if (current !== json()) {
    console.error(
      `\n${OUT} is stale.\n\n`
      + 'The allowance in the code and the policy the backend reads have diverged.\n'
      + 'Run `npm run allowance` and redeploy the website.\n',
    );
    process.exit(1);
  }
  console.log('allowance policy matches src/core/paywall/entitlements.js');
} else {
  writeFileSync(OUT, json());
  console.log(`wrote ${OUT}`);
}
