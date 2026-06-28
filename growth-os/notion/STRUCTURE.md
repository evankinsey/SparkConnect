# Notion Workspace — SparkConnect Growth OS

Notion holds the **narrative + planning** layer. Google Sheets holds the
**numbers + queues**. They are linked, not duplicated: bots write structured
rows to Sheets and create a matching Notion page only for items that need
discussion (bugs, feature requests). Everything else stays in Sheets.

Build this once by hand (≈20 min) or, later, via the Notion API setup script
once you provide an integration token. No secrets are needed to create it manually.

## Top-level structure

```
SparkConnect HQ (workspace / teamspace)
├── 📍 Product Roadmap            (database)
├── ✅ Launch Checklist           (database)
├── 📚 Content Library            (database)
├── 📒 SOPs                       (database)
└── 📈 Weekly Growth Reports      (database)
```

### 1. Product Roadmap  *(database — Board view by Status)*
Properties:
- **Name** (title)
- **Type** — select: `Feature · Bug · Improvement · Experiment`
- **Status** — select: `Backlog · Considering · Planned · Building · Shipped · Declined`
- **Priority** — select: `P0 · P1 · P2 · P3`
- **Area** — select: `Sparky AI · Paywall · Onboarding · Job Tools · Billing · Infra`
- **Source** — select: `User Feedback · Internal · Data · Support`
- **Votes** — number
- **Sheets Link** — url  (points back to the Bugs / Feature Requests row)
- **Created** — created time

> The **Feedback to Backlog** workflow creates a page here when it logs a bug or
> feature request, and pastes the Notion page URL into the Sheets `Notion Link` column.

### 2. Launch Checklist  *(database — grouped by Phase)*
Properties: **Task** (title) · **Phase** (`Pre-launch · Soft launch · Public launch · Post-launch`) · **Owner** (person) · **Status** (`Todo · Doing · Blocked · Done`) · **Due** (date) · **Notes** (text).

Seed phases: App Store / Play Store listing, RevenueCat products live, Superwall paywall config, analytics verified, support inbox, privacy policy, content runway (10 drafts), press/creator outreach list.

### 3. Content Library  *(database — Gallery view)*
Properties: **Title** (title) · **Platform** (multi-select) · **Status** (`Draft · Approved · Scheduled · Published`) · **Hook** (text) · **CTA** (text) · **Hashtags** (text) · **Publish Date** (date) · **Performance** (text) · **Sheets ID** (text, links to Content Queue ID).

> Mirrors the Sheets `Content Queue`. The Draft Factory writes drafts to Sheets;
> approved pieces are copied here for the published archive + performance notes.

### 4. SOPs  *(database — standard operating procedures)*
Properties: **Title** (title) · **Category** (`Growth · Support · Content · Release · Billing`) · **Owner** (person) · **Last Reviewed** (date) · **Body** (page content).
Seed SOPs: "Daily Growth Brief review", "Triaging feedback", "Approving content", "Handling an urgent bug alert", "Monthly RevenueCat reconciliation".

### 5. Weekly Growth Reports  *(database — one page per week)*
Properties: **Week Of** (title/date) · **Installs** (number) · **Net New Paid** (number) · **MRR** (number) · **Top Content** (text) · **Wins** (text) · **Learnings** (text) · **Next Week Focus** (text).

> Populated manually (or later by an optional weekly n8n workflow) from the
> Sheets Dashboard. Keep it short — five bullets max per section.

## Linking rule
Sheets row ⇄ Notion page is 1:1 and bidirectional via the `Sheets Link` /
`Notion Link` URL properties. Never duplicate the full data — link it.
