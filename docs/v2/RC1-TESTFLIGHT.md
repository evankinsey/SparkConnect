# RC1 → TestFlight

**v1.3.0, iOS build 28**, from branch `claude/daily-code-question-home-rh6cip`.

> `autoIncrement` is OFF on the production profile and `ios.buildNumber` is
> pinned to `28`. EAS will upload exactly 28 — it will not quietly become 29.
> If App Store Connect rejects it as a duplicate, something already used 28;
> bump app.json to 29 and rebuild rather than turning autoIncrement back on.

Roughly **20 minutes of typing, 30–60 minutes of waiting.**

---

## Before you build

Everything here is already true — run them to confirm, not to fix.

```bash
npm test                    # 983 passing
npm run config:check        # 4 DEGRADED, all expected (see below)
node scripts/validate-content.mjs   # 75/75
npm run health              # the dashboard, before you tag
npm run rc:report           # access matrix + verification state
```

The four DEGRADED lines are Superwall iOS, Superwall Android, and the backend
URL twice. None of them block a build:

- **Superwall missing** → the app falls back to its own paywall, which is the
  one in the screenshots and the one taking money today.
- **Backend URL missing** → SparkAI's deterministic tools (every calculator
  answer) still work. Model-written answers cannot reach a server. If you want
  those live in this build, the backend has to be deployed first.

---

## Build and submit

```bash
# 1. Log in (once per machine)
eas login
eas whoami

# 2. Make sure the branch is what you think it is
git status
git log --oneline -1

# 3. Build. buildNumber is pinned to 28 in app.json; autoIncrement is off.
eas build --platform ios --profile production

# 4. Submit to App Store Connect. ascAppId 6777511635 is already in eas.json.
eas submit --platform ios --latest
```

`eas build` will ask about credentials the first time. Let EAS manage them
unless you have a reason not to.

If you would rather submit a specific build than the newest:

```bash
eas build:list --platform ios --limit 5
eas submit --platform ios --id <build-id>
```

**Android**, when you want it — the RevenueCat Android key is now set, where the
live build had it empty:

```bash
eas build --platform android --profile production
```

---

## Once it lands in TestFlight

Processing takes 10–30 minutes after submit. Then:

### Test purchases first. Nothing else matters if these are broken.

A product-identifier bug was fixed on this branch — the annual plan was asking
the store for `sparkconnect_pro_annual`, and the product that exists is
`sparkconnect_pro_yearly`. The offerings path masked it; the direct fallback did
not.

Use a **sandbox Apple ID**, not your real one.

- [ ] **Pro Monthly $7.99** — buys, unlocks, survives a force-quit
- [ ] **Pro Annual $49.99** — this is the one that was broken. Buy it.
- [ ] **Answer packs** ($1.99 / $4.99 / $9.99) — consumables, buy the same one twice
- [ ] **Restore Purchases** on a second device
- [ ] **Lifetime Tools $29.99** — see the warning below

> ⚠️ **`sparkconnect_lifetime_tools` has never been referenced by a shipping
> build.** There is no evidence it exists in App Store Connect. If the button
> does nothing, that is why — create the product, or hide the tier for now.

### Then the new surfaces

- [ ] **Projects → Job** — customer, address, and the section list render
- [ ] **Projects → Timeline** — stages, year grouping, share as text
- [ ] **Projects → Daily log** — add crew hours, force-quit, reopen, still there
- [ ] **Projects → Export** — switch audience; confirm the GC copy shows **no
      money at all** and the customer copy shows **no crew names or rates**
- [ ] **Panel Schedule** — build a shared-neutral circuit on positions 1 and 5,
      confirm the CRITICAL finding appears
- [ ] **Material list** — an existing list must still be there after upgrading

### Migration — the thing most likely to hurt a real user

An existing install has a material list and a panel saved in the old
single-record format. On first launch they become the *unfiled* record.

- [ ] Open Materials on a device that already had a list. **It is still there.**
- [ ] Same for Panel Schedule.
- [ ] Job Cam photos still appear under Projects.

If any of those are empty on a device that had data, **stop and do not
promote.** Nothing else on this list is as important.

---

## What is still true about this build

`npm run health` prints this. The short version:

| | |
|---|---|
| NEC tables checked against the printed 2023 book | **4 of 12** |
| Still unchecked | conduit fill, ampacity, 250.66, 250.122, Annex C, citations |
| Release override | **ACTIVE** — shipping on unverified tables, on record |
| Spark Credits | off |
| Contractor Connect | beta, no matching, no listings |
| Backend | not deployed |

Every answer built on an unchecked table still says so, in the app, to the user.
That is the deal the override was accepted under.

---

## Open decisions that are not code problems

In `src/core/paywall/entitlements.js` → `PRICING_DISCREPANCIES`. All three are
pricing calls:

1. The paywall sells **Box & Conduit Fill** and **Advanced calculators** as Pro.
   The app gives them away. Someone upgrading for conduit fill finds it was
   never locked.
2. **Lifetime Tools** is advertised at 5 SparkAI answers a day. The code gives
   Lifetime an unmetered path — a $29.99 one-time purchase including the
   headline feature of a $7.99/month subscription.
3. **Job Cam** — the paywall counts projects, the gate counts photos.

None of these harm a customer today. All three cost money or trust eventually.

---

## If the build fails

```bash
eas build:list --platform ios --limit 3     # find it
eas build:view <build-id>                   # read the log
```

Most likely causes, in order: expired Apple credentials (`eas credentials`), a
native module needing a config plugin, or the bundle failing on something the
Node tests do not exercise. `npx expo-doctor` catches the third before you burn
a build slot.
