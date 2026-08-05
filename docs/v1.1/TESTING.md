# Can you test this build?

Yes. Here is exactly what is real, what is not, and how to run it.

**Verified in this session** (not claimed — actually run):

```
npm test                                    224 passing, 0 failing
npx expo export --platform ios              907 modules, 2.85 MB, exit 0
npx expo export --platform android          907 modules, 2.86 MB, exit 0
npm run config:check                        clean on both platforms
expo-notifications                          0.32.17 installed, matches SDK 54
```

The bundle succeeding is the meaningful one: it proves every import resolves and
the app will boot. It does **not** prove any screen looks right — no simulator or
device ran here.

---

## Run it

```bash
git checkout claude/daily-code-question-home-rh6cip
npm install
npx expo start
```

Press `i` for the iOS simulator or `a` for Android, or scan the QR with Expo Go.

### One thing Expo Go cannot do

**Daily notifications will not fire in Expo Go.** Expo removed Android
notification support in SDK 53. To test them you need a development build:

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform ios     # or android
```

Everything else works in Expo Go.

---

## What you can actually test right now

| Area | What changed | How to check |
|---|---|---|
| **Splash** | Removed the hardcoded `v1.0 · NEC 2023` | Launch — no stale version label |
| **Home — Daily Question** | Header was blank, now reads "Daily Code Question" | Look at the card header |
| **Home — reminder card** | Was "Get your ␣ reminder"; now reads properly and shows the real time | Fresh install, look below the question |
| **Settings labels** | Row was " Alert" and another was empty | Settings → App Settings |
| **Settings — Reminder Time** | New row, cycles 5:30–8:00 AM | Tap it repeatedly |
| **Notification toggle** | Defaulted ON while nothing was scheduled; now reflects reality | Toggle off and on |
| **Question bank** | 8 → 30 questions, so it no longer repeats weekly | Change device date, reopen |
| **Daily notification** | Was completely broken (6 separate faults) | Needs a dev build; set reminder to 2 minutes out |
| **Android entitlements** | Key was empty — every Android user read as Free | `npm run config:check` |

Also worth doing:

```bash
npm run lessons:review                       # 5 lessons, all APPROVED_INTERNAL
npm run lessons:review -- four-way-three-location   # topology, truth table, hints
npm run config:check                         # key status per platform
```

---

## What you cannot test, and why

This is the part that matters, so read it before you go looking.

**Most of what was built has no screen yet.** These are tested, working libraries
with no UI connected to them:

- Wiring Lab (circuit engine, 5 lessons)
- Troubleshooting Mode (6 scenarios)
- Daily Field Challenge (7 rotating formats)
- Flashcards, Job Cam 2.0, tool/warranty/maintenance tracking
- Material lists, community and jobs models
- Migrations, search, achievements
- **The new paywall**

You will open the app and see the app you already had, plus the fixes in the
table above. You will not see a Wiring Lab tab, because there isn't one.

### Three things I found while verifying this

**1. `SparkPaywall` is imported but never rendered.** `App.js` line 3 imports it,
and nothing uses it. So the paywall rewrite — selectable plans, correct CTA,
Restore Purchases — is not reachable in the running app. Same for
`OnboardingFlow` (line 4) and `useGating` (line 5): imported, never used.

**2. `analytics` is imported and never called.** Zero call sites, and the
provider package isn't installed either. Nothing has ever been measured.

**3. `IS_PRO = false` is still hardcoded** at `App.js:552`. Your Android key now
works and RevenueCat can finally resolve an entitlement — and that line throws
the answer away. Any purchase still unlocks nothing.

None of these are new breakage. They were true before this work started; they are
just now visible because someone went looking.

---

## Is it safe to ship?

**Yes, as a bug-fix release.** Everything added is either additive (new modules
nothing imports yet) or a straight fix to something already broken. Both
platforms bundle. No entitlement logic changed. No data migration runs.

**No, if you expect users to see new features.** They will see a working daily
notification and some repaired labels. That is a real improvement over a reminder
that never fired — but it is not the v1.1 in the brief.

### Suggested release note for this build

> Fixed the daily code question notification, which was not firing at all.
> Expanded the question bank from 8 to 30. Added a reminder time setting.
> Repaired several blank labels and removed the stale version badge from the
> splash screen.

---

## What I would do next, in order

1. **Wire `IS_PRO`** to the real RevenueCat entitlement — 2–3 days. Until this
   lands, every other monetisation change is theoretical.
2. **Render the new paywall** — it is written and tested, it needs a call site.
3. **Install an analytics provider** — one line, no call-site changes, and
   nothing else can be evaluated without it.
4. **Build the Wiring Lab screen** on the finished engine — the first feature
   users will actually notice.

Items 1–3 are about two days together and turn this from "fixes" into "a release
that earns money and tells you what happened".
