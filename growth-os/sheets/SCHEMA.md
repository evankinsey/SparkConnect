# Google Sheets Command Center — Schema

Source of truth for SparkConnect growth. Built by `setup.gs` (one click).
Workflows read/write by **tab name + column header** — don't rename headers
without updating the workflows.

## Tabs

### Dashboard
Read-only. All cells are formulas over the tabs below. No bot writes here.

### Content Queue  *(read by Content Draft Factory)*
`ID · Day · Theme · Idea · Hook · Platform · Status · Draft Link · Approved By · Scheduled Date · Notes`
Status: `Idea → Drafting → Draft Ready → Approved → Scheduled → Posted` (or `Killed`).
Bots only set **Draft Ready**. Seed it from `content-factory/content-queue-seed.csv`.

### Posted Content  *(human logs after posting)*
`Date Posted · Content ID · Platform · Hook/Title · Link · Views · Likes · Comments · Shares · Saves · Profile Visits · Notes`
One row per platform per post (so a single video posted to 3 platforms = 3 rows).

### Daily Metrics  *(one row/day — the tracking sheet)*
`Date · Views · Profile Visits · Installs · Trials · Paid Subscriptions · Packs · Revenue (USD) · Cancels · Feedback Count · Notes`
Views/Profile Visits from the platforms; Installs/Trials/Paid/Packs/Revenue/Cancels from App Store Connect + RevenueCat.

### Feedback  *(written by Feedback to Backlog)*
`ID · Date · Source · Raw Text · Category · Sentiment · User Contact · Status · Linked Item · Notes`
Category: `Bug · Feature Request · General`.

### Bugs  *(written by Feedback to Backlog when Category = Bug)*
`ID · Date · Reported By · Severity · Area · Description · Steps to Reproduce · Status · Priority · Notes`

### Feature Requests  *(written by Feedback to Backlog when Category = Feature Request)*
`ID · Date · Requested By · Title · Description · Votes · Status · Priority · Notes`

### Creator / Trade School Leads
`Date · Type · Name · Handle/School · Platform · Followers/Size · Contact · Status · Source · Notes`
Type: `Creator · Trade School · Contractor`.

### Revenue Snapshot  *(manual weekly/daily snapshot — RevenueCat automation is parked)*
`Date · MRR (USD) · Active Subscribers · New Trials · Trial Conversions · Pack Sales · Cancels/Refunds · Notes`

### Experiments
`ID · Start Date · Name · Hypothesis · Metric · Variant A · Variant B · Status · Result · Decision · Notes`

## Conventions
- **Dates** are real dates (not text) so Dashboard `SUMIFS`/`COUNTIF` work.
- **IDs:** `CQ-001` (content), `FB-0001` (feedback), `BUG-0001`, `FR-0001`, `EXP-0001`.
- Bots append rows / set Draft Ready; humans own Status, Approved, Posted, Decision.
- One write path per tab to avoid duplicate-row races.

## Pricing facts (provable — used across content)
Pro: 3-day trial → **$7.99/mo or $49.99/yr** (launch special). Sparky packs: 15/$1.99,
50/$4.99, 150/$9.99 (never expire). Free Sparky: 3/day; Pro: 20/day, 400/mo cap.
