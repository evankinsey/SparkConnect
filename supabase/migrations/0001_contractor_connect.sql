-- GENERATED FILE. Do not edit.
-- Source: src/core/connect/schema.js — run `npm run connect:schema`.
--
-- Every table denies by default: RLS is enabled and only the policies below
-- open anything. A table with no policy is reachable from the server only.
--
-- The app ships the ANON key. It is public by design and is worth exactly
-- what these policies allow. The service_role key bypasses all of them and
-- never leaves the server.

create extension if not exists pgcrypto;

-- ─── TABLES ───────────────────────────────────────────────────────────────

-- One row per account. Identity only — no licence claims live here.
create table if not exists public.profiles (
  id uuid not null references auth.users(id) on delete cascade primary key,
  display_name text,
  contact_email text,
  contact_phone text,
  preferred_contact text default 'EMAIL',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- The browsable half of a posted job. Contains NOTHING identifying — that is
-- a separate table, so a leaked query cannot leak a homeowner.
create table if not exists public.opportunities (
  id uuid not null default gen_random_uuid() primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  trade text not null,
  location text not null,
  project_type text,
  scope text,
  value_cents bigint,
  band_id text,
  plans_available boolean default false,
  desired_start text,
  status text not null default 'PENDING_REVIEW',
  unlock_count integer not null default 0,
  max_unlocks integer not null default 3,
  created_at timestamptz not null default now(),
  check (unlock_count >= 0 and unlock_count <= max_unlocks),
  check (status in ('DRAFT','PENDING_REVIEW','OPEN','FULL','CLOSED','WITHDRAWN'))
);
alter table public.opportunities enable row level security;
create index if not exists opportunities_statustradeband_id_idx on public.opportunities (status, trade, band_id);
create index if not exists opportunities_owner_id_idx on public.opportunities (owner_id);

-- THE LOCKED HALF. Split from opportunities so that "who this is" is
-- reachable only through a policy that reads the unlocks table.
create table if not exists public.opportunity_contacts (
  id uuid not null default gen_random_uuid() primary key,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_name text,
  contact_email text,
  contact_phone text,
  address text,
  created_at timestamptz not null default now()
);
alter table public.opportunity_contacts enable row level security;
create index if not exists opportunity_contacts_opportunity_id_idx on public.opportunity_contacts (opportunity_id);

-- A licensed contractor, and whether anybody has actually checked.
create table if not exists public.contractor_profiles (
  id uuid not null default gen_random_uuid() primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  business_name text,
  licence_number text,
  jurisdiction_id text,
  trades text[],
  service_areas text[],
  verified boolean not null default false,
  verification_state text default 'UNCHECKED',
  created_at timestamptz not null default now(),
  check (verification_state in ('UNCHECKED','PENDING','VERIFIED','AMBIGUOUS','FAILED'))
);
alter table public.contractor_profiles enable row level security;
create index if not exists contractor_profiles_owner_id_idx on public.contractor_profiles (owner_id);
create index if not exists contractor_profiles_licence_number_idx on public.contractor_profiles (licence_number);

-- A licensed professional open to qualifying a company.
create table if not exists public.qualifier_profiles (
  id uuid not null default gen_random_uuid() primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  licence_number text,
  jurisdiction_id text,
  open_to_relationships boolean default false,
  terms text,
  verified boolean not null default false,
  verification_state text default 'UNCHECKED',
  created_at timestamptz not null default now()
);
alter table public.qualifier_profiles enable row level security;

-- A qualifier introduction. Charged only when both sides have said yes.
create table if not exists public.intro_requests (
  id uuid not null default gen_random_uuid() primary key,
  business_id uuid not null references auth.users(id) on delete cascade,
  qualifier_id uuid not null references auth.users(id) on delete cascade,
  business_interested boolean default false,
  qualifier_interested boolean default false,
  status text not null default 'PENDING',
  paid_at timestamptz,
  compliance_reviewed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.intro_requests enable row level security;

-- THE MONEY TABLE. One row per paid connection. Written by the payment
-- webhook, never by a client.
create table if not exists public.unlocks (
  id uuid not null default gen_random_uuid() primary key,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  contractor_id uuid not null references auth.users(id) on delete cascade,
  price_cents integer not null,
  band_id text not null,
  status text not null default 'PENDING',
  provider text,
  provider_ref text,
  created_at timestamptz not null default now(),
  unique (opportunity_id, contractor_id),
  check (status in ('PENDING','PAID','REFUNDED','FAILED')),
  check (price_cents > 0)
);
alter table public.unlocks enable row level security;
create index if not exists unlocks_opportunity_id_idx on public.unlocks (opportunity_id);
create index if not exists unlocks_contractor_id_idx on public.unlocks (contractor_id);

-- What was checked, where it came from, and when — the provenance discipline
-- sources.js already enforces, in a table.
create table if not exists public.verification_records (
  id uuid not null default gen_random_uuid() primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  subject_kind text,
  licence_number text,
  source_id text not null,
  source_url text not null,
  retrieved_at timestamptz not null,
  result text,
  confidence text default 'OFFICIAL',
  created_at timestamptz not null default now()
);
alter table public.verification_records enable row level security;

-- One row per flag per submission. The exception queue reads this.
create table if not exists public.moderation_flags (
  id uuid not null default gen_random_uuid() primary key,
  subject_table text not null,
  subject_id uuid not null,
  flag text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.moderation_flags enable row level security;

-- Bookmarks.
create table if not exists public.saved_items (
  id uuid not null default gen_random_uuid() primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  subject_id uuid not null,
  created_at timestamptz not null default now(),
  unique (owner_id, kind, subject_id)
);
alter table public.saved_items enable row level security;

-- Every status transition. Append-only, and never client-writable — an audit
-- log a client can write is not an audit log.
create table if not exists public.audit_events (
  id uuid not null default gen_random_uuid() primary key,
  actor_id uuid,
  subject_table text not null,
  subject_id uuid not null,
  from_status text,
  to_status text,
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_events enable row level security;

-- ─── POLICIES ─────────────────────────────────────────────────────────────
--
-- Created after every table, because a policy may reference another table.

-- Your own profile, and nobody else’s.
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
-- You cannot create a profile for somebody else.
create policy profiles_upsert_own on public.profiles for insert to authenticated with check (auth.uid() = id);
-- And you cannot reassign one away from yourself.
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Previews are public to signed-in users. This table holds nothing
-- identifying, which is what makes that safe.
create policy opportunities_browse_open on public.opportunities for select to authenticated using (status = 'OPEN');
-- Your own postings at any status.
create policy opportunities_select_own on public.opportunities for select to authenticated using (auth.uid() = owner_id);
-- You post as yourself.
create policy opportunities_insert_own on public.opportunities for insert to authenticated with check (auth.uid() = owner_id);
-- Edit and withdraw your own. Status, band and unlock_count are additionally
-- protected by a trigger — an owner cannot set their own price band or
-- reopen a full opportunity.
create policy opportunities_update_own on public.opportunities for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- The person who posted it can always see it.
create policy contacts_select_own on public.opportunity_contacts for select to authenticated using (auth.uid() = owner_id);
-- THE LOAD-BEARING POLICY. A paid unlock row is the only key to a contact.
-- No unlock, no row — not a masked row, no row.
create policy contacts_select_unlocked on public.opportunity_contacts for select to authenticated using (exists (select 1 from public.unlocks u where u.opportunity_id = opportunity_contacts.opportunity_id and u.contractor_id = auth.uid() and u.status = 'PAID'));
-- Written with the opportunity it belongs to.
create policy contacts_insert_own on public.opportunity_contacts for insert to authenticated with check (auth.uid() = owner_id);
-- Correct your own details.
create policy contacts_update_own on public.opportunity_contacts for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Your own profile.
create policy contractor_select_own on public.contractor_profiles for select to authenticated using (auth.uid() = owner_id);
-- You may create your profile. You may not create it verified.
create policy contractor_insert_own on public.contractor_profiles for insert to authenticated with check (auth.uid() = owner_id and verified = false);
-- Edit your own details. The verified flag is held immutable by a TRIGGER,
-- not by this policy — RLS checks a row, and "this column did not change" is
-- a comparison between two rows that only a trigger can see.
create policy contractor_update_own on public.contractor_profiles for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Your own profile.
create policy qualifier_select_own on public.qualifier_profiles for select to authenticated using (auth.uid() = owner_id);
-- Previews of people who have opted in AND been verified. Nobody is listed
-- without asking them — the opt-in is a column, not a policy we remember.
create policy qualifier_browse_verified on public.qualifier_profiles for select to authenticated using (verified = true and open_to_relationships = true);
-- Not self-verified.
create policy qualifier_insert_own on public.qualifier_profiles for insert to authenticated with check (auth.uid() = owner_id and verified = false);
-- Withdraw or change your terms at any time.
create policy qualifier_update_own on public.qualifier_profiles for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Only the two parties.
create policy intro_select_party on public.intro_requests for select to authenticated using (auth.uid() = business_id or auth.uid() = qualifier_id);
-- A business asks; a qualifier is never signed up to an introduction by
-- somebody else.
create policy intro_insert_business on public.intro_requests for insert to authenticated with check (auth.uid() = business_id);
-- Either side records or withdraws interest.
create policy intro_update_party on public.intro_requests for update to authenticated using (auth.uid() = business_id or auth.uid() = qualifier_id) with check (auth.uid() = business_id or auth.uid() = qualifier_id);

-- A contractor sees their own unlocks and nothing else.
create policy unlocks_select_own on public.unlocks for select to authenticated using (auth.uid() = contractor_id);
-- The person who posted the job can see who has unlocked it. They are about
-- to get three phone calls; they should know.
create policy unlocks_select_by_owner on public.unlocks for select to authenticated using (exists (select 1 from public.opportunities o where o.id = public.unlocks.opportunity_id and o.owner_id = auth.uid()));

-- Your own verification history.
create policy verification_select_own on public.verification_records for select to authenticated using (auth.uid() = owner_id);

-- moderation_flags: no client policies. Server-side functions only.

-- Entirely yours.
create policy saved_all_own on public.saved_items for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- audit_events: no client policies. Server-side functions only.

-- ─── TRIGGERS ─────────────────────────────────────────────────────────────
--
-- What RLS structurally cannot express: "this column did not change", and
-- "this is not the fourth unlock".

-- A self-set verified flag defeats the entire product in one UPDATE. The
-- column moves only from the verification job, which runs with elevated
-- rights and sets a session flag this trigger honours.
create or replace function public.lock_verified_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verified is distinct from old.verified
     and coalesce(current_setting('app.verification_job', true), '') <> 'on' then
    raise exception 'verified is not client-writable';
  end if;
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id is immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists lock_verified_flag_contractor_profiles on public.contractor_profiles;
create trigger lock_verified_flag_contractor_profiles before update on public.contractor_profiles
  for each row execute function public.lock_verified_flag();
drop trigger if exists lock_verified_flag_qualifier_profiles on public.qualifier_profiles;
create trigger lock_verified_flag_qualifier_profiles before update on public.qualifier_profiles
  for each row execute function public.lock_verified_flag();

-- band_id and max_unlocks decide what a lead costs and how many people may
-- buy it. A client that can set its own band can set every job to the $29
-- band; a client that can raise max_unlocks can sell one homeowner to
-- fifteen contractors.
create or replace function public.seal_opportunity_pricing() returns trigger
language plpgsql security definer set search_path = public as $$
declare
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
end;
$$;
drop trigger if exists seal_opportunity_pricing_opportunities on public.opportunities;
create trigger seal_opportunity_pricing_opportunities before insert or update on public.opportunities
  for each row execute function public.seal_opportunity_pricing();

-- THE CAP. Enforced in the database because a cap in application code is a
-- cap that a retry, a race between two simultaneous purchases, or a rebuilt
-- client walks straight past. The row lock is what makes two concurrent
-- unlocks safe.
create or replace function public.count_unlock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
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
end;
$$;
drop trigger if exists count_unlock_unlocks on public.unlocks;
create trigger count_unlock_unlocks after insert or update on public.unlocks
  for each row execute function public.count_unlock();
