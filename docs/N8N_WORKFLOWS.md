# n8n Workflows

Specs for the four automations. Each is simple, single-purpose, and testable in
isolation. Import files and wiring live in `growth-os/n8n/` (see its README).

Shared rules:
- Secrets are **credentials in n8n**, never in the JSON. Config nodes hold only
  non-secret settings (sheet ID, model, prices).
- Every workflow ships **inactive**. Activate only after a manual test passes.
- All Sheets writes go to the tab named in `growth-os/sheets/SCHEMA.md`.

---

## 1. Daily SparkConnect Growth Brief
**Trigger:** schedule, 07:00 daily.
**Steps:** read `Daily Metrics`, `Bugs`, `Feedback`, `Content Queue` → compile
yesterday's context → Claude generates `{summary, 3 priorities, 5 hooks}` →
format → POST to approval channel.
**Output:** a short message in your approval channel. No data is changed.
**Test:** run manually with a few seeded rows; confirm the message has exactly
3 priorities and 5 hooks. **Guardrail:** hooks are *ideas*, not posts — nothing publishes.

## 2. Feedback to Backlog
**Trigger:** webhook `POST /sparkconnect-feedback`.
**Input:** `{ "text": "...", "source": "email|form|social", "contact": "optional" }`.
**Steps:** Claude classifies → append to `Feedback` → if `Bug` also append to
`Bugs`, if `Feature Request` also append to `Feature Requests` → if `urgent`
(crash / data-loss / security / legal / safety / payment) send one alert.
**Test:** POST a fake crash report → appears in Feedback + Bugs + one urgent alert.
POST a testimonial → Feedback only, no alert. **Guardrail:** alerts fire *only* on urgent.

> Notion sync (creating a Roadmap page + writing the URL back to `Notion Link`)
> is an optional follow-on node, added once a Notion credential exists. Sheets-first
> keeps v1 lean.

## 3. Content Draft Factory
**Trigger:** manual (or schedule later).
**Steps:** read first `Content Queue` row with Status `Idea` → Claude generates
TikTok script, IG caption, CTA, hook, thumbnail text, hashtags → write back as
Status **Draft Ready** with the draft in Notes + the hook in Hook.
**Test:** add an Idea row, run, confirm row flips to `Draft Ready` and the draft
is populated. **Guardrail (hard):** the workflow can only set `Draft Ready`. It has
no node that posts, schedules, or sets Approved/Published. Approval is a human flipping
the Status in the sheet.

## 4. RevenueCat Webhook
**Trigger:** webhook `POST /sparkconnect-revenuecat` (header-auth shared secret).
**Steps:** normalize RC event → map type → compute MRR delta → SHA-256 hash the
customer id → append to `Revenue` → if a new paid customer, send a milestone alert.
**Test:** use RevenueCat's "Send test event"; confirm a Revenue row with hashed
customer + correct MRR delta. **Guardrail:** read-only toward RevenueCat — it
*logs* events, never creates/modifies subscriptions or charges.

---

## Conventions
- **Idempotency:** Feedback/Revenue append-only; Content Draft Factory updates by
  `ID` (match column) so re-runs don't duplicate rows.
- **Failure mode:** a blank `APPROVAL_WEBHOOK_URL` / `ALERT_WEBHOOK_URL` makes the
  final send a harmless no-op — safe default until you paste a real channel URL.
- **Model:** `claude-opus-4-8` by default; switch the Config `MODEL` field to a
  smaller Claude for cheap high-volume classification.
- **Scaling later (only if needed):** Segment→Sheets daily sync, Notion page
  creation, weekly report generator. Not built yet — don't overbuild.
