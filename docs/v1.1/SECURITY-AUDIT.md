# Security Audit

Scope: the Expo client. There is no backend, so server-side controls (SEC-02…SEC-12)
cannot be assessed — that is itself the top finding.

Severity: **Critical** exploitable now · **High** exploitable when a planned feature
ships · **Medium** weakens defence in depth · **Info** correct, recorded for the file.

---

## Fixed this session

### S-01 — Analytics would have leaked customer PII · High · **Fixed**
The invoice event taxonomy sends per-document events. Without a guard, the first
call site to pass a customer object would have shipped names, emails, addresses and
invoice descriptions to a third-party analytics vendor — a GDPR/CCPA problem and a
trust problem.
**Fix:** `src/privacy/scrub.js` — deny-by-default allowlist, value-shape detectors
for emails/phones/addresses/card-length digit runs, nested objects dropped, strings
truncated. 9 tests.

### S-02 — Feature flags could enable a payment path with no backend · High · **Fixed**
A remote config payload (or a compromised one) setting `customerPaymentsEnabled:
true` would have exposed a half-wired money flow.
**Fix:** `HARD_LOCKED_OFF` in `src/flags/core.js`. The three payment flags resolve
`false` regardless of remote payload or dev override. Tested both paths.

### S-03 — Exact invoice amounts + ids in analytics are quasi-identifiers · Medium · **Fixed**
An exact amount plus a timestamp effectively identifies a job.
**Fix:** `amountBucket()` and `hashId()`.

### S-04 — AI prompts would have carried customer data · High · **Fixed**
"Explain this invoice" would have sent the customer's name and address to a model.
**Fix:** `stripIdentifying()` in the AI context builder; the document builder sends
shape and scope-of-work only. Tested.

### S-05 — Sequential invoice ids as public identity · Medium · **Fixed in model**
`INV-2026-0001` is guessable; used as a payment-link identity it exposes other
customers' invoices.
**Fix:** display number and addressable identity are separate. `generateToken()`
produces a 22-character random id. Not yet wired to a UI, since there is no payment
link to expose.

---

## Open

### S-06 — No backend, therefore no server-side verification of anything · Critical (blocking)
SEC-12 requires that price, entitlement, connected account, payment status, invoice
ownership, platform fee and subscription status are never trusted from the client.
None of that can exist today. **Every** payment requirement is blocked on this.
**Action:** stand up the backend (see `KEYS-SETUP.md` §3) before any PAY work.

### S-07 — `IS_PRO = false` and empty Android key · Critical (business, not exploit)
Not an attack vector — the failure is in the honest direction — but users are paying
and receiving nothing, which is the more expensive kind of security problem.
**Action:** TD-01, TD-03.

### S-08 — AsyncStorage is unencrypted · Medium
Correct today: only preferences, flags and progress are stored. It becomes a real
finding the moment invoices with customer names and addresses are persisted.
**Action:** before shipping invoice storage, move customer records to
`expo-secure-store` or encrypt at rest. On a rooted/jailbroken device or an
unencrypted backup, AsyncStorage is plain text.

### S-09 — No certificate pinning · Medium
Relevant once a backend exists. A user on a hostile network could MITM API traffic.
**Action:** evaluate with the backend; not worth the operational cost for a
read-only AI endpoint, worth it for payments.

### S-10 — No jailbreak/root detection · Low
`expo-device` is already a dependency. Worth signalling on payment screens only.

### S-11 — No rate limiting on Spark AI from the client · Medium
`useGating.js` counters live in AsyncStorage and are trivially resettable by
clearing app data. Fine for UX nudging, useless as a spend control.
**Action:** enforce the real limit server-side. The client counter should be a hint,
not the boundary.

### S-12 — Deep-link / URL handling · Info
`safeOpenURL()` in `App.js` is genuinely well done: scheme allowlist plus a
known-domain check. Keep this pattern when payment redirect URLs arrive (SEC-09
requires redirect validation).

### S-13 — No input length caps on invoice free-text · Low
`scopeOfWork`, `exclusions` and notes are unbounded. A pasted novel could bloat
storage or break PDF layout.
**Action:** cap at render and at write.

---

## Informational — verified correct

- **RevenueCat iOS key in the bundle** is fine. Public SDK keys are designed to
  ship in clients; they identify the app and cannot read billing data. The
  *secret* key is correctly absent.
- **No private keys, tokens or webhook secrets** anywhere in the repo. Verified by
  name against `FORBIDDEN_CLIENT_KEYS`.
- **`safeLog()`** only prints in `__DEV__` — errors are not leaked in production.
- **Numeric input sanitisation** (`cleanNumberInput`, `toPositiveNumber`) is present
  and bounded. Nothing is `eval`'d.
- **The circuit engine is pure** — no network, no storage, no injection surface.

---

## Before shipping payments — non-negotiable checklist

1. Backend exists; all Stripe calls server-side
2. Webhook signature verification on every handler
3. Idempotency keys on session creation; event ids logged to prevent double-handling
4. Ownership check on every invoice/session read — enforced in the database (RLS), not application code
5. Payment-session links are unguessable and expire
6. Redirect URLs validated against an allowlist
7. CORS restricted to your domains
8. Financial and personal data redacted from server logs
9. Rate limits on session creation and AI endpoints
10. Never trust client-supplied price, entitlement or payment status

`platformFeesEnabled` stays off until a verified business decision exists (PAY-16),
and production payments are never marked complete on test-mode credentials.
