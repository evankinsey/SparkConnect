// ─── CONTRACTOR CONNECT TESTS ────────────────────────────────────────────────
// One guarantee above all others: this module cannot produce a record that does
// not say where it came from, and cannot advertise data it does not have.
//
// Telling somebody a contractor is licensed when nobody checked is the worst
// thing this app could do. It is worse than saying nothing, because they act on
// it — and they act on it about a person who will be inside their house.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sourceRecord, adapter, createRegistry, normalizeBatch, freshness, ageInDays,
  isHttps, SourceKind, AdapterStatus, Confidence, STALE_AFTER_DAYS, ATTRIBUTION_NOTICE,
} from '../src/core/connect/sources.js';
import {
  TOPICS, topicById, structuralPoints, questionsToAsk, callScript, nextSteps,
  auditCopy, Certainty, Stage, START_POINTS, PATHWAY_DISCLAIMER,
} from '../src/core/connect/pathways.js';
import {
  SECTIONS, sectionById, sections, contractorsTab, Availability, SPLIT_PLAN,
} from '../src/core/connect/module.js';
import { findOutcomePromise, Trade } from '../src/core/connect/index.js';

const GOOD = {
  sourceId: 'fl-dbpr',
  sourceName: 'Florida DBPR',
  sourceUrl: 'https://www.myfloridalicense.com/wl11.asp',
  jurisdictionId: 'us-fl',
  retrievedAt: '2026-08-07T12:00:00.000Z',
  confidence: Confidence.OFFICIAL,
};

// ─── A record without provenance cannot be built ─────────────────────────────

test('a complete record is accepted and credits its source', () => {
  const r = sourceRecord({ ...GOOD, payload: { status: 'Active' } });
  assert.ok(r);
  assert.equal(r.attribution, 'Florida DBPR', 'attribution defaults to the source, not to us');
  assert.equal(r.confidence, Confidence.OFFICIAL);
  assert.deepEqual(r.payload, { status: 'Active' });
});

test('every piece of provenance is mandatory', () => {
  for (const missing of ['sourceId', 'sourceName', 'sourceUrl', 'jurisdictionId', 'retrievedAt']) {
    const bad = { ...GOOD };
    delete bad[missing];
    assert.equal(sourceRecord(bad), null, `a record with no ${missing} must be refused`);
    assert.equal(sourceRecord({ ...GOOD, [missing]: '   ' }), null, `whitespace ${missing} is not a value`);
  }
  assert.equal(sourceRecord({ ...GOOD, confidence: 'PROBABLY' }), null);
  assert.equal(sourceRecord(), null);
  assert.equal(sourceRecord(null), null);
});

test('a source URL must be https and must not carry credentials', () => {
  assert.equal(isHttps('https://example.gov/x'), true);
  assert.equal(isHttps('http://example.gov/x'), false, 'http is a downgrade on a link we tell people to trust');
  assert.equal(isHttps('https://user:pass@example.gov'), false, 'credentials in a shipped URL are a leak');
  assert.equal(isHttps('ftp://example.gov'), false);
  assert.equal(isHttps(null), false);
  assert.equal(sourceRecord({ ...GOOD, sourceUrl: 'http://example.gov' }), null);
});

test('a batch counts what it dropped instead of silently shrinking', () => {
  const rows = [{ ok: true }, { ok: false }, { ok: true }];
  const out = normalizeBatch(rows, (row) => (row.ok ? GOOD : { sourceId: 'x' }));
  assert.equal(out.records.length, 2);
  assert.equal(out.rejected.length, 1);
  assert.equal(out.total, 3);
  assert.equal(out.complete, false, 'a partial import must not read as clean');
  assert.match(out.rejected[0].reason, /Incomplete provenance/);

  assert.equal(normalizeBatch(null, () => GOOD).total, 0);
});

test('freshness is stated, and old data says so', () => {
  const now = Date.parse('2026-08-07T12:00:00.000Z');
  const fresh = freshness(sourceRecord(GOOD), now);
  assert.equal(fresh.days, 0);
  assert.equal(fresh.stale, false);
  assert.equal(fresh.warning, null);
  assert.match(fresh.label, /today/);

  const old = sourceRecord({ ...GOOD, retrievedAt: '2026-01-01T12:00:00.000Z' });
  const f = freshness(old, now);
  assert.ok(f.days > STALE_AFTER_DAYS);
  assert.equal(f.stale, true);
  assert.match(f.warning, /may have changed/);

  // Unknown age is treated as stale, never as fresh.
  const unknown = freshness({ retrievedAt: 'whenever' }, now);
  assert.equal(unknown.known, false);
  assert.equal(unknown.stale, true);
  assert.equal(ageInDays({ retrievedAt: 'nope' }), null);
});

// ─── Adapters cannot overclaim ───────────────────────────────────────────────

const deepLinkAdapter = (over = {}) => adapter({
  id: 'fl-dbpr', name: 'Florida DBPR', kind: SourceKind.STATE_LICENSE_BOARD,
  jurisdictionId: 'us-fl', portalUrl: 'https://www.myfloridalicense.com/',
  deepLink: (q) => `https://www.myfloridalicense.com/wl11.asp?q=${encodeURIComponent(q ?? '')}`,
  ...over,
});

test('an adapter with no implementation is DEEP_LINK_ONLY, which is a real answer', () => {
  const a = deepLinkAdapter();
  assert.equal(a.status, AdapterStatus.DEEP_LINK_ONLY);
  assert.equal(a.search, null);
  assert.match(a.deepLink('EC13001234'), /^https:\/\//);
  assert.ok(a.terms, 'an adapter states how its source may be used');
});

test('an adapter cannot claim LIVE without an implementation', () => {
  assert.equal(deepLinkAdapter({ status: AdapterStatus.LIVE }), null,
    'the coverage dashboard would be lying');

  const live = adapter({
    id: 'x', name: 'X', kind: SourceKind.OPEN_DATA_PORTAL,
    portalUrl: 'https://data.example.gov/', search: async () => [],
  });
  assert.equal(live.status, AdapterStatus.LIVE);
});

test('an adapter with no way to reach the source at all is refused', () => {
  assert.equal(adapter({
    id: 'y', name: 'Y', kind: SourceKind.CITY_PERMIT_PORTAL,
    portalUrl: 'https://example.gov/', status: AdapterStatus.PLANNED,
  }), null, 'PLANNED still needs somewhere to send the user');
  assert.equal(adapter({ id: 'z', name: 'Z', kind: 'MADE_UP', portalUrl: 'https://a.gov/' }), null);
  assert.equal(adapter({ id: 'z', name: 'Z', kind: SourceKind.OPEN_DATA_PORTAL, portalUrl: 'http://a.gov/' }), null);
  assert.equal(adapter(null), null);
});

test('the registry reports coverage bluntly', () => {
  const r = createRegistry();
  assert.equal(r.register(deepLinkAdapter()).ok, true);
  assert.equal(r.register(deepLinkAdapter()).ok, false, 'duplicate ids are refused');
  assert.equal(r.register(null).ok, false);

  const c = r.coverage();
  assert.equal(c.total, 1);
  assert.equal(c.deepLinkOnly, 1);
  assert.equal(c.live, 0);
  assert.equal(c.liveRecordSources, 0, 'the number that would be easiest to dress up');
  assert.equal(r.forJurisdiction('us-fl').length, 1);
  assert.equal(r.forJurisdiction('us-tx').length, 0);
});

// ─── Sections cannot advertise data they do not have ─────────────────────────

test('the tab covers the six things asked for', () => {
  const ids = SECTIONS.map((s) => s.id);
  for (const want of ['find_contractor', 'verify_license', 'permit_assistant',
    'nearby_contractors', 'qualifying_agent', 'saved']) {
    assert.ok(ids.includes(want), `no section for ${want}`);
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(sectionById('saved').title, 'Saved');
  assert.equal(sectionById('nope'), null);
});

test('with no adapters, every data-backed section reads NOT_YET and explains why', () => {
  const rows = sections(null);
  const find = rows.find((r) => r.id === 'find_contractor');
  assert.equal(find.availability, Availability.NOT_YET);
  assert.equal(find.usable, false);
  assert.ok(find.whyNoData, 'an empty section must say why, or it reads as neglect');

  // The ones that need nothing external still work.
  for (const id of ['permit_assistant', 'qualifying_agent', 'saved']) {
    const s = rows.find((r) => r.id === id);
    assert.equal(s.usable, true, `${id} needs no external data and should work`);
    assert.equal(s.availability, Availability.LOCAL_ONLY);
  }
});

test('a section is upgraded only by an adapter that actually exists', () => {
  const r = createRegistry();
  r.register(deepLinkAdapter());
  const rows = sections(r);

  const verify = rows.find((s) => s.id === 'verify_license');
  assert.equal(verify.availability, Availability.OFFICIAL_PORTAL);
  assert.equal(verify.usable, true);
  assert.equal(verify.portals.length, 1);
  assert.match(verify.portals[0].url, /^https:\/\//);
  assert.equal(verify.whyNoData, null, 'a usable section needs no excuse');
});

test('a declared availability is a ceiling, never a promise', () => {
  // verify_license declares OFFICIAL_PORTAL. With no adapter it must fall to
  // NOT_YET rather than render as though a portal is wired.
  const rows = sections(null);
  const verify = rows.find((s) => s.id === 'verify_license');
  assert.equal(verify.availability, Availability.NOT_YET);
  assert.equal(verify.usable, false);
});

test('the tab counts what is real rather than showing six working tiles', () => {
  const t = contractorsTab(null);
  assert.equal(t.badge, 'Beta');
  assert.match(t.honestSummary, /3 of 6 are live/);
  assert.ok(t.waiting.length === 3);
  assert.match(t.attribution, /does not own, certify or guarantee/i);
  assert.ok(t.disclaimer && t.pathwayDisclaimer);
  assert.equal(ATTRIBUTION_NOTICE, t.attribution);
});

// ─── Pathways: explain the structure, ask the board the rest ─────────────────

test('every topic is well formed and nothing promises an outcome', () => {
  assert.deepEqual(auditCopy(), [], 'the copy audit must be clean');
  for (const t of TOPICS) {
    assert.ok(t.id && t.title && t.summary && t.points.length, `${t.id} incomplete`);
  }
  assert.equal(topicById('qualifying-agent').title, 'What a qualifying agent actually is');
  assert.equal(topicById('nope'), null);
});

test('a jurisdiction-specific claim is a question, never an answer', () => {
  for (const t of TOPICS) {
    for (const p of questionsToAsk(t)) {
      assert.equal(p.certainty, Certainty.ASK_AUTHORITY);
      assert.ok(p.askThis && p.askThis.length > 10,
        `${t.id}: an ASK_AUTHORITY point must carry wording to read out`);
    }
    // Structural points explain how the system is arranged and need no board.
    for (const p of structuralPoints(t)) assert.equal(p.askThis, undefined);
  }
});

test('nothing in the pathways names a specific state requirement as fact', () => {
  // The exact temptation: "in Florida you need an EC licence with four years".
  // Numbers of years, licence class codes and dollar thresholds are the shapes a
  // hallucinated legal claim takes, so none may appear in a STRUCTURAL point.
  const FORBIDDEN = /\b(?:EC\d|CFC\d|\d+\s*(?:years?|hours?)\s+of\s+experience|\$\s?\d{3,})/i;
  for (const t of TOPICS) {
    for (const p of structuralPoints(t)) {
      assert.doesNotMatch(p.text, FORBIDDEN,
        `${t.id}: a structural point states a specific requirement — that belongs to the board`);
    }
  }
});

test('the call script gives somebody something to actually say', () => {
  const s = callScript(['qualifying-agent', 'who-can-pull'], { jurisdictionName: 'Hillsborough County' });
  assert.match(s.opening, /Hillsborough County/);
  assert.ok(s.questions.length >= 3);
  assert.equal(new Set(s.questions).size, s.questions.length, 'no duplicate questions');
  assert.match(s.closing, /published/i, 'ask for something in writing');
  assert.match(s.afterwards, /Permit Assistant/, 'and keep the answer');

  assert.equal(callScript([]), null);
  assert.equal(callScript(['not-a-topic']), null);
});

test('next steps are short, and change with where somebody is', () => {
  const side = nextSteps(Stage.SIDE_WORK);
  assert.equal(side.stage, Stage.SIDE_WORK);
  assert.ok(side.steps.length >= 2 && side.steps.length <= 4,
    'a twelve-step plan is a thing nobody follows');
  assert.ok(side.topics.length > 0);

  const helper = nextSteps(Stage.HELPER);
  assert.notDeepEqual(helper.steps.map((s) => s.id), side.steps.map((s) => s.id));
  // Documenting hours shows up early, because reconstructing them later is the
  // thing that actually stops people.
  assert.ok(helper.steps.some((s) => s.id === 'hours'));

  assert.equal(nextSteps('NONSENSE').stage, Stage.JOURNEYMAN, 'an unknown stage falls back');
  assert.equal(nextSteps().stage, Stage.JOURNEYMAN);
});

test('every start point routes to a topic that exists', () => {
  for (const p of START_POINTS) {
    assert.ok(topicById(p.leadsTo), `${p.id} leads to a missing topic`);
    assert.ok(p.ask.endsWith('?'), `${p.id} should be phrased as a question`);
    assert.ok(p.forStages.every((s) => Object.prototype.hasOwnProperty.call(Stage, s)));
  }
});

test('the pathway disclaimer refuses the legal-advice reading', () => {
  assert.match(PATHWAY_DISCLAIMER, /not legal advice/i);
  assert.match(PATHWAY_DISCLAIMER, /only they can tell you/i);
  assert.equal(findOutcomePromise(PATHWAY_DISCLAIMER), null);
});

// ─── The split stays cheap ───────────────────────────────────────────────────

test('nothing in connect/ imports a screen or anything electrical', async () => {
  // This is the entire reason the later split is a routing change rather than a
  // rewrite, so it is asserted rather than remembered.
  const fs = await import('node:fs');
  const files = fs.readdirSync('src/core/connect').filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const src = fs.readFileSync(`src/core/connect/${f}`, 'utf8');
    const imports = [...src.matchAll(/^import[^;]*from\s+'([^']+)'/gm)].map((m) => m[1]);
    for (const spec of imports) {
      assert.ok(!/screens?\//i.test(spec), `${f} imports a screen: ${spec}`);
      assert.ok(!/\/circuit\//.test(spec), `${f} imports the circuit engine: ${spec}`);
      assert.ok(!spec.includes('react'), `${f} imports React: ${spec}`);
    }
  }
});

test('the split plan is recorded where an engineer will read it', () => {
  assert.ok(SPLIT_PLAN.now && SPLIT_PLAN.later && SPLIT_PLAN.umbrella);
  assert.ok(SPLIT_PLAN.whatMakesItCheap.length >= 3);
  assert.match(SPLIT_PLAN.umbrella, /TradeConnect/);
  // Every trade the umbrella will need already has an id, so adding one later
  // is not a schema change.
  assert.ok(SPLIT_PLAN.tradesReady.includes(Trade.HVAC));
  assert.ok(SPLIT_PLAN.tradesReady.includes(Trade.PLUMBING));
  assert.ok(SPLIT_PLAN.tradesReady.length >= 9);
});
