# Google Sheets Command Center — Schema

The single source of truth for daily ops. Built by `setup.gs` (one-click).
Every n8n workflow reads/writes these tabs by **tab name + column header**, so
do not rename headers without updating the workflows.

## Tabs

### Dashboard
Read-only summary. All cells are formulas referencing the tabs below. No bot writes here.

### Daily Metrics  *(one row per day; written by Daily Growth Brief + manual)*
`Date · Installs · Active Users · Sparky Messages · Paywalls Shown · Trials Started · Paid Conversions · Cancellations · Net New Paid · Content Published · Bugs Logged · Feedback Count · Notes`

### Content Queue  *(read by Content Draft Factory; status drives the pipeline)*
`ID · Date Added · Topic · Platform · Status · Hook · Angle · Owner · Draft Link · Approved By · Publish Date · Notes`
Status: `Idea → Drafting → Draft Ready → Approved → Scheduled → Published` (or `Killed`).
The Draft Factory only ever writes drafts and sets status to **Draft Ready**. It never sets Approved/Scheduled/Published.

### Creator Leads
`Date · Name · Handle · Platform · Followers · Niche · Contact · Status · Source · Notes`

### Trade School Leads
`Date · School Name · Contact Name · Role · Email · Phone · State · Program Size · Status · Notes`

### Contractor Leads
`Date · Company · Contact Name · Trade · Crew Size · Email · Phone · State · Status · Source · Notes`

### Feedback  *(written by Feedback to Backlog)*
`ID · Date · Source · Raw Text · Category · Sentiment · User Contact · Status · Linked Item · Notes`
Category: `Bug · Feature Request · UX Issue · Testimonial · Pricing Complaint · Content Idea`.

### Bugs  *(written by Feedback to Backlog when Category = Bug)*
`ID · Date · Reported By · Severity · Area · Description · Steps to Reproduce · Status · Priority · Notion Link · Notes`

### Feature Requests  *(written by Feedback to Backlog when Category = Feature Request)*
`ID · Date · Requested By · Title · Description · Votes · Status · Priority · Notion Link · Notes`

### Revenue  *(written by RevenueCat webhook)*
`Date · Event Type · Product ID · Store · Amount (USD) · Currency · Customer (hashed) · MRR Delta · Active Subs · Notes`
Customer IDs are stored **hashed only** — never raw RevenueCat app user IDs or emails.

### Experiments
`ID · Start Date · Name · Hypothesis · Metric · Variant A · Variant B · Status · Result · Decision · Notes`

## Conventions
- **Dates** are real dates (not text) so Dashboard `SUMIFS`/`COUNTIF` ranges work.
- **IDs** are short prefixed strings: `FB-0001`, `BUG-0001`, `FR-0001`, `CQ-0001`, `EXP-0001`.
- Bots append rows only; humans edit Status/Priority/Decision columns.
- One write path per tab (see "written by" above) to avoid duplicate-row races.
