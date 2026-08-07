# Deploying sparkconnect.pro V2

## Read this before you touch Vercel

`https://sparkconnect-website.vercel.app/api/ask-nec` is **the live backend for
every SparkConnect build in the App Store.** It is hardcoded at `App.js:626`, and
`/api/transcribe` is derived from it at `App.js:2266`. A shipped build cannot be
pointed somewhere else without an App Store release.

So:

> **Do not deploy this site over the existing `sparkconnect-website` project.**
> If you break or move `/api/`, SparkAI stops working for every paying user until
> Apple approves a new build. That is a multi-day outage caused by a marketing
> change.

---

## Why this path cannot take SparkAI down

The app calls `sparkconnect-website.vercel.app` — **the `*.vercel.app` URL, not
the custom domain.** So moving `sparkconnect.pro` to a different project does not
touch what the app talks to. That is the entire safety argument, and it is why
this is the path rather than deploying over the existing project.

The one rule that keeps it true: **never deploy anything to the
`sparkconnect-website` project.** Leave it running exactly as it is.

---

## The safe path

Run the verifier at every step. It lives next to this file.

```
cd website
./verify-api.sh                 # baseline, BEFORE you touch anything
```

Green means SparkAI is up right now. Write down that it passed — that is the
thing you compare against later.

1. **Create a NEW Vercel project.** Call it `sparkconnect-site`.
   - Root directory: `website`
   - Framework Preset: **Other**
   - Build command: **none** (leave empty)
   - Output directory: **leave empty** — `vercel.json` sets it
   There is no build step. It is static HTML with inline CSS and JS.

2. **Deploy to preview.** Open the preview URL and click through the page.

3. **Confirm the API is still fine.** Nothing you did should have touched it,
   and this proves it:
   ```
   ./verify-api.sh
   ```

4. **Move the domain.** Vercel → `sparkconnect-website` → Settings → Domains →
   remove `sparkconnect.pro`. Then `sparkconnect-site` → Domains → add it.
   DNS is already pointed at Vercel, so this is a reassignment, not a DNS change.

5. **Verify both.**
   ```
   ./verify-api.sh                                    # the app's backend
   curl -sI https://sparkconnect.pro | head -1        # the new site
   ```

6. **Leave `sparkconnect-website` running, untouched, forever.** It has no custom
   domain now and it does not need one. It serves `*.vercel.app/api/*`, which is
   what every shipped build calls.

---

## Rollback

If step 5 fails, you have about a minute of work:

1. Vercel → `sparkconnect-site` → Domains → remove `sparkconnect.pro`
2. Vercel → `sparkconnect-website` → Domains → add it back
3. `./verify-api.sh`

If the API itself is failing — which should be impossible on this path, since
you never deployed to that project — restore its last good deployment:
Deployments → the one live before today → **Promote to Production**.

---

## I could not run the baseline for you

The sandbox this was built in blocks outbound requests to that host — a proxy
403 on CONNECT, while other hosts resolve fine. So **the API has not been
verified from here.** Everything above is written from the code
(`App.js:626`, `App.js:2266`), not from a live check.

Run `./verify-api.sh` yourself before you start. If it fails on the very first
run, that is information about your connection or about a problem that already
exists — not something the deploy caused.

---

## If you must use one project

Only if you're consolidating deliberately. Then the API files have to come
across with the site:

- Copy the existing `api/` directory into this folder before deploying.
- Keep the exact paths: `/api/ask-nec` and `/api/transcribe`.
- Deploy to a **preview** URL first and curl both endpoints there.
- Promote to production only after both answer.

Do not rename, restructure, or "tidy" anything under `/api/`.

---

## Files

```
website/
  index.html                        the site — self-contained, no build step
  tools/
    conduit-fill-calculator.html    first SEO page, working calculator
  DEPLOY.md                         this file
```

Everything is inline: no external fonts, no CDN scripts, no image requests. That
is deliberate — it's what makes the page fast, and it means the site cannot break
because a third party went down.

---

## What is deliberately NOT on the site

These were left off because they are not true yet. Adding any of them means
making it true first.

| Not published | Why |
|---|---|
| Download counts, App Store rating | We don't have figures worth publishing. The proof strip uses real product numbers instead — tools, scenarios, citations, tables verified. Add rating and installs when they're real; don't invent them. |
| A per-feature pricing comparison table | Three items in `PRICING_DISCREPANCIES` are still OPEN — the shipped paywall and the shipped gates disagree about calculators and about what Lifetime includes. Publishing a table that contradicts the app is worse than publishing none. The site states prices and describes who each tier is for, which is true today. |
| Contractor search, nearby contractors | Not built. The FAQ says so explicitly. |
| Exact free-tier limits ("3 answers/day") | Same discrepancy problem. The app shows the number; the site doesn't quote it. |

The banned words from the app's own content tests apply here too: no "code
compliant", "certified", "approved", "guaranteed". A test in the app enforces
that; on the site it's on you.

---

## SEO build-out

`/tools/conduit-fill-calculator` is the template. The pattern that makes these
work:

1. **Answer the question fully on the page.** No email wall, no "download to see
   the result". A page that withholds the answer reads as a trick and ranks like
   one.
2. **Say what's verified.** The conduit fill page can state its count is checked
   against print because Annex C Table C.1 genuinely is. Don't put that badge on
   a page resting on an unverified table — check the register in
   `src/core/verification.js` first.
3. **One question per page**, matching how people actually type it.

The index on the home page lists the planned pages with `aria-disabled` on the
ones that don't exist. Remove the attribute and the `SOON` tag as each ships — a
dead link from the index is worse than a missing one.

Priority order, by intent and competition:

1. `/tools/voltage-drop-calculator`
2. `/tools/box-fill-calculator`
3. `/tools/wire-color-chart`
4. `/guides/three-way-switch`
5. `/guides/multiwire-branch-circuit`

The permit and licensing pages are the highest-volume, lowest-competition
opportunity, and the content already exists in `src/core/connect/pathways.js`
carrying the right "confirm with your board" framing. They need the jurisdiction
research done first.

---

## Performance

Targets are already met by construction: single document, no external requests,
system font stack, no layout-shifting images. Two things to keep true:

- If you add images, set explicit `width`/`height` and use `loading="lazy"`
  below the fold.
- Don't add a font CDN. The type pairing is system sans + system mono on purpose.
