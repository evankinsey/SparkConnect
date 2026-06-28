# n8n Workflows

**Today we build only two** (execution-first). The other two are parked in
`parked/` until the content engine is running.

| File | Trigger | What it does |
|---|---|---|
| `content-draft-factory.json` | Manual | Pulls one `Idea` from Content Queue → Claude generates the full asset set → saves **Draft Ready**. Never posts. |
| `feedback-to-backlog.json` | Webhook `/sparkconnect-feedback` | Classifies feedback into **Bug / Feature Request / General** → appends to Feedback, and to Bugs or Feature Requests → alerts only on urgent. |
| `parked/daily-growth-brief.json` | — | Deferred. Daily summary + priorities + hooks. |
| `parked/revenuecat-webhook.json` | — | Deferred. Revenue logging + MRR. (Use **Revenue Snapshot** tab manually for now.) |

No API keys live in these files. Every secret is referenced by **credential name**.

## Import (per workflow)
1. n8n → **Workflows → Import from File** → pick the JSON.
2. Open **Config** → paste your `SHEET_ID` (from the Sheet URL); leave webhook URLs blank until you have a Slack/Discord webhook.
3. Select the matching credential on any node showing a red warning (table below).
4. **Execute Workflow** to test before activating.

## Credentials to create in n8n (once, reused)
| Credential name (must match) | Type | Used by |
|---|---|---|
| `Google Sheets (SparkConnect)` | Google Sheets OAuth2 | all Sheets nodes |
| `Anthropic API (x-api-key)` | Header Auth — name `x-api-key`, value = your Anthropic key | Claude HTTP nodes |

> Config fields (sheet ID, model, prices) are **not secrets**. Credentials are —
> they stay in n8n's encrypted store, never in these files or the repo.

## Feedback to Backlog — input shape
`POST /sparkconnect-feedback` with:
```json
{ "text": "the app crashed when I opened box fill", "source": "email|form|social", "contact": "optional" }
```
- `Bug` → Feedback + Bugs tabs. `Feature Request` → Feedback + Feature Requests. `General` → Feedback only.
- Urgent alert (one message) fires only for crash / data-loss / security / legal / safety / payment.

## Content Draft Factory
Reads the first Content Queue row with Status `Idea`, generates assets via the
Master Prompt (`growth-os/content-factory/MASTER_PROMPT.md`), writes them back and
sets Status **Draft Ready**. It has **no node that can post, schedule, or approve.**

## Model
Defaults to `claude-opus-4-8`. Switch the Config `MODEL` field to a smaller Claude
for cheap, high-volume feedback classification — no other change needed.
