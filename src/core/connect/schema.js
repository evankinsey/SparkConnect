// ─── THE MARKETPLACE SCHEMA ──────────────────────────────────────────────────
// The database, declared here and GENERATED into SQL, so the app's idea of the
// shape and the database's idea of it cannot drift.
//
// Same pattern as the allowance policy: one declaration, a generator, and a
// test that fails when the committed SQL stops matching. A schema maintained
// by hand in two places is a schema that is wrong in one of them.
//
// THE SECURITY POSTURE, STATED UP FRONT, BECAUSE IT IS THE POINT.
//
// 1. The app ships the ANON key only. That key is public by design and is
//    worthless on its own — every table below denies by default and is opened
//    only by an explicit policy. A service_role key in a mobile binary is a
//    full database handover, and it is extractable from any shipped app.
//
// 2. RLS is ON for every table, with no exceptions and no "temporarily off
//    while we test". A table with RLS off is readable in full by anybody
//    holding the public key, which is everybody.
//
// 3. Locked fields are not "hidden by the client". They live in a separate
//    table whose policy requires an unlock row. There is no query a contractor
//    can write that returns a phone number they have not paid for, because the
//    database will not return it — not because the app does not ask.
//
// 4. Nothing that decides money is writable by a client. Unlocks are inserted
//    by a webhook running with elevated rights on the server; the client can
//    read its own and nothing else. A client that can insert its own unlock row
//    is a client that gets every lead for free.
//
// Pure module: no React, no network, no Supabase import.

export const Table = Object.freeze({
  PROFILES: 'profiles',
  OPPORTUNITIES: 'opportunities',
  OPPORTUNITY_CONTACTS: 'opportunity_contacts',
  CONTRACTOR_PROFILES: 'contractor_profiles',
  QUALIFIER_PROFILES: 'qualifier_profiles',
  INTRO_REQUESTS: 'intro_requests',
  UNLOCKS: 'unlocks',
  VERIFICATION_RECORDS: 'verification_records',
  MODERATION_FLAGS: 'moderation_flags',
  SAVED_ITEMS: 'saved_items',
  AUDIT_EVENTS: 'audit_events',
});

const col = (name, type, def = {}) => Object.freeze({
  name, type,
  nullable: def.nullable !== false,
  default: def.default ?? null,
  references: def.references ?? null,
  note: def.note ?? null,
});

const table = (name, def) => Object.freeze({
  name,
  purpose: def.purpose,
  columns: Object.freeze(def.columns),
  // Every table states these. A table with no policies is a table nobody can
  // read, which is the correct default and a deliberate decision to make.
  policies: Object.freeze(def.policies ?? []),
  constraints: Object.freeze(def.constraints ?? []),
  indexes: Object.freeze(def.indexes ?? []),
});

const policy = (name, def) => Object.freeze({
  name, for: def.for, to: def.to ?? 'authenticated',
  using: def.using ?? null, check: def.check ?? null, why: def.why,
});

const ID = col('id', 'uuid', { nullable: false, default: 'gen_random_uuid()' });
const OWNER = col('owner_id', 'uuid', {
  nullable: false, references: 'auth.users(id) on delete cascade',
  note: 'Who this row belongs to. Every policy below is written against it.',
});
const CREATED = col('created_at', 'timestamptz', { nullable: false, default: 'now()' });

export const SCHEMA = Object.freeze([
  table(Table.PROFILES, {
    purpose: 'One row per account. Identity only — no licence claims live here.',
    columns: [
      col('id', 'uuid', { nullable: false, references: 'auth.users(id) on delete cascade' }),
      col('display_name', 'text'),
      col('contact_email', 'text'),
      col('contact_phone', 'text'),
      col('preferred_contact', 'text', { default: "'EMAIL'" }),
      CREATED,
    ],
    policies: [
      policy('profiles_select_own', { for: 'select', using: 'auth.uid() = id', why: 'Your own profile, and nobody else’s.' }),
      policy('profiles_upsert_own', { for: 'insert', check: 'auth.uid() = id', why: 'You cannot create a profile for somebody else.' }),
      policy('profiles_update_own', { for: 'update', using: 'auth.uid() = id', check: 'auth.uid() = id', why: 'And you cannot reassign one away from yourself.' }),
    ],
  }),

  table(Table.OPPORTUNITIES, {
    purpose: 'The browsable half of a posted job. Contains NOTHING identifying — '
      + 'that is a separate table, so a leaked query cannot leak a homeowner.',
    columns: [
      ID, OWNER,
      col('trade', 'text', { nullable: false }),
      col('location', 'text', { nullable: false }),
      col('project_type', 'text'),
      col('scope', 'text'),
      col('value_cents', 'bigint'),
      col('band_id', 'text', { note: 'Set by the server from value_cents. Never trusted from a client.' }),
      col('plans_available', 'boolean', { default: 'false' }),
      col('desired_start', 'text'),
      col('status', 'text', { nullable: false, default: "'PENDING_REVIEW'" }),
      col('unlock_count', 'integer', { nullable: false, default: '0', note: 'Maintained by the unlock trigger, not by clients.' }),
      col('max_unlocks', 'integer', { nullable: false, default: '3' }),
      CREATED,
    ],
    constraints: [
      'check (unlock_count >= 0 and unlock_count <= max_unlocks)',
      "check (status in ('DRAFT','PENDING_REVIEW','OPEN','FULL','CLOSED','WITHDRAWN'))",
    ],
    policies: [
      policy('opportunities_browse_open', {
        for: 'select',
        using: "status = 'OPEN'",
        why: 'Previews are public to signed-in users. This table holds nothing identifying, '
          + 'which is what makes that safe.',
      }),
      policy('opportunities_select_own', { for: 'select', using: 'auth.uid() = owner_id', why: 'Your own postings at any status.' }),
      policy('opportunities_insert_own', { for: 'insert', check: 'auth.uid() = owner_id', why: 'You post as yourself.' }),
      policy('opportunities_update_own', {
        for: 'update', using: 'auth.uid() = owner_id',
        check: 'auth.uid() = owner_id',
        why: 'Edit and withdraw your own. Status, band and unlock_count are additionally '
          + 'protected by a trigger — an owner cannot set their own price band or reopen a '
          + 'full opportunity.',
      }),
    ],
    indexes: ['(status, trade, band_id)', '(owner_id)'],
  }),

  table(Table.OPPORTUNITY_CONTACTS, {
    purpose: 'THE LOCKED HALF. Split from opportunities so that "who this is" is '
      + 'reachable only through a policy that reads the unlocks table.',
    columns: [
      ID,
      col('opportunity_id', 'uuid', { nullable: false, references: `public.${Table.OPPORTUNITIES}(id) on delete cascade` }),
      OWNER,
      col('contact_name', 'text'),
      col('contact_email', 'text'),
      col('contact_phone', 'text'),
      col('address', 'text'),
      CREATED,
    ],
    policies: [
      policy('contacts_select_own', { for: 'select', using: 'auth.uid() = owner_id', why: 'The person who posted it can always see it.' }),
      policy('contacts_select_unlocked', {
        for: 'select',
        using: `exists (select 1 from public.${Table.UNLOCKS} u where u.opportunity_id = ${Table.OPPORTUNITY_CONTACTS}.opportunity_id and u.contractor_id = auth.uid() and u.status = 'PAID')`,
        why: 'THE LOAD-BEARING POLICY. A paid unlock row is the only key to a contact. '
          + 'No unlock, no row — not a masked row, no row.',
      }),
      policy('contacts_insert_own', { for: 'insert', check: 'auth.uid() = owner_id', why: 'Written with the opportunity it belongs to.' }),
      policy('contacts_update_own', { for: 'update', using: 'auth.uid() = owner_id', check: 'auth.uid() = owner_id', why: 'Correct your own details.' }),
    ],
    indexes: ['(opportunity_id)'],
  }),

  table(Table.CONTRACTOR_PROFILES, {
    purpose: 'A licensed contractor, and whether anybody has actually checked.',
    columns: [
      ID, OWNER,
      col('business_name', 'text'),
      col('licence_number', 'text'),
      col('jurisdiction_id', 'text'),
      col('trades', 'text[]'),
      col('service_areas', 'text[]'),
      col('verified', 'boolean', {
        nullable: false, default: 'false',
        note: 'NEVER writable by a client. A self-set verified flag is the whole product '
          + 'defeated in one UPDATE.',
      }),
      col('verification_state', 'text', { default: "'UNCHECKED'" }),
      CREATED,
    ],
    constraints: ["check (verification_state in ('UNCHECKED','PENDING','VERIFIED','AMBIGUOUS','FAILED'))"],
    policies: [
      policy('contractor_select_own', { for: 'select', using: 'auth.uid() = owner_id', why: 'Your own profile.' }),
      policy('contractor_insert_own', { for: 'insert', check: 'auth.uid() = owner_id and verified = false', why: 'You may create your profile. You may not create it verified.' }),
      policy('contractor_update_own', {
        for: 'update', using: 'auth.uid() = owner_id', check: 'auth.uid() = owner_id',
        why: 'Edit your own details. The verified flag is held immutable by a TRIGGER, not '
          + 'by this policy — RLS checks a row, and "this column did not change" is a '
          + 'comparison between two rows that only a trigger can see.',
      }),
    ],
    indexes: ['(owner_id)', '(licence_number)'],
  }),

  table(Table.QUALIFIER_PROFILES, {
    purpose: 'A licensed professional open to qualifying a company.',
    columns: [
      ID, OWNER,
      col('licence_number', 'text'),
      col('jurisdiction_id', 'text'),
      col('open_to_relationships', 'boolean', { default: 'false' }),
      col('terms', 'text'),
      col('verified', 'boolean', { nullable: false, default: 'false' }),
      col('verification_state', 'text', { default: "'UNCHECKED'" }),
      CREATED,
    ],
    policies: [
      policy('qualifier_select_own', { for: 'select', using: 'auth.uid() = owner_id', why: 'Your own profile.' }),
      policy('qualifier_browse_verified', {
        for: 'select',
        using: 'verified = true and open_to_relationships = true',
        why: 'Previews of people who have opted in AND been verified. Nobody is listed '
          + 'without asking them — the opt-in is a column, not a policy we remember.',
      }),
      policy('qualifier_insert_own', { for: 'insert', check: 'auth.uid() = owner_id and verified = false', why: 'Not self-verified.' }),
      policy('qualifier_update_own', { for: 'update', using: 'auth.uid() = owner_id', check: 'auth.uid() = owner_id', why: 'Withdraw or change your terms at any time.' }),
    ],
  }),

  table(Table.INTRO_REQUESTS, {
    purpose: 'A qualifier introduction. Charged only when both sides have said yes.',
    columns: [
      ID,
      col('business_id', 'uuid', { nullable: false, references: 'auth.users(id) on delete cascade' }),
      col('qualifier_id', 'uuid', { nullable: false, references: 'auth.users(id) on delete cascade' }),
      col('business_interested', 'boolean', { default: 'false' }),
      col('qualifier_interested', 'boolean', { default: 'false' }),
      col('status', 'text', { nullable: false, default: "'PENDING'" }),
      col('paid_at', 'timestamptz'),
      col('compliance_reviewed', 'boolean', {
        nullable: false, default: 'false',
        note: 'A qualifier arrangement without genuine supervision is licence rental. This '
          + 'one never completes automatically — see operations.js COMPLIANCE_NOTE.',
      }),
      CREATED,
    ],
    policies: [
      policy('intro_select_party', { for: 'select', using: 'auth.uid() = business_id or auth.uid() = qualifier_id', why: 'Only the two parties.' }),
      policy('intro_insert_business', { for: 'insert', check: 'auth.uid() = business_id', why: 'A business asks; a qualifier is never signed up to an introduction by somebody else.' }),
      policy('intro_update_party', { for: 'update', using: 'auth.uid() = business_id or auth.uid() = qualifier_id', check: 'auth.uid() = business_id or auth.uid() = qualifier_id', why: 'Either side records or withdraws interest.' }),
    ],
  }),

  table(Table.UNLOCKS, {
    purpose: 'THE MONEY TABLE. One row per paid connection. Written by the payment '
      + 'webhook, never by a client.',
    columns: [
      ID,
      col('opportunity_id', 'uuid', { nullable: false, references: `public.${Table.OPPORTUNITIES}(id) on delete cascade` }),
      col('contractor_id', 'uuid', { nullable: false, references: 'auth.users(id) on delete cascade' }),
      col('price_cents', 'integer', { nullable: false }),
      col('band_id', 'text', { nullable: false }),
      col('status', 'text', { nullable: false, default: "'PENDING'" }),
      col('provider', 'text'),
      col('provider_ref', 'text', { note: 'The payment record. No card data, ever — see the note below.' }),
      CREATED,
    ],
    constraints: [
      'unique (opportunity_id, contractor_id)',
      "check (status in ('PENDING','PAID','REFUNDED','FAILED'))",
      'check (price_cents > 0)',
    ],
    policies: [
      policy('unlocks_select_own', { for: 'select', using: 'auth.uid() = contractor_id', why: 'A contractor sees their own unlocks and nothing else.' }),
      policy('unlocks_select_by_owner', {
        for: 'select',
        using: `exists (select 1 from public.${Table.OPPORTUNITIES} o where o.id = public.${Table.UNLOCKS}.opportunity_id and o.owner_id = auth.uid())`,
        why: 'The person who posted the job can see who has unlocked it. They are about to '
          + 'get three phone calls; they should know.',
      }),
      // Deliberately NO insert or update policy for clients. The absence is the
      // control: with RLS on and no policy, the operation is denied outright.
    ],
    indexes: ['(opportunity_id)', '(contractor_id)'],
  }),

  table(Table.VERIFICATION_RECORDS, {
    purpose: 'What was checked, where it came from, and when — the provenance '
      + 'discipline sources.js already enforces, in a table.',
    columns: [
      ID, OWNER,
      col('subject_kind', 'text'),
      col('licence_number', 'text'),
      col('source_id', 'text', { nullable: false }),
      col('source_url', 'text', { nullable: false }),
      col('retrieved_at', 'timestamptz', { nullable: false }),
      col('result', 'text'),
      col('confidence', 'text', { default: "'OFFICIAL'" }),
      CREATED,
    ],
    policies: [
      policy('verification_select_own', { for: 'select', using: 'auth.uid() = owner_id', why: 'Your own verification history.' }),
    ],
  }),

  table(Table.MODERATION_FLAGS, {
    purpose: 'One row per flag per submission. The exception queue reads this.',
    columns: [
      ID,
      col('subject_table', 'text', { nullable: false }),
      col('subject_id', 'uuid', { nullable: false }),
      col('flag', 'text', { nullable: false }),
      col('resolved', 'boolean', { nullable: false, default: 'false' }),
      CREATED,
    ],
    // No client policies at all. Moderation state is not something the moderated
    // party reads, and certainly not something they clear.
    policies: [],
  }),

  table(Table.SAVED_ITEMS, {
    purpose: 'Bookmarks.',
    columns: [
      ID, OWNER,
      col('kind', 'text', { nullable: false }),
      col('subject_id', 'uuid', { nullable: false }),
      CREATED,
    ],
    constraints: ['unique (owner_id, kind, subject_id)'],
    policies: [
      policy('saved_all_own', { for: 'all', using: 'auth.uid() = owner_id', check: 'auth.uid() = owner_id', why: 'Entirely yours.' }),
    ],
  }),

  table(Table.AUDIT_EVENTS, {
    purpose: 'Every status transition. Append-only, and never client-writable — '
      + 'an audit log a client can write is not an audit log.',
    columns: [
      ID,
      col('actor_id', 'uuid'),
      col('subject_table', 'text', { nullable: false }),
      col('subject_id', 'uuid', { nullable: false }),
      col('from_status', 'text'),
      col('to_status', 'text'),
      col('detail', 'jsonb'),
      CREATED,
    ],
    policies: [],
  }),
]);

export const tableByName = (name) => SCHEMA.find((t) => t.name === name) ?? null;

/**
 * Card data is never stored, and this is where somebody would be tempted.
 *
 * Mirrors the rule already in force for invoices: the provider holds the
 * instrument, we hold a reference. No column below may ever be added.
 */
export const NEVER_STORED = Object.freeze([
  'card numbers', 'CVV', 'bank credentials', 'full SSN', 'government ID images',
]);

/** The only key that may appear in the shipped app. */
export const CLIENT_KEY_RULE = Object.freeze({
  ships: 'SUPABASE_ANON_KEY',
  neverShips: 'SUPABASE_SERVICE_ROLE_KEY',
  because: 'The anon key is public by design and is only as powerful as the policies above '
    + 'allow. The service_role key bypasses every one of them, and any key inside a shipped '
    + 'binary can be extracted from it in minutes.',
  serviceRoleLivesIn: 'Server-side functions only — the payment webhook and the verification '
    + 'job, which are the two things that write money and trust.',
});

// ─── Triggers ────────────────────────────────────────────────────────────────
// The rules RLS structurally cannot express.
//
// RLS answers "may this row be seen or written by this user". It cannot answer
// "did this column change" or "is this the fourth unlock", because both are
// comparisons between rows. Documenting a protection a trigger provides while
// not writing the trigger is worse than having neither — it reads as covered.

export const TRIGGERS = Object.freeze([
  Object.freeze({
    name: 'lock_verified_flag',
    on: [Table.CONTRACTOR_PROFILES, Table.QUALIFIER_PROFILES],
    when: 'before update',
    why: 'A self-set verified flag defeats the entire product in one UPDATE. The column '
      + 'moves only from the verification job, which runs with elevated rights and sets '
      + 'a session flag this trigger honours.',
    body: `begin
  if new.verified is distinct from old.verified
     and coalesce(current_setting('app.verification_job', true), '') <> 'on' then
    raise exception 'verified is not client-writable';
  end if;
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id is immutable';
  end if;
  return new;
end;`,
  }),
  Object.freeze({
    name: 'seal_opportunity_pricing',
    on: [Table.OPPORTUNITIES],
    when: 'before insert or update',
    why: 'band_id and max_unlocks decide what a lead costs and how many people may buy it. '
      + 'A client that can set its own band can set every job to the $29 band; a client '
      + 'that can raise max_unlocks can sell one homeowner to fifteen contractors.',
    body: `declare
  v bigint := coalesce(new.value_cents, 0);
begin
  new.band_id := case
    when v >= 5000000 then 'MAJOR'
    when v >= 1500000 then 'LARGE'
    when v >= 500000  then 'MID'
    when v > 0        then 'SMALL'
    else null end;
  new.max_unlocks := case when new.band_id = 'MAJOR' then 2 else 3 end;
  if tg_op = 'UPDATE' then
    new.unlock_count := old.unlock_count;
    new.owner_id := old.owner_id;
    -- An owner may withdraw, never reopen past the cap.
    if new.status = 'OPEN' and old.unlock_count >= new.max_unlocks then
      new.status := 'FULL';
    end if;
  else
    new.unlock_count := 0;
  end if;
  return new;
end;`,
  }),
  Object.freeze({
    name: 'count_unlock',
    on: [Table.UNLOCKS],
    when: 'after insert or update',
    why: 'THE CAP. Enforced in the database because a cap in application code is a cap that '
      + 'a retry, a race between two simultaneous purchases, or a rebuilt client walks '
      + 'straight past. The row lock is what makes two concurrent unlocks safe.',
    body: `declare
  cap integer;
  used integer;
begin
  if new.status <> 'PAID' then return new; end if;
  select max_unlocks into cap from public.opportunities where id = new.opportunity_id for update;
  select count(*) into used from public.unlocks
    where opportunity_id = new.opportunity_id and status = 'PAID';
  if used > cap then
    raise exception 'opportunity % is full', new.opportunity_id;
  end if;
  update public.opportunities
     set unlock_count = used,
         status = case when used >= cap then 'FULL' else status end
   where id = new.opportunity_id;
  return new;
end;`,
  }),
]);

// ─── Generation ──────────────────────────────────────────────────────────────

const ddlColumn = (c) => {
  const parts = [`  ${c.name} ${c.type}`];
  if (!c.nullable) parts.push('not null');
  if (c.default) parts.push(`default ${c.default}`);
  if (c.references) parts.push(`references ${c.references}`);
  return parts.join(' ');
};

const wrap = (s) => s.replace(/\s+/g, ' ').replace(/(.{1,74})(\s|$)/g, '-- $1\n').trimEnd();

/**
 * The committed migration is generated from SCHEMA. A test proves they match.
 *
 * THREE PASSES, AND THE ORDER IS LOAD-BEARING. Every table exists before any
 * policy is created, because the policy that matters most — the one gating
 * contact details — reads the unlocks table, which is declared after it. A
 * single pass emits that policy against a table that does not exist yet and the
 * migration dies halfway through, leaving a half-secured database.
 */
export const toSql = () => {
  const out = [
    '-- GENERATED FILE. Do not edit.',
    '-- Source: src/core/connect/schema.js — run `npm run connect:schema`.',
    '--',
    '-- Every table denies by default: RLS is enabled and only the policies below',
    '-- open anything. A table with no policy is reachable from the server only.',
    '--',
    '-- The app ships the ANON key. It is public by design and is worth exactly',
    '-- what these policies allow. The service_role key bypasses all of them and',
    '-- never leaves the server.',
    '',
    'create extension if not exists pgcrypto;',
    '',
    '-- ─── TABLES ───────────────────────────────────────────────────────────────',
    '',
  ];

  for (const t of SCHEMA) {
    out.push(wrap(t.purpose));
    out.push(`create table if not exists public.${t.name} (`);
    const body = t.columns.map(ddlColumn);
    body[0] += ' primary key';
    out.push([...body, ...t.constraints.map((c) => `  ${c}`)].join(',\n'));
    out.push(');');
    out.push(`alter table public.${t.name} enable row level security;`);
    for (const i of t.indexes) {
      out.push(`create index if not exists ${t.name}_${i.replace(/[^a-z_]/g, '')}_idx on public.${t.name} ${i};`);
    }
    out.push('');
  }

  out.push('-- ─── POLICIES ─────────────────────────────────────────────────────────────');
  out.push('--');
  out.push('-- Created after every table, because a policy may reference another table.');
  out.push('');
  for (const t of SCHEMA) {
    if (t.policies.length === 0) {
      out.push(`-- ${t.name}: no client policies. Server-side functions only.`);
      out.push('');
      continue;
    }
    for (const p of t.policies) {
      out.push(wrap(p.why));
      const clauses = [];
      if (p.using) clauses.push(`using (${p.using})`);
      if (p.check) clauses.push(`with check (${p.check})`);
      out.push(`create policy ${p.name} on public.${t.name} for ${p.for} to ${p.to} ${clauses.join(' ')};`);
    }
    out.push('');
  }

  out.push('-- ─── TRIGGERS ─────────────────────────────────────────────────────────────');
  out.push('--');
  out.push('-- What RLS structurally cannot express: "this column did not change", and');
  out.push('-- "this is not the fourth unlock".');
  out.push('');
  for (const tr of TRIGGERS) {
    out.push(wrap(tr.why));
    out.push(`create or replace function public.${tr.name}() returns trigger`);
    out.push('language plpgsql security definer set search_path = public as $$');
    out.push(tr.body);
    out.push('$$;');
    for (const on of tr.on) {
      out.push(`drop trigger if exists ${tr.name}_${on} on public.${on};`);
      out.push(`create trigger ${tr.name}_${on} ${tr.when} on public.${on}`);
      out.push(`  for each row execute function public.${tr.name}();`);
    }
    out.push('');
  }

  return out.join('\n');
};
