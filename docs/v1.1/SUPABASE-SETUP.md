# Supabase — what you actually have to do

Everything here is copy-paste. Roughly **45 minutes** for steps 1–5, which gets you
a working backend. Stripe (steps 6–8) is another hour and can wait.

You do steps 1–3. I can write everything from step 4 on once the project exists.

---

## Why Supabase, in one paragraph

You need four things: somewhere to run Stripe webhooks, somewhere to store invoice
state that isn't the phone, a way to stop customer A reading customer B's invoice,
and a hosted page where a homeowner pays. Supabase gives you all four in one
project. The alternative — Vercel functions plus a separate database plus your own
auth — is three vendors for the same result. The ownership check matters most:
Postgres row-level security enforces it *in the database*, so a bug in my code
can't leak an invoice. Application-level checks rely on every query remembering.

---

## Step 1 — Create the project (5 min)

1. **supabase.com** → Start your project → sign in with GitHub
2. **New project**
   - Name: `sparkconnect`
   - Database password: generate one, **save it in your password manager** — it is not recoverable
   - Region: closest to your customers (US East for Florida)
   - Plan: Free
3. Wait ~2 minutes while it provisions

## Step 2 — Get your keys (2 min)

**Project Settings → API**. You need two values:

| Value | Where it goes |
|---|---|
| **Project URL** (`https://xxxx.supabase.co`) | `src/config/keys.js` — safe in the app |
| **anon / public key** | `src/config/keys.js` — safe in the app, it is designed for clients |
| **service_role key** | **NOWHERE NEAR THE APP.** Server only. It bypasses every security rule |

Add to `src/config/keys.js`:

```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhb...';
export const BACKEND_URL = 'https://xxxx.supabase.co/functions/v1';
```

Then `npm run config:check` should go green.

> If you ever see `service_role` in a file under `src/`, stop and rotate it.
> `validateConfig()` checks for it by name and reports `SECRET IN CLIENT BUNDLE`.

## Step 3 — Create the tables (10 min)

**SQL Editor → New query**, paste all of this, hit Run.

```sql
-- ── Contractors ──────────────────────────────────────────────────────────────
create table public.contractors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text,
  owner_name text,
  phone text,
  email text,
  license_number text,
  license_state text,
  stripe_account_id text,
  stripe_account_status text not null default 'NOT_CONNECTED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contractors_user_id_idx on public.contractors(user_id);

-- ── Customers ────────────────────────────────────────────────────────────────
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);
create index customers_contractor_idx on public.customers(contractor_id);

-- ── Documents (estimates and invoices share one table) ───────────────────────
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  kind text not null check (kind in ('ESTIMATE','INVOICE')),
  number text not null,
  -- Unguessable public identity. The display number stays sequential; this is
  -- what appears in a payment link, so nobody can walk to another invoice.
  public_token text not null default encode(gen_random_bytes(16),'hex'),
  status text not null,
  line_items jsonb not null default '[]',
  tax_percent numeric not null default 0,
  discount_cents integer,
  deposit_cents integer not null default 0,
  total_cents integer not null default 0,
  amount_paid_cents integer not null default 0,
  source_estimate_id uuid references public.documents(id) on delete set null,
  issue_date date,
  due_date date,
  scope_of_work text,
  exclusions text,
  customer_message text,
  internal_notes jsonb not null default '[]',
  audit_trail jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index documents_public_token_idx on public.documents(public_token);
create index documents_contractor_idx on public.documents(contractor_id);
create unique index documents_number_idx on public.documents(contractor_id, number);

-- ── Payments ─────────────────────────────────────────────────────────────────
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  amount_cents integer not null,
  method text not null,
  kind text not null,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  recorded_at timestamptz not null default now(),
  reference text,
  note text
);
create index payments_document_idx on public.payments(document_id);

-- ── Webhook idempotency (PAY-13) ─────────────────────────────────────────────
-- Stripe retries. Without this, one payment can be applied twice.
create table public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb
);
```

## Step 4 — Lock it down (5 min)

**This is the step that matters.** Without it every table is world-readable.

```sql
alter table public.contractors enable row level security;
alter table public.customers   enable row level security;
alter table public.documents   enable row level security;
alter table public.payments    enable row level security;
alter table public.stripe_events enable row level security;

-- A contractor row belongs to one auth user.
create policy "own contractor row" on public.contractors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Everything else is reachable only through your own contractor row.
create policy "own customers" on public.customers
  for all using (contractor_id in (select id from public.contractors where user_id = auth.uid()))
  with check (contractor_id in (select id from public.contractors where user_id = auth.uid()));

create policy "own documents" on public.documents
  for all using (contractor_id in (select id from public.contractors where user_id = auth.uid()))
  with check (contractor_id in (select id from public.contractors where user_id = auth.uid()));

create policy "own payments" on public.payments
  for all using (document_id in (
    select d.id from public.documents d
    join public.contractors c on c.id = d.contractor_id
    where c.user_id = auth.uid()));

-- stripe_events has NO policy on purpose: only the service_role key touches it,
-- and service_role bypasses RLS. No client can read your webhook log.
```

**Verify it worked.** Table Editor → each table should show a green **RLS enabled**
badge. If any says "unrestricted", that table is public — fix before shipping.

## Step 5 — Install the client (5 min)

```bash
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
```

Tell me when this is done and I'll write `src/core/backend/` — the client, the
sync layer, and the offline queue. Everything stays offline-first: the app keeps
working in a basement and syncs when it reconnects.

---

## Stripe — steps 6 to 8, when you're ready

### Step 6 — Stripe account
1. **stripe.com** → create account → **activate** it (needs your business details and a bank account)
2. **Connect → Get started** → platform type **Express**
3. **Developers → API keys** → copy the **Secret key** (`sk_live_…` or `sk_test_…`)

### Step 7 — Store the secrets server-side only
```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```
These live in Supabase, never in the repo. `FORBIDDEN_CLIENT_KEYS` in
`src/core/config/validate.js` fails the build check if either appears in `src/`.

### Step 8 — Edge functions
Three functions, which I'll write:

| Function | Job |
|---|---|
| `connect-onboarding` | Creates the Express account and returns a Stripe-hosted onboarding link |
| `create-payment-session` | Creates a Checkout session for one invoice, with an idempotency key |
| `stripe-webhook` | Verifies the signature, checks `stripe_events` for a duplicate, updates the invoice |

Register the webhook at **Stripe → Developers → Webhooks → Add endpoint**:
`https://xxxx.supabase.co/functions/v1/stripe-webhook`, subscribing to
`checkout.session.completed`, `payment_intent.succeeded`,
`payment_intent.payment_failed`, `charge.refunded`, `account.updated`.

Copy the signing secret it gives you into `STRIPE_WEBHOOK_SECRET`.

---

## Rules I will not break in this backend

From your brief and from ordinary sense:

1. **The webhook is the source of truth.** A user returning to the app from a
   successful-looking redirect proves nothing — that URL can be typed by hand.
   An invoice only becomes PAID when Stripe tells the server it was paid.
2. **Every webhook checks `stripe_events` first.** Stripe retries on timeout; a
   duplicate must be a no-op, not a second payment.
3. **The server recomputes the amount** from the stored line items. It never
   trusts an amount sent by the app.
4. **No secret key, OAuth token or webhook secret** ever enters the client.
5. **`customerPaymentsEnabled` stays hard-locked off** until all of the above is
   live and tested end to end with a real card. It cannot be switched on by a
   remote config payload — there is a test proving that.

---

## Cost

Free tier: 500 MB database, 5 GB bandwidth, 500k edge function calls a month.
For an invoicing app that is thousands of invoices a month. The paid tier is
$25/month and you will know when you need it.

Stripe takes 2.9% + 30¢ per transaction. SparkConnect's own platform fee stays at
**zero** — `platformFeesEnabled` is off and hard-locked, per your brief's
instruction not to enable one without a verified business decision.
