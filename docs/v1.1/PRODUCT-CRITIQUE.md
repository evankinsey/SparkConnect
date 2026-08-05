# Product Critique

You asked for brutal. Five reviewers, five lenses. I've tried to be useful rather
than harsh — but I haven't softened anything.

---

## Apple — "Does this deserve to be on the Home Screen?"

**Verdict: not yet. It's a utility belt, not a product.**

The app has eleven tabs' worth of tools and no point of view about which one matters.
Open it cold and it asks nothing, remembers nothing, and looks the same on day 40 as
day 1. Apple's bar isn't "does it work" — it's "does it feel like it was designed by
someone who cared about *this* person's day."

Specifics:
- **The `COMING SOON` box in Learn would be flagged in review.** Shipping a grey
  placeholder in a paid app reads as abandoned.
- **Three colour systems.** Blue app, orange paywall, yellow AI. It looks like three
  contractors built three screens.
- **Light mode is pure white.** This app is used outdoors, in attics, in trenches. The
  one environment you must nail is the one you've optimised least for.
- **No haptics, no transitions, no skeletons.** Everything pops. Nothing acknowledges
  a tap.

**The fix isn't more features.** It's making the twenty things you have feel like one
thing.

---

## Stripe — "Would I trust this with money?"

**Verdict: not today, and you should be glad it isn't live.**

- **Money was in floats.** A cent of drift on a customer-facing invoice is the fastest
  way to lose a contractor's trust. *(Fixed — integer cents.)*
- **No status model.** A draft, a sent estimate and an accepted one were
  indistinguishable. *(Fixed — state machines.)*
- **Sequential invoice numbers as identity.** `INV-2026-0001` in a payment URL means
  customer A can read customer B's invoice by subtracting one. *(Fixed in the model.)*
- **No backend.** This is the real blocker. Everything Stripe requires — webhook
  verification, idempotency, ownership checks, server-side amounts — needs a server.
  There isn't one.

**The honest read:** the invoice *model* is now solid — better than most trade apps.
The invoice *product* doesn't exist yet. Don't let the model's quality convince you
you're close.

**One thing you're underrating:** deposits. Contractors ask for money up front on
almost every job over a few thousand dollars. The model supports it. Ship it early —
it's the feature that makes them move real money through you.

---

## Linear — "Is this well built?"

**Verdict: the new code is good. The old code is a liability.**

- **`App.js` is 305 KB.** Every screen, all data, the theme, navigation. Two people
  cannot work on this. One person barely can.
- **There were zero tests.** For an app doing NEC calculations that people rely on in
  the field, that's the finding that should worry you most. A wrong voltage drop isn't
  a bug, it's a callback — or worse.
- **Three overlapping Pro-gating files** and nothing saying which wins.
- **`IS_PRO = false` hardcoded.** This is the kind of thing that survives because
  nobody can see the whole file at once. It's a symptom of TD-04, not an isolated slip.

**Credit where due:** `safeOpenURL()` is genuinely careful — scheme allowlist plus
domain check. Someone was thinking about security. That instinct is worth building on.

**What I'd insist on:** CI running the tests. You have 146 now; without CI they rot
in a month.

---

## Notion — "Does this compound?"

**Verdict: no. Every feature is a dead end.**

This is the deepest problem and the biggest opportunity.

Right now: calculate a voltage drop → the answer vanishes. Take a job photo → it goes
in a pile. Build an estimate → retype it as an invoice. Ask Spark AI → it has no idea
what you were just doing.

**Nothing you do in SparkConnect makes the next thing you do easier.** That's why
retention is the hard problem here, not acquisition. Users don't accumulate anything.

Compare Notion: every page makes the next page more valuable. Compare your own
pitch — "calculate → understand → document → invoice" — which is *exactly* right and
*not implemented*. That sentence is the product. Build the arrows between the nouns
and you have something no competitor can copy in a weekend, because they'd have to
rebuild all of it.

**Concretely:** a calculation should be savable to a job; a job should hold photos;
photos should attach to an estimate; the estimate should become an invoice; Spark AI
should see all of it. The data models for most of this now exist. The connections
don't.

---

## Duolingo — "Will they come back tomorrow?"

**Verdict: you have the pieces and none of the psychology.**

- **Streaks exist but are nearly invisible.** Duolingo's streak works because losing
  it hurts and you're constantly reminded of it. Yours is computed and shown small.
- **One question type.** Your own instinct — rotating between spot-the-mistake, bend
  this, which breaker, troubleshoot — is right and better than what's built.
- **No loss aversion, no variable reward, no social comparison.** The three levers
  that actually drive daily return.
- **XP with nothing to spend it on.** Ranks are a ladder with no rungs you can feel.
- **The daily notification is the whole retention strategy** and until this week it
  didn't fire at all.

**Where you're better positioned than Duolingo:** their users have no external reason
to learn Spanish. Yours are studying for a licence exam that changes their income.
The motivation is already there — you just have to not waste it.

**The single highest-leverage thing:** Wiring Lab with a completion animation and a
share card. "I wired a 4-way in 38 seconds" is a post. A vocabulary score isn't.

---

## What's actually stopping this from being the best electrician app in the world

In order:

1. **Paying users get nothing.** `IS_PRO = false` and a missing Android key. Fix this week.
2. **Nothing connects to anything.** The pitch is a connected workflow; the app is a folder of tools.
3. **`App.js` can't be safely changed**, so every fix is slow and risky, and the slowness compounds.
4. **There's no reason to open it tomorrow** beyond one notification.
5. **Nothing is shareable.** Zero organic growth loops in an industry that lives on TikTok and Instagram.
6. **The learning content is thin** — 171 questions, and until today no interactive lessons.
7. **No community.** Calculators are copyable; a network of electricians is not. You have no moat.
8. **Light mode fails outdoors**, which is where the app is used.
9. **You're competing on breadth against apps that win on depth.** QuickBend owns bending because of bender-specific radii. You have neither their depth nor a reason to pick you over them for that job.
10. **No one is measuring anything** — analytics has never fired.

---

## The strategic call I'd make

**Stop adding calculators.** You have enough. Every hour spent on calculator #13 is an
hour not spent on the two things nobody else has:

- **Wiring Lab** — interactive, game-like, shareable, and now sitting on a tested engine
- **The connected workflow** — calculate → save → document → invoice → get paid

QuickBend will always beat you at bending. Ugly's will always beat you at reference.
Dakota will always have more exam questions. **You win by being the only app where
those things are connected to each other and to the money.**

Then the community and the jobs board, because those are the only features on your
roadmap that get *harder* to copy as they grow.

---

## What's genuinely good, and worth protecting

Being fair, since the above is one-sided:

- **The breadth is real.** No competitor covers calculators + AI + training + photos + invoicing.
- **The Lifetime tier** is smart positioning against subscription fatigue — Field Bend's reviews prove that resistance is real.
- **Dark mode looks professional.**
- **Card structure and tap targets** are well suited to gloved hands on a job site.
- **`safeOpenURL`, input sanitisation, and the "no secret keys" discipline** show real care.
- **The positioning instinct is correct.** "The electrician operating system" is the
  right ambition, and the calculate → understand → document → get paid framing is the
  best sentence in all three briefs. Build that literally and you have the company.
