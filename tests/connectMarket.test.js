// ─── THE SELF-SERVE MARKETPLACE ──────────────────────────────────────────────
// Two properties, and everything below defends one of them.
//
//   1. A contact detail is never reachable without a paid unlock, and the cap
//      on an opportunity cannot be exceeded. Those protect the person who
//      posted a job from becoming a lead sold fifteen times.
//   2. The normal successful path requires no administrator. The moment a step
//      on the happy path needs a human, the business model has quietly become
//      "the founder brokers introductions for free" again.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import {
  Band, BANDS, bandFor, bandById, parseValueCents, formatPrice,
  opportunityPreview, OpportunityStatus, canUnlock, UnlockRefusal,
  PREVIEW_FIELDS, LOCKED_FIELDS, PRICE_LIST, PriceItem, priceItem,
  livePriceItems, FREE_BY_DESIGN, NO_SUCCESS_FEE,
} from '../src/core/connect/market.js';
import {
  HAPPY_PATH, manualStepsOnHappyPath, Exception, EXCEPTIONS, exceptionById,
  exceptionsFor, HIGH_VALUE_CENTS, COMPLIANCE_NOTE, findRentalFraming,
  assertNoRentalFraming, READINESS, marketplaceReady, PRELAUNCH,
} from '../src/core/connect/operations.js';
import { SCHEMA, Table, TRIGGERS, toSql, CLIENT_KEY_RULE, NEVER_STORED } from '../src/core/connect/schema.js';
import { BACKEND, looksLikeServiceKey, keyIsSafe, BUILD_ORDER } from '../src/core/connect/backend.js';

const verified = { id: 'c1', verified: true };
const opp = (over = {}) => ({
  id: 'o1', ownerId: 'owner1', status: OpportunityStatus.OPEN,
  valueCents: 2000000, trade: 'ELECTRICAL', location: 'Tampa, Hillsborough',
  projectType: 'Restaurant renovation', unlockCount: 0,
  postedAt: new Date().toISOString(), ...over,
});

// ─── Pricing ─────────────────────────────────────────────────────────────────

test('a job is banded by what it is worth', () => {
  assert.equal(bandFor(300000).id, Band.SMALL);
  assert.equal(bandFor(500000).id, Band.MID, 'the boundary belongs to the higher band');
  assert.equal(bandFor(2000000).id, Band.LARGE);
  assert.equal(bandFor(9000000).id, Band.MAJOR);
  assert.equal(bandFor(0).id, Band.SMALL);
});

test('a job with no stated value has no band and therefore no price', () => {
  for (const v of [null, undefined, '', NaN, -1]) {
    assert.equal(bandFor(v), null, `${v} produced a band`);
  }
  const p = opportunityPreview(opp({ valueCents: null, bandId: null }));
  assert.equal(p.unlockCents, null, 'an unbanded job must not carry a price');
  const gate = canUnlock({ opportunity: opp({ valueCents: null, bandId: null }), contractor: verified });
  assert.equal(gate.reason, UnlockRefusal.NO_BAND);
});

test('a stated range resolves to its low end', () => {
  // "$15k-$25k" must not be read as LARGE-priced on the strength of the top of
  // somebody's guess. Low end is the reading that cannot overcharge.
  assert.equal(parseValueCents('$15,000 - $25,000'), 1500000);
  assert.equal(parseValueCents('8k to 12k'), 800000);
  assert.equal(parseValueCents('$4,500'), 450000);
  assert.equal(parseValueCents('1.2m'), 120000000);
  assert.equal(parseValueCents('no idea'), null);
});

test('prices are whole cents and render as money', () => {
  for (const b of BANDS) {
    assert.ok(Number.isInteger(b.unlockCents) && b.unlockCents > 0, `${b.id} price is not integer cents`);
  }
  assert.equal(formatPrice(7900), '$79');
  assert.equal(formatPrice(2900), '$29');
  // The bands must rise with value, or a big job is cheaper than a small one.
  const prices = BANDS.map((b) => b.unlockCents);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
});

// ─── The preview, and what payment buys ──────────────────────────────────────

test('a preview contains nothing that identifies anybody', () => {
  const p = opportunityPreview({
    ...opp(),
    contactName: 'Jane Doe', contactEmail: 'jane@example.com',
    contactPhone: '813-555-0148', address: '412 Palm Ave',
  });
  const json = JSON.stringify(p);
  for (const leak of ['Jane Doe', 'jane@example.com', '555-0148', 'Palm Ave']) {
    assert.ok(!json.includes(leak), `the preview leaked ${leak}`);
  }
  for (const f of LOCKED_FIELDS) {
    assert.equal(p[f], undefined, `${f} is present on the preview object`);
  }
  assert.equal(p.contactLocked, true);
});

test('a preview carries everything needed to decide', () => {
  const p = opportunityPreview(opp());
  for (const f of ['trade', 'location', 'band', 'projectType', 'postedAt']) {
    assert.ok(p[f] !== undefined && p[f] !== null, `a buyer cannot see ${f}`);
  }
  assert.equal(p.unlockPrice, '$79');
  assert.equal(p.scarcityLabel, '3 of 3 contractor connections remaining');
  assert.ok(PREVIEW_FIELDS.every((f) => f in p || f === 'band'));
});

test('scarcity counts down and is real', () => {
  assert.match(opportunityPreview(opp({ unlockCount: 1 })).scarcityLabel, /^2 of 3/);
  assert.match(opportunityPreview(opp({ unlockCount: 2 })).scarcityLabel, /^1 of 3/);
  const full = opportunityPreview(opp({ unlockCount: 3 }));
  assert.equal(full.unlocksRemaining, 0);
  assert.equal(full.open, false);
});

test('the biggest jobs take fewer contractors, not more', () => {
  assert.equal(bandById(Band.MAJOR).maxUnlocks, 2);
  assert.ok(bandById(Band.MAJOR).maxUnlocks < bandById(Band.SMALL).maxUnlocks,
    'at $50k the holder is choosing somebody, not collecting quotes');
});

// ─── The gate ────────────────────────────────────────────────────────────────

test('an unverified contractor cannot unlock anything', () => {
  const r = canUnlock({ opportunity: opp(), contractor: { id: 'c9', verified: false } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, UnlockRefusal.NOT_VERIFIED);
  // Verification is the product, so the refusal explains rather than scolds.
  assert.match(r.message, /verified contractors/i);
});

test('the cap holds, and the refusal says why it exists', () => {
  const existing = [
    { opportunityId: 'o1', contractorId: 'a' },
    { opportunityId: 'o1', contractorId: 'b' },
    { opportunityId: 'o1', contractorId: 'c' },
  ];
  const r = canUnlock({ opportunity: opp(), contractor: verified, existingUnlocks: existing });
  assert.equal(r.reason, UnlockRefusal.CAP_REACHED);
  assert.match(r.message, /three contractors instead of fifteen/);
});

test('nobody pays twice for the same opportunity', () => {
  const r = canUnlock({
    opportunity: opp(), contractor: verified,
    existingUnlocks: [{ opportunityId: 'o1', contractorId: 'c1' }],
  });
  assert.equal(r.reason, UnlockRefusal.ALREADY_UNLOCKED);
});

test('a clean unlock returns the price and what is left after it', () => {
  const r = canUnlock({ opportunity: opp(), contractor: verified, existingUnlocks: [] });
  assert.equal(r.ok, true);
  assert.equal(r.priceCents, 7900);
  assert.equal(r.remainingAfter, 2);
});

test('a closed opportunity and your own opportunity are both refused', () => {
  assert.equal(canUnlock({ opportunity: opp({ status: OpportunityStatus.CLOSED }), contractor: verified }).reason,
    UnlockRefusal.NOT_OPEN);
  assert.equal(canUnlock({ opportunity: opp({ ownerId: 'c1' }), contractor: verified }).reason,
    UnlockRefusal.OWN_OPPORTUNITY);
});

// ─── The price list ──────────────────────────────────────────────────────────

test('supply is free and only access is charged for', () => {
  const free = FREE_BY_DESIGN.map((f) => f.what.toLowerCase()).join(' ');
  for (const s of ['posting an opportunity', 'qualifier profile', 'browsing previews', 'verification']) {
    assert.ok(free.includes(s), `${s} is not on the free list`);
  }
  for (const f of FREE_BY_DESIGN) assert.ok(f.why.length > 20, `${f.what} has no stated reason`);
});

test('a subscription cannot go live before there is inventory for it', () => {
  const pro = priceItem(PriceItem.CONTRACTOR_PRO);
  assert.equal(pro.live, false, 'nobody pays $149 a month to browse an empty room');
  assert.ok(pro.liveWhen, 'the condition for launching it is not written down');
  assert.equal(priceItem(PriceItem.RELATIONSHIP_PRO).live, false);
  // Only the two transactional items are live.
  assert.deepEqual(livePriceItems().map((p) => p.id).sort(),
    [PriceItem.OPPORTUNITY_UNLOCK, PriceItem.QUALIFIER_INTRODUCTION].sort());
});

test('a qualifier introduction is charged only on mutual interest', () => {
  const intro = priceItem(PriceItem.QUALIFIER_INTRODUCTION);
  assert.equal(intro.requiresMutualInterest, true,
    'charging to contact somebody who has not agreed is selling a rejection');
});

test('nothing sold promises an outcome', () => {
  for (const p of PRICE_LIST) {
    assert.ok(p.buys, `${p.id} does not say what it buys`);
    assert.doesNotMatch(p.buys, /\bwin\b|\bguarantee/i, `${p.id} promises an outcome`);
  }
  assert.match(priceItem(PriceItem.OPPORTUNITY_UNLOCK).doesNotBuy, /not.*contract|contract.*not/i);
  assert.match(NO_SUCCESS_FEE.decision, /access, not.*outcomes/i);
});

// ─── Founder-touch economics ─────────────────────────────────────────────────

test('THE PRINCIPLE: no step on the happy path needs an administrator', () => {
  const manual = manualStepsOnHappyPath();
  assert.deepEqual([...manual], [],
    `the normal successful path requires a human at: ${manual.map((s) => s.id).join(', ')}`);
  for (const s of HAPPY_PATH) {
    assert.ok(s.automatedBy?.length > 10, `${s.id} does not say what automates it`);
  }
  // The path has to actually be a complete transaction, not three easy steps.
  const ids = HAPPY_PATH.map((s) => s.id);
  for (const needed of ['post', 'discover', 'qualify', 'pay', 'reveal', 'connect', 'close']) {
    assert.ok(ids.includes(needed), `the happy path has no ${needed} step`);
  }
});

test('every exception justifies the time it costs', () => {
  for (const e of EXCEPTIONS) {
    assert.ok(e.whyWorthIt?.length > 30, `${e.id} does not justify a human looking at it`);
  }
  assert.equal(EXCEPTIONS.length, Object.keys(Exception).length);
});

test('an ordinary transaction raises no exception at all', () => {
  const r = exceptionsFor({
    opportunity: opp(),
    profile: { verificationState: 'VERIFIED' },
    moderation: [], signals: {},
  });
  assert.equal(r.needsReview, false, 'the common case must not reach a queue');
  assert.deepEqual([...r.reasons], []);
});

test('the cases that should reach a person, do', () => {
  const cases = [
    [{ profile: { verificationState: 'FAILED' } }, Exception.VERIFICATION_FAILED],
    [{ profile: { verificationState: 'AMBIGUOUS' } }, Exception.LICENCE_AMBIGUOUS],
    [{ moderation: ['OUTCOME_PROMISE'] }, Exception.MODERATION],
    [{ signals: { duplicateLicence: true } }, Exception.FRAUD_SUSPECTED],
    [{ signals: { qualifierSupervisionUnclear: true } }, Exception.COMPLIANCE],
    [{ signals: { disputed: true } }, Exception.DISPUTE],
    [{ opportunity: opp({ valueCents: HIGH_VALUE_CENTS }) }, Exception.HIGH_VALUE],
  ];
  for (const [input, expected] of cases) {
    const r = exceptionsFor(input);
    assert.ok(r.reasons.includes(expected), `${expected} did not reach the queue`);
  }
});

test('a compliance concern always blocks, and never resolves itself', () => {
  const e = exceptionById(Exception.COMPLIANCE);
  assert.equal(e.blocksTransaction, true);
  const r = exceptionsFor({ signals: { qualifierSupervisionUnclear: true } });
  assert.ok(r.blocking.includes(Exception.COMPLIANCE));
});

// ─── The line that is not a marketplace risk ─────────────────────────────────

test('a qualifier is never framed as something to rent', () => {
  for (const bad of [
    'rent a license for your business',
    'buy a qualifier',
    'use somebody else\'s license',
    'no supervision required',
    'a qualifier who signs off on your permits',
  ]) {
    assert.ok(findRentalFraming(bad), `missed rental framing: "${bad}"`);
  }
  for (const ok of [
    'A qualifying agent takes on legal responsibility for the work.',
    'Find a licensed professional open to qualifying a company.',
    'Your state board publishes what the arrangement requires.',
  ]) {
    assert.equal(findRentalFraming(ok), null, `false positive: "${ok}"`);
  }
  assert.throws(() => assertNoRentalFraming('rent a license', 'test'), /rent/);
});

test('every shipped string in the connect module survives both scanners', async () => {
  const { findOutcomePromise } = await import('../src/core/connect/index.js');
  const strings = [
    COMPLIANCE_NOTE.headline, COMPLIANCE_NOTE.body,
    PRELAUNCH.headline, PRELAUNCH.body,
    ...PRICE_LIST.flatMap((p) => [p.label, p.buys, p.doesNotBuy].filter(Boolean)),
    ...EXCEPTIONS.map((e) => e.detail),
  ];
  for (const s of strings) {
    assert.equal(findRentalFraming(s), null, `rental framing in shipped copy: "${s}"`);
    assert.equal(findOutcomePromise(s), null, `outcome promise in shipped copy: "${s}"`);
  }
  assert.equal(COMPLIANCE_NOTE.everyIntroductionCarries, true);
});

// ─── The schema ──────────────────────────────────────────────────────────────

test('every table has row-level security on', () => {
  const sql = toSql();
  for (const t of SCHEMA) {
    assert.match(sql, new RegExp(`alter table public\\.${t.name} enable row level security;`),
      `${t.name} would be fully readable by anybody holding the public key`);
  }
});

test('contact details are reachable only through a paid unlock row', () => {
  const contacts = SCHEMA.find((t) => t.name === Table.OPPORTUNITY_CONTACTS);
  const unlocked = contacts.policies.find((p) => p.name === 'contacts_select_unlocked');
  assert.ok(unlocked, 'the policy gating contact details is gone');
  assert.match(unlocked.using, /from public\.unlocks/);
  assert.match(unlocked.using, /contractor_id = auth\.uid\(\)/);
  assert.match(unlocked.using, /status = 'PAID'/,
    'an unpaid or refunded unlock must not open a contact');

  // And the browsable table must not carry them at all.
  const browsable = SCHEMA.find((t) => t.name === Table.OPPORTUNITIES);
  for (const c of browsable.columns) {
    assert.doesNotMatch(c.name, /contact|address|phone|email/,
      `${c.name} is on the publicly browsable table`);
  }
});

test('a client cannot write its own unlock, verification or audit row', () => {
  const unlocks = SCHEMA.find((t) => t.name === Table.UNLOCKS);
  const writes = unlocks.policies.filter((p) => ['insert', 'update', 'all'].includes(p.for));
  assert.deepEqual(writes, [], 'a client that can insert an unlock gets every lead free');

  for (const name of [Table.MODERATION_FLAGS, Table.AUDIT_EVENTS]) {
    const t = SCHEMA.find((x) => x.name === name);
    assert.deepEqual([...t.policies], [], `${name} is client-reachable`);
  }
  const sql = toSql();
  assert.match(sql, /audit_events: no client policies/);
});

test('nobody can verify themselves', () => {
  for (const name of [Table.CONTRACTOR_PROFILES, Table.QUALIFIER_PROFILES]) {
    const t = SCHEMA.find((x) => x.name === name);
    const insert = t.policies.find((p) => p.for === 'insert');
    assert.match(insert.check, /verified = false/, `${name} can be created pre-verified`);
  }
  // And the flag is held immutable by a trigger, since RLS cannot compare rows.
  const lock = TRIGGERS.find((t) => t.name === 'lock_verified_flag');
  assert.ok(lock, 'nothing stops an UPDATE setting verified = true');
  assert.match(lock.body, /new\.verified is distinct from old\.verified/);
  assert.match(lock.body, /raise exception/);
});

test('the cap is a database rule, not an application one', () => {
  const trigger = TRIGGERS.find((t) => t.name === 'count_unlock');
  assert.ok(trigger, 'the cap exists only in JavaScript, which a race walks past');
  assert.match(trigger.body, /for update/, 'without a row lock two simultaneous unlocks both pass');
  assert.match(trigger.body, /raise exception/);

  const opps = SCHEMA.find((t) => t.name === Table.OPPORTUNITIES);
  assert.ok(opps.constraints.some((c) => /unlock_count <= max_unlocks/.test(c)),
    'the cap is not also a check constraint');
  const unlocks = SCHEMA.find((t) => t.name === Table.UNLOCKS);
  assert.ok(unlocks.constraints.some((c) => /unique \(opportunity_id, contractor_id\)/.test(c)),
    'the same contractor could be charged twice for one opportunity');
});

test('a client cannot set its own price band', () => {
  const seal = TRIGGERS.find((t) => t.name === 'seal_opportunity_pricing');
  assert.ok(seal, 'band_id is whatever the client says it is');
  assert.match(seal.body, /new\.band_id :=/, 'the band must be assigned server-side');
  assert.match(seal.body, /new\.unlock_count := old\.unlock_count/, 'an owner could reset the counter');
});

test('the committed migration matches the declaration', () => {
  const committed = readFileSync(
    new URL('../supabase/migrations/0001_contractor_connect.sql', import.meta.url), 'utf8');
  assert.equal(committed, toSql(),
    'the migration is stale — run `npm run connect:schema`');
});

test('the migration creates every table before any policy references one', () => {
  const sql = toSql();
  const firstPolicy = sql.indexOf('create policy');
  for (const t of SCHEMA) {
    const created = sql.indexOf(`create table if not exists public.${t.name}`);
    assert.ok(created !== -1 && created < firstPolicy,
      `${t.name} is created after the first policy — the migration would die halfway`);
  }
});

test('the generator refuses to emit a table without RLS', () => {
  // The guard lives in the script, so run it the way CI does.
  const out = execFileSync('node', ['scripts/build-connect-schema.mjs', '--check'], { encoding: 'utf8' });
  assert.match(out, /RLS on all of them/);
});

// ─── Keys ────────────────────────────────────────────────────────────────────

test('a service_role key is recognised and refused', () => {
  const jwt = (role) => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64({ alg: 'HS256' })}.${b64({ role })}.sig`;
  };
  assert.equal(looksLikeServiceKey(jwt('service_role')), true);
  assert.equal(looksLikeServiceKey(jwt('anon')), false);
  assert.equal(keyIsSafe(jwt('service_role')), false,
    'a service_role key in a shipped binary is a full database handover');
  assert.equal(keyIsSafe(jwt('anon')), true);
  assert.equal(keyIsSafe(null), false);
});

test('no key of any kind is committed', () => {
  for (const f of ['backend.js', 'schema.js', 'market.js', 'operations.js']) {
    const src = readFileSync(new URL(`../src/core/connect/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{20,}/, `${f} contains something shaped like a JWT`);
    assert.doesNotMatch(src, /sk_live|sk_test|service_role_key\s*=/, `${f} contains a secret`);
  }
  assert.equal(CLIENT_KEY_RULE.neverShips, 'SUPABASE_SERVICE_ROLE_KEY');
  assert.ok(NEVER_STORED.includes('card numbers'));
});

// ─── The launch gate ─────────────────────────────────────────────────────────

test('the marketplace funnels are closed until every condition is met', () => {
  const r = marketplaceReady(BACKEND.readiness);
  assert.equal(r.ready, false, 'the funnels would open with no backend behind them');
  assert.equal(BACKEND.configured, false, 'a backend is claimed that does not exist');
  // Every named condition is one of the readiness rows, so none can be skipped.
  for (const row of READINESS) {
    assert.ok(row.what?.length > 10, `${row.id} does not say what it means`);
    assert.ok(r.missing.includes(row.id), `${row.id} already reports as satisfied`);
  }
});

test('one satisfied condition does not open the funnels', () => {
  const almost = { backend: true, auth: true, rls: true, payments: true, verification: true };
  const r = marketplaceReady(almost);
  assert.equal(r.ready, false);
  assert.deepEqual([...r.missing], ['exceptionQueue'],
    'the exception queue is the one people skip, so it is the one to check');

  const all = Object.fromEntries(READINESS.map((x) => [x.id, true]));
  assert.equal(marketplaceReady(all).ready, true);
});

test('the screen asks the module rather than deciding for itself', () => {
  const screen = readFileSync(new URL('../src/screens/ContractorConnectScreen.js', import.meta.url), 'utf8');
  assert.match(screen, /marketplaceReady\(BACKEND\.readiness\)/,
    'the screen decides for itself whether the marketplace is open');
  assert.match(screen, /!ready\.ready \?/, 'the funnels are not gated on it');
  // Verify a Licence is a finished product and stays reachable regardless.
  assert.match(screen, /View_\.VERIFY/);
});

test('payments are built last, after there is something to unlock', () => {
  const order = BUILD_ORDER.map((s) => s.step);
  assert.ok(order.indexOf('payments') > order.indexOf('post_and_browse'),
    'a marketplace with payments and no inventory takes money for an empty room');
  assert.ok(order.indexOf('verification') < order.indexOf('payments'));
  assert.ok(order.indexOf('exceptionQueue') < order.indexOf('payments'));
});
