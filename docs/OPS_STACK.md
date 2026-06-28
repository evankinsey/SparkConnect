# SparkConnect Growth OS — Ops Stack

A lean operating system for running SparkConnect growth: one command center
(Sheets), one planning layer (Notion), four automations (n8n), and the app's
own billing/analytics signals (RevenueCat, Superwall, Firebase, an AI model API).

## The stack at a glance

| Layer | Tool | Role | Source of truth for |
|---|---|---|---|
| Command center | **Google Sheets** | Daily numbers + queues | Metrics, leads, feedback, bugs, revenue, experiments |
| Planning | **Notion** | Narrative + roadmap | Roadmap, launch checklist, SOPs, content archive, weekly reports |
| Automation | **n8n** | Glue + AI tasks | Daily brief, feedback routing, content drafts, revenue logging |
| Billing | **RevenueCat** | Subscriptions + packs | Paid users, MRR, renewals, cancellations (app: `pro` entitlement) |
| Paywall | **Superwall** | Paywall presentation + A/B | Paywall variants, conversion experiments |
| App data | **Firebase** | App backend / events | Auth, app state, raw event stream |
| Intelligence | **AI model API (Claude)** | Summaries, classification, drafts | Brief, feedback categories, content drafts |

> **App facts (from the repo):** RevenueCat products `sparkconnect_pro_monthly`,
> `sparkconnect_pro_yearly`, entitlement `pro`, plus message/chat packs. Sparky AI
> limits: Free 3/day, Pro 20/day, 400/month. Analytics via Segment (see
> `ANALYTICS_EVENTS.md`).

## Data flow

```
   App (Firebase, Superwall, Segment)
        │  installs, events, paywalls
        ▼
   RevenueCat ──webhook──► n8n ──► Sheets [Revenue] ──► Dashboard
                                    ▲
 Support / forms / social ─webhook─►│ n8n (Feedback to Backlog)
                                    ├─► Sheets [Feedback/Bugs/Feature Requests]
                                    └─► Notion [Product Roadmap]
   Content Queue [Idea] ──► n8n (Content Draft Factory) ──► Sheets [Draft Ready]
   Sheets (all tabs) ──► n8n (Daily Growth Brief) ──► Approval channel
```

## Repository layout

```
docs/
  OPS_STACK.md            ← you are here
  ANALYTICS_EVENTS.md     ← event taxonomy + which tab each feeds
  N8N_WORKFLOWS.md        ← workflow specs, triggers, test steps
  AGENT_GUARDRAILS.md     ← the rules every automation obeys
growth-os/
  sheets/setup.gs         ← one-click command center builder (no API key)
  sheets/SCHEMA.md        ← tab + column definitions
  notion/STRUCTURE.md     ← workspace blueprint
  n8n/*.json              ← four importable workflows (no secrets inside)
  n8n/README.md           ← import + credential wiring
```

## Build order — EXECUTION-FIRST (current state)
Today's goal: lean machine + 14-day queue + first launch video posted + metrics sheet ready.
1. **Sheets command center** — `growth-os/sheets/setup.gs` (ready to run). ⏳ needs a blank Sheet.
2. **Content Factory + 14-day queue** — `growth-os/content-factory/` (✅ written, ready to shoot).
3. **Today's launch package** — `growth-os/content-factory/launch-package.md` (✅ ready to post).
4. **Content Draft Factory (n8n)** — `n8n/content-draft-factory.json`. ⏳ import + credentials.
5. **Feedback to Backlog (n8n)** — `n8n/feedback-to-backlog.json`. ⏳ import + credentials.

**Parked** (don't build until the above is live): Notion (`growth-os/notion/`), Daily Growth
Brief + RevenueCat webhook (`growth-os/n8n/parked/`), creator-outreach automation, complex dashboards.

## Principles
- **Lean:** one source of truth per fact; no duplicate systems.
- **Testable:** every workflow runs manually before it's activated.
- **Human-in-the-loop:** nothing publishes, sends, or charges without approval (see `AGENT_GUARDRAILS.md`).
- **Secrets stay in vaults:** keys live in n8n's credential store, RevenueCat, and the app's env — never in the repo or frontend.
