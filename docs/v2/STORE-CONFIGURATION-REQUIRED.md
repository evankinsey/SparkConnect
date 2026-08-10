# STORE CONFIGURATION REQUIRED

Nothing in this document has been created. The code for Spark Credits exists,
is tested, and is switched **off** (`CREDITS_ENABLED = false` in
`src/core/paywall/registry.js`). It stays off until the products below exist and
have been seen to load on a device.

---

## Read this first: the live build

**iOS 1.0 (26) is Ready for Distribution and its purchases work.** That build
sells through `components/PaywallScreen.js`, which does two things and only two:

| What | How |
|---|---|
| Subscriptions | `getOfferings()` → `current.availablePackages` → `purchasePackage()` |
| Consumables | `getProducts(['sparky_answers_10','sparky_answers_30','sparky_answers_100'])` |

It **never** passes a subscription identifier to `getProducts`. The branch did,
including `sparkconnect_pro_annual`, which does not exist. That is now fixed and
a test holds it — but it is also the reason nothing below should be "tidied up"
by renaming a live product.

---

## 1. Products that must keep existing, untouched

Do not rename, delete, or stop offering these. Old receipts reference them
forever, and restoring a purchase against a deleted identifier fails silently.

| Identifier | Type | Grants | Status |
|---|---|---|---|
| `sparky_answers_10` | Consumable | **15** answers → 15 credits | Live, keep |
| `sparky_answers_30` | Consumable | **50** answers → 50 credits | Live, keep |
| `sparky_answers_100` | Consumable | **150** answers → 150 credits | Live, keep |
| `sparkconnect_pro_monthly` | Auto-renewable | Pro | Live, keep |
| *(annual — see §3)* | Auto-renewable | Pro | **Verify the identifier** |

> **The names lie.** `sparky_answers_10` grants fifteen. The migration reads the
> table in `credits.js`, never the identifier. A "cleanup" that renamed these to
> match their counts would silently change what past buyers own.

---

## 2. New products to create — Spark Credits

**App Store Connect → Monetization → In-App Purchases → Consumable**

| Identifier | Display name | Price tier | Description |
|---|---|---|---|
| `spark_credits_25` | 25 Spark Credits | $1.99 | Credits for extra AI answers and generated training. Never expire. |
| `spark_credits_75` | 75 Spark Credits | $4.99 | Credits for extra AI answers and generated training. Never expire. |
| `spark_credits_200` | 200 Spark Credits | $9.99 | Credits for extra AI answers and generated training. Never expire. |

Hold `spark_credits_500` ($19.99) until there is purchasing behaviour to price
against. Launching four tiers before knowing which three matter just splits the
data.

**Google Play → Monetization → Products → In-app products** — same identifiers,
same prices.

**RevenueCat**
- Add all three as **Products**.
- Create an Offering `credits` with three Packages, one per product.
- **Do NOT attach any of them to the `pro` entitlement.** Consumables behave
  differently from subscriptions, and a credit pack that grants `pro` would give
  a $1.99 buyer the whole subscription.
- Leave the existing `default` Offering exactly as it is. That is what the live
  build reads.

---

## 3. One thing to verify before anything else

`sparkconnect_pro_annual` does not appear to exist in App Store Connect, and
`sparkconnect_lifetime_tools` has never been confirmed to. The app carries
aliases for both, so whichever identifier is real will resolve — but somebody
has to look.

Open App Store Connect → In-App Purchases and write down the **exact**
identifier of:

1. the annual subscription
2. the Lifetime Tools product, if it exists at all

Then check them against `PRODUCT_ALIASES` in `src/core/paywall/config.js`. If the
real identifier is not in the alias list, add it there — do not rename the
product in App Store Connect.

If Lifetime Tools does not exist, say so and it comes off the paywall. Showing a
plan nobody can buy is the bug that started all of this.

---

## 4. Pricing, unchanged

Spark Credits do not touch the subscription. Pro stays the hero product.

| | Price | Notes |
|---|---|---|
| Pro monthly | $7.99 | unchanged |
| Pro annual | $49.99 | unchanged, 3-day trial |
| Lifetime Tools | $29.99 | unchanged, pending §3 |

Credits are overflow and premium generation. Nothing that Free, Pro or Lifetime
already includes is ever charged for — `NEVER_CHARGED` in `credits.js` names
them and a test fails if any of them is given a price.

---

## 5. What happens on the device, once switched on

1. **Migration runs once.** Every previously purchased answer becomes one Spark
   Credit, minimum. A user with 227 answers has ≥227 credits. The migration is
   idempotent; running it five times still leaves 227.
2. **Included allowance is spent first, always.** A user cannot burn a purchased
   credit while a free or Pro use remains. Enforced in `spend()`, not left to
   each screen.
3. **Purchased credits never expire** and survive Pro lapsing, because they were
   sold as owned rather than rented. `expiresAt` is stripped from any purchased
   grant on the way in.
4. **A retried purchase callback grants once.** Idempotency key required; there
   is no path that grants without one.

---

## 6. The release order

Do **not** ship the store products and the app change together.

1. Create the products. Wait for them to reach *Ready to Submit*.
2. Ship a build with `CREDITS_ENABLED` still false. Nothing changes for anyone.
3. Verify on a real device that `getProducts(['spark_credits_25', …])` returns
   all three. The Product Health screen shows this.
4. Only then flip `CREDITS_ENABLED` — which is a remote-config change, not a
   release.

Step 3 is the one that cannot be skipped. It is exactly the check that would
have caught the missing annual identifier before a TestFlight build shipped with
a paywall that could not sell anything.

---

## 7. Still open

- [ ] Confirm the real annual subscription identifier (§3)
- [ ] Confirm whether `sparkconnect_lifetime_tools` exists (§3)
- [ ] Resolve the three items in `PRICING_DISCREPANCIES` — the shipped paywall
      and the shipped gates disagree about calculators and about what Lifetime
      includes. Publishing a credits wallet on top of that disagreement makes it
      harder to fix, not easier.

---

# Build 33: "Subscriptions are temporarily unavailable"

Both prices rendered, both plans refused to sell. Two independent faults, one
in the app and one in the dashboard.

## What the app was doing wrong — fixed in build 36

`purchaseProduct` tries the current Offering first and falls back to buying by
identifier. The fallback could never work: it asked `getProducts` for
`ONE_TIME_PRODUCT_IDS`, which deliberately contains no subscriptions, under the
`NON_SUBSCRIPTION` category, which excludes them again. So it returned nothing
every time and the app reported the Offering as broken.

That turned an empty Offering into a total loss of subscription revenue with no
way back, when surviving exactly that is what the fallback is for. It now asks
for the subscription identifiers under the subscription category.

**The prices on the paywall proved nothing.** `priceCents` is hardcoded in
`src/core/paywall/config.js`, so $49.99 and $7.99 render whether or not the
store has ever heard of those products. Worth fixing separately — a non-US
buyer is currently shown a US price — but it is not why the purchase failed.

## What still needs fixing in the dashboard

The diagnosis was `OFFERING_EMPTY`: the packs loaded, so the store connection,
the bundle identifier and the Paid Applications agreement are all fine. What is
empty is the **current Offering in RevenueCat**.

RevenueCat dashboard → the SparkConnect project → **Offerings**:

1. There must be an Offering marked **Current**. If none is, nothing else here
   matters — `offerings.current` is null and every package lookup fails.
2. That Offering needs two **Packages**: Annual and Monthly.
3. Each package must be attached to a **Product** that maps to the App Store
   Connect subscription — `sparkconnect_pro_yearly` (or `sparkconnect_pro_annual`;
   both resolve through `PRODUCT_ALIASES`) and `sparkconnect_pro_monthly`.
4. The products must be in the **`pro` entitlement**, or a completed purchase
   will not flip `isPro` and the buyer pays for nothing.

No build is required for any of it — the app reads the Offering at runtime.

## Verify

On a device, with a sandbox tester signed in:

1. Open the paywall. The warning banner should be gone.
2. Tap the annual plan. A real StoreKit sheet should appear.
3. Complete it. Pro unlocks and the SparkAI allowance moves to 10 a day.
4. Force-quit, reopen, confirm Pro survives. Then Restore Purchases on the same
   account and confirm it comes back.

If step 2 still fails, read the message rather than guessing — the causes are
distinct sentences on purpose. "This plan is not available from the App Store"
means the identifier does not exist or is not approved in App Store Connect,
which is a different fix from an empty Offering.
