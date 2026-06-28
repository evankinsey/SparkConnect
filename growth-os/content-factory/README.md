# SparkConnect Content Factory

Turns one idea into every short-form asset: hook, 20–35s script, screen-recording
shot list (real app features only), Seedance/Higgsfield B-roll prompt, on-screen
text, caption, CTA, hashtags, thumbnail text, and TikTok/Reels/Shorts variations.

**Drafts only. Nothing posts automatically.** A human shoots, reviews, and publishes.

## Files
| File | What it is |
|---|---|
| `MASTER_PROMPT.md` | The generator. Paste into Claude (or it's baked into the n8n Content Draft Factory). Input one idea → all assets. |
| `prompt-library.md` | 8 reusable theme packs (pain points, pipe bending, conduit/box fill, Sparky, code questions, founder, mistakes/tips, launch). |
| `14-day-queue.md` | The ready-to-shoot 14-day plan, one feature per day, all provable. |
| `launch-package.md` | **Today's** full launch video: script, shot list, B-roll prompt, 3 captions, thumbnail, hashtags, exact posting order. |
| `content-queue-seed.csv` | Import straight into the Sheets **Content Queue** tab. |

## Two ways to generate a piece
1. **By hand (fastest today):** open `MASTER_PROMPT.md`, fill the INPUT block from a
   Content Queue row, paste into Claude, get the assets, drop them into the row.
2. **Automated:** the n8n **Content Draft Factory** runs the same prompt on the first
   `Idea` row and writes the result back as **Draft Ready** (see `growth-os/n8n/`).

## Allowed facts (provable — don't exceed these)
- Tools: Conduit Fill, Box Fill, Voltage Drop, Ampacity (+derating), Wire Size, Load
  Calc, Ohm's Law, Pipe Bending, Material Estimator, Wire Colors, Formula Reference.
- Sparky AI: Free 3/day · Pro 20/day (400/mo cap) · packs 15/$1.99, 50/$4.99, 150/$9.99 (never expire).
- Code Quiz / Exam Prep. Job Cam.
- Pro: 3-day free trial → **$7.99/mo or $49.99/yr** (launch special).
- ⚠️ **iOS download status** is the one thing to confirm before posting a "download now" CTA.

## Workflow status lifecycle (Content Queue tab)
`Idea → Drafting → Draft Ready → Approved → Scheduled → Posted`
Bots only ever set **Draft Ready**. Humans own Approved/Scheduled/Posted.
