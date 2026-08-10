# Launching 1.3.0 (33)

No laptop needed. Every step below is a phone browser.

Verified on 10 Aug 2026 against commit `2af9af9`: full suite 104/104, bundle
clean, `legal:check` / `allowance:check` / `atlas:check` all in sync,
`app.json` at 1.3.0 (33), `eas.json` `autoIncrement: false` so the build ships
exactly 33 and a duplicate would be rejected at submit rather than silently
overwriting anything.

---

## Step 1 — Merge PR #1 — DONE 10 Aug 04:07 UTC

Merged as `ca3a12b`. `main` now carries 1.3.0 (33) and both website files.
Left here because the reasoning is what matters if this ever comes up again.

**Why this is first and not optional.** Two files live only on the branch, and
both are things you asked for:

- `website/app-config.json` — **the kill switch**. It is how you turn a feature
  off without waiting three days on App Review. The app already fetches it,
  fails open when it 404s, and it 404s today because it has never been on
  `main`. Ship without merging and you ship with no off switch.
- `website/allowance-policy.json` — what `/api/ask-nec` reads to meter SparkAI.
  It is generated from `entitlements.js`, so the numbers cannot drift from the
  app's.

Merging also publishes the corrected Pro copy on `sparkconnect.pro` (the old
card promised "SparkAI without the daily ceiling" on a capped tier).

The `spark-connect` Vercel project builds from `main` on push, so both files
are live a minute or two after the merge. Confirm by opening
`https://sparkconnect.pro/allowance-policy.json` — JSON with four tiers, not a
404.

## Step 2 — Run the ship workflow

**Actions** tab → **Ship to TestFlight** → **Run workflow** (the grey button at
the top right of the run list).

- Branch: `main` (after step 1)
- Platform: `ios`
- Submit: **on**

> **Not "Re-run jobs".** Opening a previous run and re-running it replays *that
> run's commit*, not the branch as it stands now — so it rebuilds an old
> `app.json`, ships a build number Apple already has, and fails at the submit
> step 25 minutes and one paid build credit later with "You've already
> submitted this build of the app." This happened on 10 Aug: a re-run of the
> build-32 run produced a build-32 binary from `main` that was already at 33.
> Preflight now refuses a run whose commit is not the tip of its branch, so the
> same mistake costs 11 seconds instead of half an hour.

The `EXPO_TOKEN` secret is already set — four previous runs of this workflow
succeeded, most recently the one that produced build 32.

Preflight runs the whole suite, the bundle, and both drift checks before it
spends 20 minutes on a builder. All four pass on this commit as of the
verification above, so a red preflight means something changed after it.

Roughly 20–30 minutes to a build, then Apple's processing (10 minutes to an
hour) before it appears in TestFlight.

## Step 3 — App Store Connect

The `--auto-submit` upload lands the binary in TestFlight. It does **not**
create the public version — that is still a human decision, deliberately.

App Store Connect currently shows **1.0 (26)** live, so 1.3.0 is a new version
entry rather than an edit of the one in review.

- [x] Promotional text updated to 10/day — done 10 Aug
- [ ] Description states no allowance other than 5 free / 10 Pro
- [ ] Screenshots show the current HUD, not build 32's floating dock
- [ ] Attach build 33, submit for review

Full identifier audit — bundle id, both RevenueCat keys, all six product ids,
checked commit by commit against the build that is live — is in
`APP-STORE-LISTING.md`. Nothing about the store products needs touching.

---

## What to check on the device first, in this order

1. **Ask SparkAI something open-ended.** It should answer. Still refusing means
   the backend is unreachable from the phone, not that the fix failed — test on
   cellular with wifi off, and check Vercel's SSO protection.
2. **Open the paywall.** Every plan shows a price. "Unavailable right now"
   against a specific plan means that product id is missing in App Store
   Connect; against all of them means the SDK did not initialise.
3. **Open the Jobsite game.** This is the one genuinely unproven path — the
   `react-native-svg` raster layer that draws the new art has never run on a
   real device, only in the packer and in tests. If sprites come back
   misplaced, tiny, or invisible, that is the first place to look, and the
   fallback is already written: with `ATLAS` null every name renders as the
   vector component it used before, so it degrades to build 32's look rather
   than to a blank screen.
4. **Fresh install.** Onboarding appears, disclaimer first.

## If something is wrong after launch

Edit `website/app-config.json` on `main`, adding the feature under `features`
with `"disabled": true` and a `notice` explaining it. Vercel redeploys on push
and every installed app picks it up within hours.

Safety surfaces, the calculators, restore-purchases and the paywall are in
`PROTECTED` and ignore any attempt to switch them off — a bad config cannot
take away something a subscriber paid for.

## Not blocking launch

`/api/ask-nec` is still unpatched, so the server meters on whatever it enforces
today rather than on the four-tier policy. That used to be launch-blocking
because the app asserted a specific number in its "out of answers" message and
the number was the app's, not the server's. The app no longer claims a count it
did not count, so an unpatched server is now a silent disagreement instead of a
visible falsehood. Patch it when the deployed source is in hand —
`GPT-VERCEL-ALLOWANCE-TASK.md` is ready to hand over.
