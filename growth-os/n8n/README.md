# n8n Workflows — Import & Wiring

Four starter workflows. Each is importable as-is but **inactive** and
**uncredentialed** by design — you wire credentials in the n8n UI after import.
No API keys live in these files. Every secret is referenced by **credential name**.

## Workflows
| File | Trigger | What it does |
|---|---|---|
| `daily-growth-brief.json` | Schedule (7am) | Reads Sheets → Claude summary + 3 priorities + 5 hooks → posts to approval channel |
| `feedback-to-backlog.json` | Webhook `/sparkconnect-feedback` | Classifies feedback → appends to Feedback (+ Bugs / Feature Requests) → alerts only on urgent |
| `content-draft-factory.json` | Manual | Pulls one `Idea` from Content Queue → Claude draft → saves **Draft Ready** (never posts) |
| `revenuecat-webhook.json` | Webhook `/sparkconnect-revenuecat` | Logs subs/renewals/cancels/packs → Revenue tab → MRR delta → milestone alert |

## Import
1. n8n → **Workflows → Import from File** → pick a JSON.
2. Open the **Config** node, paste your `SHEET_ID` (from the Sheet URL) and any webhook URLs.
3. Open each node showing a red credential warning and select the matching credential (below).
4. Test with **Execute Workflow** before activating.

## Credentials to create in n8n (one each, reused across workflows)
| Credential name (must match) | Type | Used by |
|---|---|---|
| `Google Sheets (SparkConnect)` | Google Sheets OAuth2 | all Sheets nodes |
| `Anthropic API (x-api-key)` | Header Auth — name `x-api-key`, value = your Anthropic key | Claude HTTP nodes |
| `RevenueCat Webhook Auth (Authorization header)` | Header Auth — shared secret RC sends | RevenueCat webhook |

> **Config fields are not secrets** (sheet ID, model name, prices). **Credentials are**
> — they stay in n8n's encrypted store, never in these files or the repo.

## Approval / alert channel
`APPROVAL_WEBHOOK_URL` and `ALERT_WEBHOOK_URL` are empty in Config. Paste a Slack
or Discord **incoming webhook URL** (or swap the final HTTP node for a native
Slack/Telegram node). Until set, the workflow runs but the final send is a no-op
to a blank URL — safe by default.

## Model
Defaults to `claude-opus-4-8`. To cut cost on high-volume classification, change
the `MODEL` field in Config to a smaller Claude model — no other edits needed.

## Guardrails baked in
- Draft Factory writes status `Draft Ready` only — it **cannot** set Approved/Scheduled/Published.
- Feedback alerts fire **only** when the classifier marks `urgent` (crash/data-loss/security/legal/safety/payment).
- RevenueCat customer IDs are SHA-256 hashed before they touch the sheet.
- Nothing posts to social, sends email/DMs, or changes billing.
