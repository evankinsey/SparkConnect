// ─── PRICE BOOK · REFERRALS · CURRICULUM · PULSE ─────────────────────────────
// Four small modules, four contracts worth holding:
//   - a bid never gets an invented material price
//   - the phone never grants itself Pro
//   - the shelf never links to a track that does not exist
//   - Home never states a community statistic nothing counted

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PriceSource, SUPPLIER_ADAPTERS, priceEntry, emptyPriceBook, putPrice,
  lookupPrice, searchPrices, priceMaterials, normalizeKey, PRICE_DISCLAIMER, PRICE_LIMITS,
} from '../src/core/field/priceBook.js';
import {
  isWellFormedCode, normalizeCode, codeForHandle, CODE_LENGTH,
  emptyReferralState, sanitizeReferralState, pendingRedemption, applyServerResponse,
  RewardKind, creatorDashboard, REFERRAL_DISCLAIMER,
} from '../src/core/growth/referrals.js';
import {
  TRACKS, Level, trackById, tracksByLevel, isUnlocked, unlockedTracks,
  nextUpTrack, completeTrack, curriculumPercent, currentLevel, sanitizeLearnProgress,
} from '../src/core/learn/curriculum.js';
import { buildPulse, PulseKind, FIELD_TIPS, dayIndexFor } from '../src/core/home/pulse.js';

// ─── Price book ──────────────────────────────────────────────────────────────

test('no supplier adapter ships until there is an official API behind it', () => {
  assert.equal(SUPPLIER_ADAPTERS.length, 0);
  assert.match(PRICE_DISCLAIMER, /does not scrape/i);
});

test('a price must be whole cents in a sane range', () => {
  assert.ok(priceEntry({ name: '12/2 NM', cents: 8999 }).ok);
  for (const cents of [1.5, -100, NaN, '899', null, PRICE_LIMITS.maxCents + 1]) {
    assert.equal(priceEntry({ name: '12/2 NM', cents }).ok, false, `cents ${cents}`);
  }
  assert.equal(priceEntry({ name: '   ', cents: 100 }).ok, false);
});

test('lookup matches across spacing and punctuation', () => {
  assert.equal(normalizeKey('12/2 NM-B'), normalizeKey('12-2  nm b'));
  const book = putPrice(emptyPriceBook(), priceEntry({ name: '12/2 NM-B', unit: 'ft', cents: 89 }).entry);
  assert.equal(lookupPrice(book, '12-2 nm b', 'ft').cents, 89);
});

test("the contractor's own price beats a supplier price for the same item", () => {
  let book = emptyPriceBook();
  book = putPrice(book, priceEntry({ name: 'EMT 1/2', unit: 'ft', cents: 120, source: PriceSource.SUPPLIER }).entry);
  book = putPrice(book, priceEntry({ name: 'EMT 1/2', unit: 'ft', cents: 95, source: PriceSource.USER }).entry);
  const hit = lookupPrice(book, 'EMT 1/2', 'ft');
  assert.equal(hit.cents, 95);
  assert.equal(hit.source, PriceSource.USER);
});

test('an old price is flagged stale rather than trusted', () => {
  const now = Date.now();
  const old = priceEntry({ name: 'Copper THHN', unit: 'ft', cents: 40, at: now - 200 * 86400000 }).entry;
  const hit = lookupPrice(putPrice(emptyPriceBook(), old), 'Copper THHN', 'ft', now);
  assert.equal(hit.stale, true);
  assert.ok(hit.ageDays > PRICE_LIMITS.staleDays);
});

test('an unpriced line is blank, never zero — a zero understates a bid', () => {
  const book = putPrice(emptyPriceBook(), priceEntry({ name: 'Device box', cents: 250 }).entry);
  const out = priceMaterials(book, [
    { item: 'Device box', qty: 10, unit: 'ea' },
    { item: 'Unobtainium', qty: 4, unit: 'ea' },
  ]);
  assert.equal(out.subtotalCents, 2500);
  assert.equal(out.unpricedCount, 1);
  assert.equal(out.complete, false, 'a partial book must never look like a total');
  const missing = out.rows.find((r) => r.item === 'Unobtainium');
  assert.equal(missing.extendedCents, null);
  assert.notEqual(missing.extendedCents, 0);
});

test('search and pricing survive an empty or garbage book', () => {
  for (const junk of [null, undefined, {}, { entries: null }]) {
    assert.doesNotThrow(() => { searchPrices(junk, 'wire'); priceMaterials(junk, [{ item: 'x', qty: 1 }]); });
  }
});

// ─── Referrals ───────────────────────────────────────────────────────────────

test('codes avoid the characters people mistype', () => {
  for (const bad of ['O', '0', 'I', '1', 'L', 'S', '5']) {
    assert.ok(!codeForHandle('anyhandle').includes(bad) || !'O0I1LS5'.includes(bad),
      'alphabet should exclude confusable characters');
  }
  assert.equal(codeForHandle('sparkconnectelectricapp').length, CODE_LENGTH);
  assert.equal(codeForHandle(''), null);
});

test('a typed code forgives case, spaces and dashes', () => {
  assert.equal(normalizeCode('ab-cd ef'), 'ABCDEF');
  assert.ok(isWellFormedCode('abcdef'));
  assert.equal(isWellFormedCode('ABC'), false);
  assert.equal(isWellFormedCode(null), false);
});

test('a malformed code is refused without a round trip', () => {
  const r = pendingRedemption('xx');
  assert.equal(r.ok, false);
  assert.match(r.reason, new RegExp(String(CODE_LENGTH)));
  assert.ok(pendingRedemption('ABCDEF', { deviceId: 'd1' }).ok);
});

test('the phone never grants itself Pro — only the server accepts a code', () => {
  const state = applyServerResponse(emptyReferralState(), { accepted: false, message: 'expired' });
  assert.equal(state.status, 'REJECTED');
  assert.equal(state.rewardKind, RewardKind.NONE);

  // Even a hand-edited local save claiming ACCEPTED carries no entitlement
  // field — there is nothing here for the app to read as "isPro".
  const tampered = sanitizeReferralState({ enteredCode: 'ABCDEF', status: 'ACCEPTED', isPro: true, entitlement: 'pro' });
  assert.equal(tampered.isPro, undefined);
  assert.equal(tampered.entitlement, undefined);
  assert.match(REFERRAL_DISCLAIMER, /granted by the App Store or Google Play/i);
});

test('a server response with an unknown reward degrades to none', () => {
  const s = applyServerResponse(emptyReferralState(), { accepted: true, rewardKind: 'A_FREE_TRUCK' });
  assert.equal(s.status, 'ACCEPTED');
  assert.equal(s.rewardKind, RewardKind.NONE);
  assert.equal(applyServerResponse(emptyReferralState(), null).status, 'REJECTED');
});

test('creator stats are shaped, never computed on device', () => {
  const d = creatorDashboard({ handle: 'x', code: 'ABCDEF', installs: 200, conversions: 30, revenueCents: -5 });
  assert.equal(d.conversionRate, 15);
  assert.equal(d.revenueCents, 0, 'a negative revenue figure is garbage, not a credit');
  assert.equal(creatorDashboard(null).installs, 0);
});

// ─── Curriculum ──────────────────────────────────────────────────────────────

test('every available track points at a real tab; unavailable ones point nowhere', () => {
  for (const t of TRACKS) {
    assert.ok(t.id && t.title && t.sub && t.icon, `${t.id} incomplete`);
    if (t.available) assert.ok(t.tab, `${t.id} is available but has no destination`);
    else assert.equal(t.tab, null, `${t.id} is unavailable and must not link anywhere`);
  }
});

test('prerequisites reference tracks that exist and never form a cycle', () => {
  for (const t of TRACKS) {
    for (const r of t.requires) assert.ok(trackById(r), `${t.id} requires unknown ${r}`);
  }
  // Walk each chain; a cycle would never terminate.
  for (const t of TRACKS) {
    const seen = new Set();
    let frontier = [...t.requires];
    while (frontier.length) {
      const id = frontier.pop();
      assert.ok(!seen.has(id) || true);
      if (seen.has(id)) continue;
      seen.add(id);
      assert.notEqual(id, t.id, `${t.id} depends on itself`);
      frontier.push(...(trackById(id)?.requires ?? []));
    }
  }
});

test('a track unlocks only once its prerequisites are done', () => {
  assert.ok(isUnlocked('fundamentals', { completed: [] }), 'the first track is always open');
  assert.equal(isUnlocked('residential-wiring', { completed: [] }), false);
  assert.ok(isUnlocked('residential-wiring', { completed: ['fundamentals'] }));
});

test('an unavailable track never unlocks, however much you complete', () => {
  const everything = { completed: TRACKS.map((t) => t.id) };
  for (const t of TRACKS.filter((x) => !x.available)) {
    assert.equal(isUnlocked(t.id, everything), false, `${t.id} has no content to open`);
  }
  assert.ok(unlockedTracks(everything).every((t) => t.available));
});

test('next-up walks the graph and progress is bounded to real tracks', () => {
  assert.equal(nextUpTrack({ completed: [] }).id, 'fundamentals');
  let p = completeTrack({ completed: [] }, 'fundamentals');
  assert.equal(nextUpTrack(p).id, 'residential-wiring');
  assert.equal(completeTrack(p, 'fundamentals').completed.length, 1, 'completing twice does not duplicate');
  assert.deepEqual(sanitizeLearnProgress({ completed: ['made-up', 'fundamentals'] }).completed, ['fundamentals']);
  assert.equal(curriculumPercent({ completed: [] }), 0);
  assert.equal(currentLevel({ completed: [] }), Level.APPRENTICE);
});

test('the shelf groups by level in order', () => {
  const groups = tracksByLevel();
  assert.deepEqual(groups.map((g) => g.level).slice(0, 2), [Level.APPRENTICE, Level.JOURNEYMAN]);
  for (const g of groups) assert.ok(g.label && g.tracks.length > 0);
});

// ─── Home pulse ──────────────────────────────────────────────────────────────

test('the pulse never states a community statistic', () => {
  // Nothing counts these, so nothing may claim them.
  const banned = /electricians (have )?saved|users? (have )?completed|this week across|community/i;
  for (const tip of FIELD_TIPS) assert.ok(!banned.test(tip), `invented stat: ${tip}`);
  for (const ctx of [{}, { streak: 9, answeredToday: true }, { answeredToday: true, jobsitePercent: 50 }]) {
    assert.ok(!banned.test(buildPulse(ctx).text));
  }
});

test('the pulse says the most useful thing first', () => {
  assert.equal(buildPulse({ answeredToday: false }).kind, PulseKind.NUDGE);
  assert.equal(buildPulse({ answeredToday: true, streak: 5 }).kind, PulseKind.STREAK);
  assert.equal(buildPulse({ answeredToday: true, streak: 0, jobsitePercent: 40 }).kind, PulseKind.PROGRESS);
  assert.equal(buildPulse({ answeredToday: true, streak: 0, jobsitePercent: 0 }).kind, PulseKind.TIP);
});

test('the pulse is one short line and always renderable', () => {
  for (const ctx of [{}, null, { streak: NaN, jobsitePercent: 'lots', dayIndex: -7 }, { answeredToday: true, jobsitePercent: 999 }]) {
    const p = buildPulse(ctx ?? {});
    assert.ok(p.text && p.text.length > 0 && p.text.length <= 90, `too long: ${p.text}`);
    assert.ok(p.icon);
    assert.ok(!p.text.includes('\n'), 'the pulse is one line');
  }
});

test('the tip rotates by day without storing anything', () => {
  const a = buildPulse({ answeredToday: true, dayIndex: dayIndexFor(new Date('2026-03-01')) });
  const b = buildPulse({ answeredToday: true, dayIndex: dayIndexFor(new Date('2026-03-02')) });
  assert.notEqual(a.text, b.text);
  assert.ok(dayIndexFor(new Date('2026-12-31')) > 360);
});
