# Store privacy declarations

What to enter in App Store Connect and Google Play so the forms agree with
`src/core/legal/policy.js`. **A nutrition label that contradicts the policy is a
review rejection**, and it is the most common way an otherwise honest app gets
held up.

Everything below is derived from the code, not from intent. The verification
column is how to re-check it if any of this changes.

---

## The facts, and where they come from

| Fact | Verify in |
|---|---|
| Exactly two outbound requests: `/api/ask-nec`, `/api/transcribe` | `App.js` — two `fetch(` call sites, held by `tests/legal.test.js` |
| Sent with a question: text, last 6 messages, `deviceId`, `appVersion`, `planType` | `App.js` payload at the SparkAI call site |
| Photos leave only when attached to a question | `App.js` — `selectedImage` is included in the payload |
| Audio leaves only on voice input | `App.js` — POST to `/api/transcribe` |
| `deviceId` is `'dev_' + Math.random()...` — not a hardware identifier | `App.js getDeviceId()` |
| No analytics, crash or ad SDK | no such import exists; `tests/legal.test.js` scans imports |
| No account, no login, no email collected | there is no auth code |
| Everything else is AsyncStorage on device | the `@sc_*` keys |
| Purchases handled by Apple / Google via RevenueCat | `src/purchases.js` |

---

## Apple — App Privacy

### Data used to track you
**None.** No advertising identifier is read, no SDK is present, and the device
identifier is generated locally and never joined to anything.

### Data linked to you
**None.** There is no account, so nothing can be linked to an identity.

### Data NOT linked to you — declare these three

**1. User Content → Photos or Videos**
- Collected: **Yes**
- Linked to identity: No · Used for tracking: No
- Purpose: **App Functionality**
- Note: only a photo the user attaches to a SparkAI question.

**2. User Content → Other User Content** *(the question text and voice audio)*
- Collected: **Yes**
- Linked to identity: No · Used for tracking: No
- Purpose: **App Functionality**

**3. Identifiers → Device ID**
- Collected: **Yes**
- Linked to identity: No · Used for tracking: **No**
- Purpose: **App Functionality** (counting daily question limits)

> Do **not** declare Diagnostics, Usage Data, Location, Contacts, Search History
> or Purchase History. None are collected. Over-declaring is as wrong as
> under-declaring and invites questions you cannot answer.

### Privacy Policy URL
`https://sparkconnect.pro/privacy`

---

## Google Play — Data safety

| Section | Answer |
|---|---|
| Does your app collect or share user data? | **Yes** |
| Is data encrypted in transit? | **Yes** — HTTPS |
| Can users request deletion? | **Yes** — deleting the app removes on-device data; nothing is retained server-side to delete |

**Data types to declare — all three: collected Yes, shared Yes, processed ephemerally, optional (user-initiated), purpose App functionality**

- **Photos and videos → Photos**
- **Files and docs** *(voice recording)*
- **Device or other IDs**

"Shared" is **Yes** for all three, because the content is passed to a
third-party AI provider. That is the answer that matters most and the one it is
tempting to get wrong.

Privacy Policy URL: `https://sparkconnect.pro/privacy`

---

## Keeping it true

```
npm run legal          regenerate the website pages from the policy module
npm run legal:check    fail if the committed HTML has drifted
npm test               includes tests/legal.test.js
```

The app renders `src/core/legal/policy.js` directly and the website HTML is
generated from it, so both platforms show one text by construction. The tests
enforce three things a normal review would miss:

1. the committed HTML is byte-identical to what the module generates
2. every field the app actually sends is disclosed
3. the "exactly two network calls" and "no analytics SDK" claims still hold

**If you add a third network call, `tests/legal.test.js` fails** — before the
policy becomes untrue rather than after.

---

## What changed in 2.0.0, and why it mattered

Two documents existed and disagreed:

- The **app** disclosed that questions and photos reach a third-party AI service
  provider. The **website** did not, and implied they stopped at our own
  backend. In an AI product that is the single most consequential sentence in
  the document.
- The **website** disclosed the random device identifier sent with every
  request. The **app** never mentioned it.

Neither was complete, so making them match could not mean picking one. Both gaps
are closed, there is now one text, and the third-party AI disclosure has its own
heading rather than being a clause inside another section.
