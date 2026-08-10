# App Store submission — 1.3.0 (33)

Everything App Store Connect needs to agree with the binary. The identifiers
were checked against build 26 (the version currently live) commit by commit,
not from memory.

## Identifiers — VERIFIED UNCHANGED since build 26

| Field | Value | Checked |
|---|---|---|
| Bundle ID | `com.sparkconnect.tools` | identical in every `app.json` back through 1.2.0 (22) |
| RevenueCat iOS key | `appl_TdTDZtQ…` | only two commits ever touched `src/config/keys.js`; the key is the same in both |
| RevenueCat Android key | `goog_SQhHNhL…` | same |
| EAS project | `6be503ce-…` | unchanged |
| Pro monthly | `sparkconnect_pro_monthly` | unchanged |
| Pro annual | `sparkconnect_pro_annual` (alias `sparkconnect_pro_yearly`) | renamed once; **both** resolve via `PRODUCT_ALIASES`, so an App Store Connect product under either id still works |
| Lifetime | `sparkconnect_lifetime_tools` | unchanged |
| Answer packs | `sparky_answers_10 / _30 / _100` | unchanged — deliberately kept despite the display rename to "SparkAI Answer Packs" |

Nothing about the store products needs touching. The `appl_`/`goog_` keys are
RevenueCat's PUBLIC SDK keys — they are meant to ship inside the binary and are
not a secret.

## Version

App Store Connect currently shows **1.0 (26)**. The binary here is **1.3.0
(33)**, so this is a new version entry, not an update to the one in review.
`eas.json` sets `autoIncrement: false`, so the build ships exactly the number
in `app.json` — a duplicate would be rejected at submit.

## THE ONE THING THAT MUST CHANGE — promotional text

Live text today:

> Now with Invoice Generator, Job Cam, and Spark AI field reference.
> **Pro: 20 AI answers/day.** Lifetime Tools available one-time.

**Pro is 10 answers a day and 250 a month.** Shipping 1.3.0 against that text
puts a false allowance on the storefront — the same failure the website had
("SparkAI without the daily ceiling"), in the one place App Review reads.

Replace with:

> Now with estimate-to-invoice, a photo job log, and SparkAI — the assistant
> that refuses to guess. Pro: 10 SparkAI answers a day. Lifetime Tools
> available one-time.

Also stale, not false, worth updating: "Job Cam" is inside Projects now, and
the invoice is the last stage of the Material Estimator rather than a separate
generator.

## Check before submitting

- [ ] Promotional text updated to 10/day
- [ ] Description mentions no allowance number that is not 5 free / 10 Pro
- [ ] Screenshots show the current HUD, not build 32's dock
- [ ] `npm run atlas:check` and the full suite pass on the commit being built
- [ ] Contractor Connect confirmed OFF for launch, or ON with the inbox watched

## What is enforced in code

`tests/monetization.test.js` reads `website/index.html` and fails on any
allowance the app does not enforce. **App Store Connect cannot be linted from
here** — nothing in this repo can see that text, so this file is the record and
the checkbox above is the control.
