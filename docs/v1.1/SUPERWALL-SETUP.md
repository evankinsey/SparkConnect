# Superwall — setup, and a spec you can paste into their AI builder

Their editor is fiddly. You don't have to fight it: below is a written spec you
can paste straight into **Superwall's AI paywall generator**, plus the exact
placement names and the fallback that already ships in the app.

**Do this last.** Nothing here blocks anything — the in-app paywall
(`src/SparkPaywall.js`) is now good enough to ship on its own, and Superwall only
adds remote editing and A/B testing on top.

---

## What already works without Superwall

`src/SparkPaywall.js` was rewritten this pass. It now:

- Lets you actually **select** a plan (they were decorative `View`s before)
- Charges what the button says (it previously highlighted Annual and bought Monthly)
- Computes "SAVE 48%" from the real prices instead of hardcoding a string
- Shows Lifetime as a secondary option instead of a competing card
- Has **Restore Purchases**, which App Review requires
- Shows price *before* the feature list
- Carries per-placement headlines — twelve of them, so the paywall names the
  thing the user just reached for

So if Superwall stays sloppy, you are not stuck.

---

## Step 1 — Account and keys (5 min)

1. **superwall.com** → sign in → create app **SparkConnect**
2. **Settings → Keys** — one key per platform, both start `pk_`
3. Paste into `src/config/keys.js`:
   ```js
   export const SUPERWALL_IOS_KEY = 'pk_xxx';
   export const SUPERWALL_ANDROID_KEY = 'pk_xxx';
   ```
4. `npx expo install @superwall/react-native-superwall`
5. `npm run config:check` should go clean

## Step 2 — Create the placements

**Placements** (sometimes "events") is where you create these. Names must match
`src/core/paywall/config.js` **exactly** — a typo silently shows nothing.

```
simulation_locked            troubleshooting_locked
challenge_mode_locked        ai_simulation_explanation
progress_history_locked      custom_practice_locked
ai_limit_reached             calculator_limit_reached
export_limit_reached         job_cam_limit_reached
settings_upgrade             onboarding_complete
```

The first six are the ones your brief specified. The rest are the moments in the
app where a Free user actually hits a wall.

## Step 3 — Products

Add these three, matching App Store Connect exactly:

| Superwall product | Identifier | Price |
|---|---|---|
| Pro Annual | `sparkconnect_pro_annual` | $49.99/yr, 3-day trial |
| Pro Monthly | `sparkconnect_pro_monthly` | $7.99/mo, 3-day trial |
| Lifetime Tools | `sparkconnect_lifetime_tools` | $29.99 one-time |

---

## Step 4 — The paywall spec

Paste this into Superwall's AI generator, or use it as your build checklist.

> **Design a mobile paywall for SparkConnect, an app for electricians.**
>
> **Tone:** direct, professional, trade-focused. Users are working electricians,
> often outdoors with gloves on. No fluff, no exclamation marks, no growth-hack
> copy. Assume they are busy and slightly sceptical.
>
> **Colours**
> - Background `#0B0B12`, cards `#15151F`
> - Primary accent (buttons, selected state, badges) safety orange `#F97316`
> - Selected card background `#1E1608`, selected border `#F97316`
> - Body text `#FFFFFF`, secondary `#9CA3AF`, muted `#6B7280`
> - Success ticks green `#22C55E`
> - Borders `#26263A`
>
> **Type:** system font. Headline 27px/800. Body 14px. Legal 10.5px.
>
> **Layout, top to bottom — this order matters:**
> 1. Small close X, top right, 20px, muted
> 2. Eyebrow: uppercase, orange, 12px/800, letter-spacing 0.8 — *dynamic per placement*
> 3. Headline: 27px/800, centred, max two lines — *dynamic per placement*
> 4. Sub-headline: 14px, secondary, centred, max two lines — *dynamic per placement*
> 5. **Two plan cards, side by side, tappable, radio-selected.** Annual selected
>    by default and carrying a floating "SAVE 48%" badge on its top-right corner.
>    Each card: radio circle + label, then large price (25px/800), then a small
>    line reading "per year · $4.17/mo" or "per month".
> 6. **Primary CTA**, full width, orange, 15px radius, min height 58:
>    title "Start 3-Day Free Trial" (16.5px/800) and beneath it in 11.5px at 80%
>    opacity "Then $49.99/year · Cancel any time".
>    **The sub-line must change when the user selects Monthly.**
> 7. Five benefit rows: green tick + bold title + muted sub-line
>    - 20 Spark AI answers a day — Knows the calculator you are in
>    - Every calculator, unlimited — No daily cap
>    - Wiring & troubleshooting lab — Interactive, not videos
>    - Unlimited Job Cam and exports — Your branding on invoices
>    - Saved history across every tool — Pick up where you left off
> 8. Text link, centred, secondary: "View full comparison ›"
> 9. **Secondary** Lifetime row — a low-contrast card, clearly less prominent than
>    the plan cards: "Not ready to subscribe?" / "Lifetime Tools · $29.99 once ·
>    core calculators forever" with a chevron. It must not compete visually with
>    the subscription.
> 10. Text button, secondary, no fill: "Continue with Free"
> 11. Underlined text link: "Restore Purchases"
> 12. Legal, 10.5px, muted, centred: "3-day free trial, then $49.99 per year.
>     Renews automatically until cancelled. Cancel any time in your App Store
>     account settings, at least 24 hours before the trial ends to avoid being
>     charged."
>
> **Hard requirements**
> - Both plan cards must be genuinely selectable and the CTA must reflect the selection
> - No preselected checkbox tricks, no fake countdown, no dark patterns
> - Restore Purchases must be visible without scrolling to the very bottom if possible
> - Everything must fit a 375×667 screen with scrolling, and stay legible at 200% text size
> - Minimum tap target 44×44

### Per-placement copy

Paste these into each placement's variables so the top three lines change with
context. They are the same strings as `PLACEMENT_COPY` in the code, so the
Superwall paywall and the fallback read identically.

| Placement | Eyebrow | Headline | Sub |
|---|---|---|---|
| `simulation_locked` | WIRING LAB | Keep going in the Wiring Lab | You finished the free lesson. Pro unlocks every wiring and troubleshooting lesson. |
| `troubleshooting_locked` | TROUBLESHOOTING | Diagnose the whole catalog | Real service-call scenarios with the fault derived from a real circuit. |
| `challenge_mode_locked` | CHALLENGE MODE | Beat the clock | Timed challenges, par times, and a score worth sharing. |
| `ai_simulation_explanation` | SPARK AI | Find out why that circuit failed | Spark AI explains the fault, what to inspect, and the mistake most people make. |
| `progress_history_locked` | PROGRESS | See how far you have come | Full attempt history, weak areas, and scores over time. |
| `custom_practice_locked` | CUSTOM PRACTICE | Practise exactly what you keep missing | Build your own sets from the topics you get wrong. |
| `ai_limit_reached` | SPARK AI | Out of answers for today | Pro gives you 20 answers a day, with your calculator and job already in context. |
| `calculator_limit_reached` | CALCULATORS | Unlimited calculations | Every calculator, no daily cap, results saved to the job. |
| `export_limit_reached` | DOCUMENTS | Send as many invoices as you need | Unlimited PDF exports, and your branding instead of ours. |
| `job_cam_limit_reached` | JOB CAM | Document every job | Unlimited projects, folders, tags and before/after records. |
| `settings_upgrade` | SPARKCONNECT PRO | The complete field workflow | Calculate, ask Spark AI, save it to the job, and turn it into paperwork that gets you paid. |
| `onboarding_complete` | NICE WORK | That is one of about forty tools | Pro opens the rest, plus the Wiring Lab and unlimited Spark AI. |

---

## Step 5 — Experiments

Four variants are defined in `src/core/paywall/config.js`. Assignment is a stable
hash of the anonymous id, so a user always sees the same one.

| Variant | What it tests |
|---|---|
| `A_CURRENT` | Today's freemium limits — the control |
| `B_FIRST_WIN` | Paywall only after one meaningful completed action |
| `C_TRAINING` | Foundational lesson free, full catalog paid, no Lifetime shown |
| `D_TRIAL_FORWARD` | Trial-led messaging |

**Run A against one challenger at a time.** Four-way splits at your traffic level
will take months to reach significance and you will be tempted to call it early.

---

## What I'd actually check first

Before touching Superwall, look at what the numbers say. Analytics has **never
fired** — `@segment/analytics-react-native` isn't installed, so every event in
`src/analytics.js` is a no-op today. All fourteen paywall events are written and
tested; they just have nowhere to go.

Installing a provider is a one-line change and no call sites move. Without it,
any A/B test you run is unmeasurable, which makes Superwall an expensive way to
change a screen you can already edit in code.

Order I'd suggest: **analytics provider → ship the new in-app paywall → read two
weeks of funnel data → then Superwall**, with a real baseline to beat.
