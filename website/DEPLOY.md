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

## The safe path — no terminal required

Everything below is done in a browser. It works on a phone. There is no CLI
step, because the site is already committed to GitHub and Vercel can deploy
straight from the repo.

### 1. Import the repo as a NEW project

vercel.com → **Add New… → Project** → import `evankinsey/SparkConnect`.

Then, before you click Deploy:

| Setting | Value |
|---|---|
| Project Name | `sparkconnect-site` |
| Framework Preset | **Other** |
| Root Directory | `website` &nbsp;← **this is the important one** |
| Build Command | leave empty |
| Output Directory | leave empty (`vercel.json` handles it) |
| Install Command | leave empty |

Root Directory `website` is what makes this safe *and* what makes it work:
Vercel only ever looks inside that folder, so it cannot see the app source and
cannot accidentally build anything.

### 2. Point it at the right branch

The site lives on `claude/daily-code-question-home-rh6cip`, not on `main` —
`main` is still the old 1.0 code.

Project → **Settings → Git → Production Branch** → set it to
`claude/daily-code-question-home-rh6cip` → Save → **Deployments → Redeploy**.

*(If you merge that branch to `main` later, change this back to `main` and
redeploy. Nothing else moves.)*

### 3. Look at it

Open the `*.vercel.app` URL Vercel gives you. Click every nav and footer link —
they all resolve, there are no placeholder 404s. Check it on your phone.

### 4. Move the domain

- `sparkconnect-website` → Settings → Domains → remove `sparkconnect.pro`
- `sparkconnect-site` → Settings → Domains → add `sparkconnect.pro`

DNS already points at Vercel, so this is a reassignment between projects, not a
DNS change. It takes effect in seconds, not hours.

### 5. Check both

Open in a browser:

- `https://sparkconnect.pro` → the new site
- `https://sparkconnect-website.vercel.app/api/ask-nec` → **must not be a 404.**
  A blank page, an error object, or "Method Not Allowed" are all fine — they
  mean the function is still deployed. 404 is the only bad answer.

When you have a working terminal again, `./verify-api.sh` does this properly,
including POSTing a real question.

### 6. Never deploy to `sparkconnect-website` again

It has no custom domain now and does not need one. It serves
`*.vercel.app/api/*`, which is what every shipped build calls.

---

## Rollback

If step 5 fails, you have about a minute of work, all in the browser:

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
  privacy.html                      linked FROM INSIDE THE APP — must exist
  terms.html                        linked FROM INSIDE THE APP — must exist
  whats-new.html                    release notes
  tools/
    index.html                      calculator index
    conduit-fill-calculator.html    first SEO page, working calculator
  vercel.json                       no build step, security headers
  verify-api.sh                     the check to run at every step
  DEPLOY.md                         this file
```

**privacy.html and terms.html are not optional.** The app's own onboarding
checkboxes link to `sparkconnect.pro/terms` and `sparkconnect.pro/privacy`
(`src/OnboardingFlow.js`). If the domain moves to a site without them, the
legal links inside the shipping app 404.

They were written from what the code actually does — two outbound calls, a
locally generated random device id, everything else on the device. Read them
before you publish, and if you already have policy text that App Store review
has seen, use that instead.

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
