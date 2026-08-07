// ─── PROJECT HUB TESTS ───────────────────────────────────────────────────────
// The three things that would actually hurt someone:
//
//   1. hydrate() eroding a saved project — it runs on every load, so a bug that
//      drops one field drops it forever
//   2. labor totals silently omitting unpriced crew, so a job looks cheaper than
//      it was
//   3. an export leaking the contractor's cost basis to the customer, or the
//      customer's contact details to a GC
//
// Everything else is arithmetic.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hydrate, customerRecord, setCustomer, setAddress, SECTIONS, sectionById,
  hubOverview, completeness, deletionImpact, emptyWorld, Ownership, SectionGroup,
} from '../src/core/domain/projectHub.js';
import {
  dailyLog, crewEntry, upsertLog, logsForProject, logForDate, laborSummary,
  delaySummary, missingLogDays, logOverview, parseMinutes, formatMinutes,
  entryCostCents, renderLogText, isCalendarDate, Weather, DelayKind, MAX_MINUTES_PER_ENTRY,
} from '../src/core/domain/dailyLog.js';
import {
  buildExport, renderExportText, exportSummary, Audience, AUDIENCE_SECTIONS,
  MONEY_BY_AUDIENCE, MoneyDetail, EXPORT_DISCLAIMER,
} from '../src/core/domain/projectExport.js';
import { project, photo, addPhoto, ProjectTemplate } from '../src/core/domain/jobcam.js';
import { createArtifact, attachArtifact, ArtifactKind } from '../src/core/domain/projectArtifacts.js';
import { createInvoice, createEstimate } from '../src/core/domain/documents.js';
import { lineItem, LineItemKind } from '../src/core/domain/money.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const AT = '2026-03-02T09:00:00.000Z';

const baseProject = () => project({
  id: 'p1', name: 'Reyes panel upgrade', template: ProjectTemplate.PANEL_UPGRADE, createdAt: AT,
});

const withEverything = () => {
  let p = hydrate(baseProject());
  p = setCustomer(p, { name: 'Ana Reyes', phone: '555-0100', email: 'ana@example.com' });
  p = setAddress(p, '14 Mill Road');
  p = addPhoto(p, photo({ id: 'ph1', uri: 'file://a.jpg', capturedAt: AT, folderId: 'f1', tags: ['PANEL'] }));
  p = attachArtifact(p, createArtifact({
    kind: ArtifactKind.CALCULATION, title: 'Voltage drop', summary: '2.1% at 140 ft', savedAt: Date.parse(AT),
  }));
  return p;
};

const worldFor = (p) => ({
  ...emptyWorld(),
  invoices: [{ ...createInvoice({ id: 'i1', number: 'INV-1', createdAt: AT }), projectId: p.id,
    lineItems: [lineItem({ id: 'l1', kind: LineItemKind.LABOR, description: 'Panel changeout', quantity: 1, unitPriceCents: 250000 })] }],
  estimates: [{ ...createEstimate({ id: 'e1', number: 'EST-1', createdAt: AT }), projectId: p.id,
    lineItems: [lineItem({ id: 'l2', description: 'Replace 200 A panel', quantity: 1, unitPriceCents: 240000 })] }],
  permits: [{ projectId: p.id, id: 'pm1', number: 'E-2026-114', ahj: 'City of Ordway', status: 'ISSUED', type: 'ELECTRICAL',
    inspections: [{ kind: 'ROUGH_IN', result: 'PASSED', scheduledFor: '2026-03-05', inspector: 'J. Okafor' }] }],
  logs: [
    dailyLog({ projectId: p.id, date: '2026-03-02', workPerformed: 'Set new panel',
      crew: [crewEntry({ name: 'Evan', minutes: 480, rateCentsPerHour: 8500 })], weather: Weather.CLEAR }),
    dailyLog({ projectId: p.id, date: '2026-03-03', workPerformed: 'Terminated branch circuits',
      crew: [crewEntry({ name: 'Evan', minutes: 450, rateCentsPerHour: 8500 }),
        crewEntry({ name: 'Marisol', minutes: 240, rateCentsPerHour: 6000 })],
      delays: [{ kind: DelayKind.MATERIAL, minutes: 60, note: 'Breakers arrived late' }] }),
  ],
});

// ─── Hydration must never erode a record ─────────────────────────────────────

test('hydrate is idempotent and strictly additive', () => {
  const original = withEverything();
  const once = hydrate(original);
  const twice = hydrate(once);
  assert.deepEqual(twice, once, 'running hydrate twice changed the record');

  // Every key the caller had is still there with the same value.
  for (const [k, v] of Object.entries(original)) {
    assert.deepEqual(once[k], v, `hydrate changed "${k}"`);
  }
});

test('hydrate fills a pre-hub record without inventing content', () => {
  const ancient = { id: 'old', name: 'Old job', createdAt: AT };
  const h = hydrate(ancient);
  assert.deepEqual(h.photos, []);
  assert.deepEqual(h.artifacts, []);
  assert.equal(h.customer, null, 'must not invent a customer');
  assert.equal(h.address, null);
  assert.equal(h.archived, false);
  assert.equal(h.updatedAt, AT, 'falls back to createdAt rather than "now"');
  assert.equal(hydrate(null), null);
  assert.equal(hydrate('nope'), null);
});

test('hydrate does not clobber existing collections', () => {
  const p = { id: 'x', name: 'X', photos: [{ id: 'keep' }], artifacts: [{ id: 'a' }], customer: { name: 'Set' } };
  const h = hydrate(p);
  assert.equal(h.photos.length, 1);
  assert.equal(h.photos[0].id, 'keep');
  assert.equal(h.artifacts.length, 1);
  assert.deepEqual(h.customer, { name: 'Set' });
});

test('an all-blank customer is null, not an empty record', () => {
  assert.equal(customerRecord({}), null);
  assert.equal(customerRecord({ name: '   ' }), null);
  assert.equal(customerRecord({ phone: '555' }).phone, '555');
  const p = setCustomer(baseProject(), { name: '' });
  assert.equal(p.customer, null);
  assert.equal(hubOverview(p).sections.find((s) => s.id === 'customer').present, false);
});

// ─── Sections ────────────────────────────────────────────────────────────────

test('every section is renderable and declares where its data lives', () => {
  for (const s of SECTIONS) {
    assert.ok(s.id && s.label && s.icon && s.group, `${s.id} incomplete`);
    assert.ok(Object.values(Ownership).includes(s.ownership), `${s.id} bad ownership`);
    assert.ok(Object.values(SectionGroup).includes(s.group), `${s.id} bad group`);
    assert.equal(typeof s.read, 'function');
  }
  assert.equal(new Set(SECTIONS.map((s) => s.id)).size, SECTIONS.length, 'duplicate section ids');
  assert.equal(sectionById('photos').label, 'Photos');
  assert.equal(sectionById('nope'), null);
});

test('the hub covers everything the brief listed', () => {
  const ids = new Set(SECTIONS.map((s) => s.id));
  for (const required of ['customer', 'address', 'blueprint', 'photos', 'estimate', 'invoice',
    'calculations', 'permit', 'inspection', 'warranty', 'materials', 'labor',
    'sparkai', 'chat', 'dailyLogs', 'export']) {
    assert.ok(ids.has(required), `no section for "${required}"`);
  }
});

test('an empty project reports every section absent without throwing', () => {
  const o = hubOverview(baseProject());
  assert.ok(o.groups.length > 0);
  const alwaysOn = new Set(['sparkai']);   // asking about a job needs no data
  for (const s of o.sections) {
    if (alwaysOn.has(s.id)) continue;
    assert.equal(s.present, false, `${s.id} claimed present on an empty project`);
    assert.ok(s.detail, `${s.id} has no empty-state text`);
  }
});

test('a full project reports the real numbers', () => {
  const p = withEverything();
  const o = hubOverview(p, worldFor(p), { today: '2026-03-04' });
  const get = (id) => o.sections.find((s) => s.id === id);

  assert.equal(get('customer').present, true);
  assert.match(get('customer').detail, /Ana Reyes/);
  assert.equal(get('address').detail, '14 Mill Road');
  assert.equal(get('photos').count, 1);
  assert.equal(get('calculations').count, 1);
  assert.equal(get('dailyLogs').count, 2);
  assert.equal(get('permit').present, true);
  assert.match(get('permit').detail, /E-2026-114/);
  assert.equal(get('inspection').count, 1);
  assert.equal(get('labor').present, true);
  assert.match(get('labor').detail, /19h 30m/);
});

test('a section that throws degrades instead of taking the screen down', () => {
  const p = withEverything();
  // A malformed store: permits is not an array of objects.
  const o = hubOverview(p, { ...emptyWorld(), permits: [null, 5, 'nope'] });
  assert.ok(o, 'overview must still build');
  assert.equal(o.sections.find((s) => s.id === 'permit').unavailable, false,
    'filtered garbage should simply read as absent, not as unavailable');
});

test('the "nothing logged today" nudge only fires while the job is running', () => {
  const p = withEverything();
  const w = worldFor(p);   // logs on 2026-03-02 and 03-03
  const logSection = (t) => hubOverview(p, w, { today: t }).sections.find((s) => s.id === 'dailyLogs');

  assert.equal(logSection('2026-03-04').warn, 'Nothing logged today', 'a running job should be nudged');
  assert.equal(logSection('2026-03-03').warn, null, 'today is already logged');
  assert.equal(logSection('2026-06-01').warn, null, 'a job last worked in March must not nag in June');
  assert.match(logSection('2026-06-01').detail, /2 days logged/, 'the count survives either way');
});

test('warnings surface untagged photos and unrated hours', () => {
  let p = withEverything();
  p = addPhoto(p, photo({ id: 'ph2', uri: 'file://b.jpg', capturedAt: AT, folderId: 'f1', tags: [] }));
  const world = worldFor(p);
  world.logs = [dailyLog({ projectId: p.id, date: '2026-03-04', crew: [crewEntry({ name: 'Temp', minutes: 300 })] })];
  const o = hubOverview(p, world);
  const ids = o.warnings.map((w) => w.id);
  assert.ok(ids.includes('photos'), 'untagged photos should warn');
  assert.ok(ids.includes('labor'), 'hours with no rate should warn');
});

// ─── Daily logs ──────────────────────────────────────────────────────────────

test('hours parse the way people type them, and stay integer minutes', () => {
  assert.equal(parseMinutes(8), 480);
  assert.equal(parseMinutes('8'), 480);
  assert.equal(parseMinutes('7.5'), 450);
  assert.equal(parseMinutes('7:30'), 450);
  assert.equal(parseMinutes('7h'), 420);
  assert.equal(parseMinutes(''), null, 'blank is "not recorded", not zero');
  assert.equal(parseMinutes(null), null);
  assert.equal(parseMinutes('nonsense'), null);
  assert.equal(parseMinutes(-4), null);
  assert.equal(parseMinutes(9999), MAX_MINUTES_PER_ENTRY, 'a typo is clamped, not stored');
  assert.equal(formatMinutes(450), '7h 30m');
  assert.equal(formatMinutes(480), '8h');
  assert.equal(formatMinutes(45), '45m');
  assert.equal(formatMinutes(null), '—');
});

test('three 7.5-hour days sum exactly', () => {
  const logs = ['2026-03-02', '2026-03-03', '2026-03-04'].map((date) =>
    dailyLog({ projectId: 'p1', date, crew: [crewEntry({ name: 'E', minutes: parseMinutes('7.5') })] }));
  assert.equal(laborSummary(logs).totalMinutes, 1350);
  assert.equal(laborSummary(logs).totalHoursLabel, '22h 30m');
});

test('one log per project per day — a second write replaces, never doubles', () => {
  const first = dailyLog({ projectId: 'p1', date: '2026-03-02', crew: [crewEntry({ name: 'E', minutes: 480 })] });
  const corrected = dailyLog({ projectId: 'p1', date: '2026-03-02', crew: [crewEntry({ name: 'E', minutes: 450 })] });
  let logs = upsertLog([], first);
  logs = upsertLog(logs, corrected);
  assert.equal(logs.length, 1, 'two logs for one day would double the billable hours');
  assert.equal(laborSummary(logs).totalMinutes, 450);

  // A different project on the same day is a different log.
  logs = upsertLog(logs, dailyLog({ projectId: 'p2', date: '2026-03-02', crew: [] }));
  assert.equal(logs.length, 2);
  assert.equal(logsForProject(logs, 'p1').length, 1);
  assert.equal(logForDate(logs, 'p1', '2026-03-02').crew[0].minutes, 450);
});

test('a log without a valid date is refused rather than stored wrong', () => {
  assert.equal(dailyLog({ projectId: 'p1', date: '3/2/2026' }), null);
  assert.equal(dailyLog({ projectId: 'p1', date: '2026-13-01' }), null);
  assert.equal(dailyLog({ projectId: 'p1' }), null);
  assert.equal(isCalendarDate('2026-03-02'), true);
  assert.equal(isCalendarDate('2026-3-2'), false);
  assert.deepEqual(upsertLog([], null), []);
});

test('labor cost is null when any rate is missing — never a partial total', () => {
  const paid = crewEntry({ name: 'A', minutes: 480, rateCentsPerHour: 8500 });
  const unpaid = crewEntry({ name: 'B', minutes: 480 });
  assert.equal(entryCostCents(paid), 68000);
  assert.equal(entryCostCents(unpaid), null, 'no rate must not become $0.00');

  const full = laborSummary([dailyLog({ projectId: 'p', date: '2026-03-02', crew: [paid] })]);
  assert.equal(full.priced, true);
  assert.equal(full.costCents, 68000);

  const partial = laborSummary([dailyLog({ projectId: 'p', date: '2026-03-02', crew: [paid, unpaid] })]);
  assert.equal(partial.costCents, null, 'a total that omits someone is worse than no total');
  assert.equal(partial.priced, false);
  assert.match(partial.pricingNote, /no rate/);
  assert.equal(partial.totalMinutes, 960, 'the hours are still counted');
});

test('hours recorded as zero are different from hours not recorded', () => {
  const zero = crewEntry({ name: 'A', minutes: 0 });
  const unknown = crewEntry({ name: 'B', minutes: null });
  assert.equal(zero.minutes, 0);
  assert.equal(unknown.minutes, null);
  const s = laborSummary([dailyLog({ projectId: 'p', date: '2026-03-02', crew: [zero, unknown] })]);
  assert.equal(s.entriesWithHours, 1);
  assert.equal(s.entriesMissingHours, 1);
});

test('per-person roll-up counts days and hours', () => {
  const logs = [
    dailyLog({ projectId: 'p', date: '2026-03-02', crew: [crewEntry({ name: 'Evan', minutes: 480, rateCentsPerHour: 8500 })] }),
    dailyLog({ projectId: 'p', date: '2026-03-03', crew: [crewEntry({ name: 'Evan', minutes: 240, rateCentsPerHour: 8500 })] }),
  ];
  const s = laborSummary(logs);
  assert.equal(s.people.length, 1);
  assert.equal(s.people[0].name, 'Evan');
  assert.equal(s.people[0].minutes, 720);
  assert.equal(s.people[0].days, 2);
  assert.equal(s.people[0].costCents, 102000);
  assert.equal(s.days, 2);
});

test('delays roll up by cause and flag weather days', () => {
  const logs = [
    dailyLog({ projectId: 'p', date: '2026-03-02', weather: Weather.RAIN,
      delays: [{ kind: DelayKind.WEATHER, minutes: 120, note: 'Rained out' }] }),
    dailyLog({ projectId: 'p', date: '2026-03-03',
      delays: [{ kind: DelayKind.MATERIAL, minutes: 60 }, { kind: DelayKind.WEATHER, note: 'no duration given' }] }),
  ];
  const d = delaySummary(logs);
  assert.equal(d.totalMinutes, 180);
  assert.equal(d.unquantified, 1, 'a delay with no duration is counted separately, not as zero');
  assert.deepEqual(d.weatherDays, ['2026-03-02']);
  assert.equal(d.byKind[0].kind, DelayKind.WEATHER);
  assert.equal(d.byKind[0].occurrences, 2);
});

test('missing log days finds the holes, weekdays only by default', () => {
  const logs = [dailyLog({ projectId: 'p', date: '2026-03-02' })];   // Monday
  const gaps = missingLogDays(logs, { from: '2026-03-02', to: '2026-03-08' });
  assert.deepEqual(gaps, ['2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']);
  const withWeekend = missingLogDays(logs, { from: '2026-03-02', to: '2026-03-08', includeWeekends: true });
  assert.equal(withWeekend.length, 6);
  assert.deepEqual(missingLogDays(logs, { from: '2026-03-08', to: '2026-03-02' }), [], 'reversed range yields nothing');
  assert.deepEqual(missingLogDays(logs, { from: 'bad', to: '2026-03-08' }), []);
});

test('logOverview answers what the job screen asks', () => {
  const p = withEverything();
  const o = logOverview(worldFor(p).logs, p.id, { today: '2026-03-03' });
  assert.equal(o.count, 2);
  assert.equal(o.latestDate, '2026-03-03');
  assert.equal(o.loggedToday, true);
  assert.equal(o.labor.totalMinutes, 1170);
});

test('a rendered log reads like a log', () => {
  const log = dailyLog({
    projectId: 'p', date: '2026-03-02', authorName: 'Evan', weather: Weather.RAIN, temperatureF: 48,
    crew: [crewEntry({ name: 'Evan', role: 'JW', minutes: 480 })],
    workPerformed: 'Set panel', delays: [{ kind: DelayKind.WEATHER, minutes: 90, note: 'Downpour' }],
    deliveries: '20 ct 12-2', visitors: 'Inspector walked the rough',
  });
  const text = renderLogText(log);
  assert.match(text, /2026-03-02 — Evan/);
  assert.match(text, /Rain, 48°F/);
  assert.match(text, /Evan \(JW\) — 8h/);
  assert.match(text, /Total: 8h/);
  assert.match(text, /Delay — Weather \(1h 30m\): Downpour/);
  assert.equal(renderLogText(null), '');
});

// ─── Completeness ────────────────────────────────────────────────────────────

test('completeness reports what is recorded, and says that is all it means', () => {
  const empty = completeness(baseProject());
  assert.equal(empty.readyToClose, false);
  assert.ok(empty.outstanding.includes('Customer recorded'));
  assert.ok(empty.outstanding.includes('Invoice raised'));
  assert.match(empty.disclaimer, /not whether the work is correct/i);
  assert.doesNotMatch(empty.disclaimer, /compliant\b(?!.*not)/i);

  const p = withEverything();
  const full = completeness(p, worldFor(p));
  assert.equal(full.readyToClose, true, 'customer, photos and invoice are all present');
  assert.ok(full.percent > 50);
  assert.equal(full.done + full.outstanding.length <= full.total, true);
});

// ─── Deletion ────────────────────────────────────────────────────────────────

test('deleting a project says what dies and what is orphaned', () => {
  const p = withEverything();
  const impact = deletionImpact(p, worldFor(p));
  assert.match(impact.summary, /1 photo reference/);
  assert.match(impact.summary, /1 saved calculation/);
  assert.match(impact.summary, /customer details/);
  assert.match(impact.orphanSummary, /1 invoice/);
  assert.match(impact.orphanSummary, /2 daily logs/);
  assert.match(impact.note, /camera roll/);

  const bare = deletionImpact(baseProject());
  assert.match(bare.summary, /nothing saved/);
  assert.equal(bare.orphanSummary, null);
});

// ─── Export redaction — the part that costs money if wrong ───────────────────

test('every audience has an explicit allowlist and money policy', () => {
  for (const a of Object.values(Audience)) {
    assert.ok(Array.isArray(AUDIENCE_SECTIONS[a]) && AUDIENCE_SECTIONS[a].length, `${a} has no section list`);
    assert.ok(Object.values(MoneyDetail).includes(MONEY_BY_AUDIENCE[a]), `${a} has no money policy`);
  }
});

test('a customer copy never carries the labor cost basis', () => {
  const p = withEverything();
  const pkg = buildExport(p, worldFor(p), { audience: Audience.CUSTOMER });
  assert.equal(pkg.sections.labor, undefined, 'labor breakdown must not reach the customer');
  assert.equal(pkg.sections.materials, undefined, 'supplier pricing must not reach the customer');
  assert.equal(pkg.sections.logs, undefined);
  assert.ok(pkg.omitted.includes('labor'));

  const text = renderExportText(pkg);
  assert.doesNotMatch(text, /8500|85\.00/, 'an hourly rate leaked into the customer copy');
  assert.doesNotMatch(text, /Marisol/, 'crew names leaked into the customer copy');
  // What they SHOULD see:
  assert.match(text, /Ana Reyes/);
  assert.match(text, /\$2,500\.00/);
});

test('a GC copy carries schedule but no money at all', () => {
  const p = withEverything();
  const pkg = buildExport(p, worldFor(p), { audience: Audience.GC });
  assert.equal(MONEY_BY_AUDIENCE.GC, MoneyDetail.NONE);
  assert.equal(pkg.sections.totals, undefined);
  assert.equal(pkg.sections.customer, undefined, "the customer's details are not the GC's");
  assert.ok(pkg.sections.schedule, 'a GC needs the schedule');
  assert.equal(pkg.sections.schedule.daysOnSite, 2);
  assert.match(pkg.sections.schedule.totalHours, /19h 30m/);

  const text = renderExportText(pkg);
  assert.doesNotMatch(text, /\$/, 'no money may appear in a GC copy');
  assert.doesNotMatch(text, /ana@example\.com/);
  assert.match(text, /Delays/);
});

test('an inspector copy carries the permit and no money or contact details', () => {
  const p = withEverything();
  const pkg = buildExport(p, worldFor(p), { audience: Audience.INSPECTOR });
  assert.equal(pkg.sections.totals, undefined);
  assert.equal(pkg.sections.customer, undefined);
  assert.ok(pkg.sections.permit);
  assert.ok(pkg.sections.calculations, 'calculations are exactly what an inspector may want');
  const text = renderExportText(pkg);
  assert.doesNotMatch(text, /\$/);
  assert.match(text, /E-2026-114/);
  assert.match(text, /Voltage drop/);
});

test('the inspector name appears only on the internal copy', () => {
  const p = withEverything();
  const w = worldFor(p);
  assert.equal(buildExport(p, w, { audience: Audience.INTERNAL }).sections.inspections[0].inspector, 'J. Okafor');
  assert.equal(buildExport(p, w, { audience: Audience.CUSTOMER }).sections.inspections[0].inspector, null);
});

test('photo file paths never leave the device except internally', () => {
  const p = withEverything();
  const w = worldFor(p);
  assert.equal(buildExport(p, w, { audience: Audience.CUSTOMER }).sections.photos.uris, undefined);
  assert.deepEqual(buildExport(p, w, { audience: Audience.INTERNAL }).sections.photos.uris, ['file://a.jpg']);
});

test('a section nobody classified is exported to nobody', () => {
  // The allowlist is the guarantee: adding a key to a package without adding it
  // to an audience list must not make it visible.
  for (const audience of Object.values(Audience)) {
    const allowed = new Set(AUDIENCE_SECTIONS[audience]);
    const p = withEverything();
    const pkg = buildExport(p, worldFor(p), { audience });
    for (const key of Object.keys(pkg.sections)) {
      assert.ok(allowed.has(key), `${audience} received unclassified section "${key}"`);
    }
  }
});

test('an export never claims the work is compliant', () => {
  const p = withEverything();
  for (const audience of Object.values(Audience)) {
    const text = renderExportText(buildExport(p, worldFor(p), { audience }));
    assert.match(text, /not a certification/i, `${audience} copy lost the disclaimer`);
    assert.doesNotMatch(text, /code.compliant\.|meets code|passed inspection by SparkConnect/i);
  }
  assert.match(EXPORT_DISCLAIMER, /authority having jurisdiction/i);
});

test('export refuses an unknown audience rather than guessing', () => {
  const p = withEverything();
  assert.equal(buildExport(p, worldFor(p), { audience: 'EVERYONE' }), null);
  assert.equal(buildExport(null, emptyWorld(), { audience: Audience.CUSTOMER }), null);
});

test('the export summary says what is leaving and what was withheld', () => {
  const p = withEverything();
  const pkg = buildExport(p, worldFor(p), { audience: Audience.GC });
  const s = exportSummary(pkg);
  assert.match(s, /General contractor copy/);
  assert.match(s, /withheld/);
  assert.equal(exportSummary(null), '');
});

test('an empty project still exports without throwing', () => {
  for (const audience of Object.values(Audience)) {
    const pkg = buildExport(baseProject(), emptyWorld(), { audience });
    assert.ok(pkg);
    const text = renderExportText(pkg);
    assert.ok(text.length > 0);
    assert.match(text, /Reyes panel upgrade/);
  }
});
