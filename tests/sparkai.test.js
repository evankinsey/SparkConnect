// ─── SPARKAI ─────────────────────────────────────────────────────────────────
// One property holds this whole feature up: the model is the LAST resort, and
// when it does answer it cannot state an electrical fact.
//
// Everything else — routing, memory, grounding — exists to keep questions away
// from the model, because a computed answer cannot drift and a generated one
// can.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Provenance, PROVENANCE_LABEL, answer, refuse, sealAnswer, answerFooter,
  containsElectricalAssertion,
} from '../src/core/ai/answer.js';
import {
  Route, route, extractParams, extractAwg, extractAmps, extractFeet,
  extractTradeSize, matchTool, readyForTool,
} from '../src/core/ai/router.js';
import { TOOLS, runTool, toolById, toolManifest, adjustmentFactor } from '../src/core/ai/tools.js';
import { KNOWLEDGE, find, byId, knowledgeBase } from '../src/core/ai/knowledge.js';
import { ask, ground, inheritParams, modelContext, SYSTEM_RULES, MEMORY_TURNS } from '../src/core/ai/sparkai.js';
import { resolveCitation } from '../src/nec/citations.js';
import { createDevice, Origin } from '../src/core/blueprint/device.js';
import { accept } from '../src/core/blueprint/verification.js';
import { fillFor } from '../src/core/domain/conduitFill.js';

const box = (x) => ({ x1: x, y1: 0, x2: x + 10, y2: 10 });
const confirmedDevices = () => [
  ...Array.from({ length: 7 }, (_, i) => accept(createDevice({ symbolId: 'receptacle', confidence: 0.95, box: box(i * 20), origin: Origin.AI }))),
  ...Array.from({ length: 2 }, (_, i) => accept(createDevice({ symbolId: 'receptacle_gfci', confidence: 0.95, box: box(i * 20 + 500), origin: Origin.AI }))),
];

// ─── The assertion guard ─────────────────────────────────────────────────────

test('a MODEL answer that states a specification is refused', async () => {
  const hallucinating = async () => ({ text: 'For that run you should use 10 AWG on a 30 amp breaker.', confidence: 0.99 });
  const r = await ask('what should I run out to the shed', { askModel: hallucinating });

  assert.equal(r.provenance, Provenance.REFUSED,
    'a model may explain; it may not size a conductor');
  assert.match(r.reason, /electrical specification|not permitted/i);
});

test('the assertion detector catches the phrasings that matter', () => {
  for (const bad of [
    'use 12 AWG for that',
    'you need a 20 amp breaker',
    'install a 30A disconnect',
    'that is required by code',
    'see NEC 250.122',
    'per Article 310',
    'you must bond the neutral',
    'the breaker should be 40 amps',
  ]) {
    assert.equal(containsElectricalAssertion(bad), true, `missed: "${bad}"`);
  }
  for (const ok of [
    'Voltage drop is about resistance over distance.',
    'Open the Box Fill calculator and enter your conductor count.',
    'That depends on your adopted code edition — check with your AHJ.',
    "I can't verify this.",
  ]) {
    assert.equal(containsElectricalAssertion(ok), false, `false positive: "${ok}"`);
  }
});

test('a model answer that stays narrative is allowed through', async () => {
  const explaining = async () => ({
    text: 'Voltage drop grows with the length of the run and the current in it. Open the Voltage Drop calculator and put your numbers in.',
    confidence: 0.9,
  });
  const r = await ask('why does my light dim when the compressor kicks on', { askModel: explaining });
  assert.equal(r.provenance, Provenance.MODEL);
  assert.equal(r.assertsElectrical, false);
});

test('a model cannot mint a citation', async () => {
  const inventing = async () => ({
    text: 'That is a common question about grounding practice.',
    sources: ['NEC 999.99(Z)', 'NEC 250.4(A)(5)'],
    confidence: 0.9,
  });
  const r = await ask('tell me about grounding practice generally', { askModel: inventing });
  assert.deepEqual(r.sources.map((s) => s.ref), ['250.4(A)(5)'],
    'the invented reference is dropped and the real one survives');
});

test('an answer that loses every citation is withheld', () => {
  const a = answer({
    provenance: Provenance.KNOWLEDGE, text: 'Something authoritative sounding.',
    sources: ['NEC 404.9(Q)', 'NEC 111.11'], confidence: 1,
  });
  assert.equal(sealAnswer(a).provenance, Provenance.REFUSED,
    'if nothing it claimed can be pointed at, it was never grounded');
});

test('low confidence refuses rather than hedging', () => {
  const a = answer({ provenance: Provenance.MODEL, text: 'Probably fine.', confidence: 0.4 });
  assert.equal(sealAnswer(a).provenance, Provenance.REFUSED);
});

// ─── Routing: the model is the last resort ───────────────────────────────────

test('a computable question is computed, never generated', async () => {
  let modelCalled = false;
  const spy = async () => { modelCalled = true; return { text: 'nope' }; };

  const r = await ask('voltage drop on 100 feet of 12 AWG at 20 amps', { askModel: spy });
  assert.equal(modelCalled, false, 'the model must never see a question a calculator can answer');
  assert.equal(r.provenance, Provenance.ENGINE);
  assert.equal(r.route, Route.TOOL);
});

test('the computed answer is arithmetically right', async () => {
  const r = await ask('voltage drop on 100 feet of 12 AWG at 20 amps');
  // 20 A × 1.98 Ω/1000ft × 100 ft × 2 ÷ 1000 = 7.92 V
  assert.match(r.text, /7\.92 V/);
  assert.match(r.text, /6\.6%/);
  assert.match(r.detail, /past the 3%/);
  assert.deepEqual(r.sources.map((s) => s.ref), ['210.19(A)']);
});

test('a partial question asks for exactly what is missing', async () => {
  const r = await ask('what is the voltage drop on 12 AWG');
  assert.equal(r.provenance, Provenance.REFUSED);
  assert.deepEqual([...r.needs].sort(), ['amps', 'feet']);
  assert.match(r.needsPrompts[0], /amps|feet/i);
  // The failure this prevents: quietly assuming 120 V and 100 ft and returning
  // a confident number for a question nobody asked.
});

test('project questions read the takeoff instead of generating', async () => {
  let modelCalled = false;
  const spy = async () => { modelCalled = true; return { text: 'about forty' }; };

  const r = await ask('how many GFCIs are on this job', {
    devices: confirmedDevices(), askModel: spy,
  });
  assert.equal(modelCalled, false);
  assert.equal(r.provenance, Provenance.PROJECT);
  assert.match(r.text, /2 gfci/i);
  assert.equal(r.evidence.length, 2, 'the answer carries the devices behind it');
});

test('a project question with no takeoff refuses instead of guessing', async () => {
  const r = await ask('how many receptacles on this job', { askModel: async () => ({ text: 'lots' }) });
  assert.equal(r.provenance, Provenance.REFUSED);
  assert.match(r.reason, /no verified takeoff/i);
});

test('a referenced topic is quoted with its citation', async () => {
  const r = await ask('explain switched neutral to me', { knowledge: knowledgeBase });
  assert.equal(r.provenance, Provenance.KNOWLEDGE);
  assert.match(r.text, /ungrounded conductor only/i);
  assert.deepEqual(r.sources.map((s) => s.ref), ['404.2(B)']);
});

test('routing explains itself', () => {
  assert.match(route('voltage drop on 50 feet').reason, /computes rather than generates/);
  assert.match(route('what is a wire nut').reason, /may not state a specification/);
});

// ─── Offline degradation ─────────────────────────────────────────────────────

test('with no model at all, everything computable still works', async () => {
  const r = await ask('box fill for 6 conductors of 12 AWG with 1 device', { askModel: null });
  assert.equal(r.provenance, Provenance.ENGINE);
  // 6 × 2.25 + 1 yoke × 2 × 2.25 = 13.5 + 4.5 = 18.00
  assert.match(r.text, /18\.00 in³/);
});

test('with no model, an open question refuses rather than failing silently', async () => {
  const r = await ask('what do you think of my foreman', { askModel: null });
  assert.equal(r.provenance, Provenance.REFUSED);
  assert.match(r.reason, /no model is available offline/i);
});

test('a model that throws produces a refusal, not a crash', async () => {
  const broken = async () => { throw new Error('network down'); };
  const r = await ask('explain something open ended please', { askModel: broken });
  assert.equal(r.provenance, Provenance.REFUSED);
  assert.match(r.reason, /network down/);
});

// ─── Parameter extraction ────────────────────────────────────────────────────

test('conductor sizes are read, and near-misses are not', () => {
  assert.equal(extractAwg('#12'), 12);
  assert.equal(extractAwg('12 AWG'), 12);
  assert.equal(extractAwg('number 10 gauge'), 10);
  assert.equal(extractAwg('20 amps'), null, 'an ampere is not a conductor size');
  assert.equal(extractAwg('three phase'), null);
  assert.equal(extractAwg('99 AWG'), null, 'not a real size');
});

test('amps, feet and trade sizes are read from natural phrasing', () => {
  assert.equal(extractAmps('a 20 amp circuit'), 20);
  assert.equal(extractFeet('runs 150 feet'), 150);
  assert.equal(extractFeet("about 80'"), 80);
  assert.equal(extractTradeSize('half inch EMT'), '1/2"');
  assert.equal(extractTradeSize('3/4 conduit'), '3/4"');
  assert.equal(extractTradeSize('1-1/4 pipe'), '1-1/4"');
  assert.equal(extractTradeSize('some pipe'), null);
});

test('three phase is detected and changes the multiplier', async () => {
  const single = await ask('voltage drop 100 feet 12 AWG 20 amps');
  const three = await ask('three phase voltage drop 100 feet 12 AWG 20 amps at 208 volts');
  assert.match(single.detail, /out and back/);
  assert.match(three.detail, /three phase/);
  assert.notEqual(single.text, three.text);
});

// ─── Memory ──────────────────────────────────────────────────────────────────

test('a follow-up inherits the previous numbers', () => {
  const context = ground({
    conversation: [{ role: 'user', text: 'vd on 100ft 12 awg 20a', tool: 'voltage_drop', params: { awg: 12, amps: 20, feet: 100 } }],
  });
  const merged = inheritParams({ awg: 10, amps: null, feet: null }, context, 'voltage_drop');
  assert.equal(merged.awg, 10, 'what the new question said always wins');
  assert.equal(merged.amps, 20, 'and the rest carries forward');
  assert.equal(merged.feet, 100);
});

test('inheritance never crosses tools', () => {
  const context = ground({
    conversation: [{ role: 'user', text: 'x', tool: 'box_fill', params: { awg: 12, conductors: 6 } }],
  });
  const merged = inheritParams({ awg: null }, context, 'voltage_drop');
  assert.equal(merged.awg, null, 'a box fill answer must not seed a voltage drop');
});

test('memory is capped and truncated', () => {
  const long = Array.from({ length: 40 }, (_, i) => ({ role: 'user', text: `q${i}`.repeat(500) }));
  const context = ground({ conversation: long });
  assert.equal(context.recent.length, MEMORY_TURNS);
  assert.ok(context.recent.every((t) => t.text.length <= 500));
});

// ─── Grounding leaks ─────────────────────────────────────────────────────────

test('customer information never reaches the model context', () => {
  const project = {
    name: 'Starbucks Ybor',
    address: '1600 E 8th Ave, Tampa FL',
    customerId: 'cust_991',
    customerPhone: '813-555-0100',
    photos: [{ id: 'p', uri: 'file://x' }],
    artifacts: [],
  };
  const ctx = modelContext(ground({ project }));
  const json = JSON.stringify(ctx);

  assert.ok(json.includes('Starbucks Ybor'), 'the job name is useful and stays');
  assert.ok(!json.includes('1600 E 8th'), 'the address does not');
  assert.ok(!json.includes('cust_991'));
  assert.ok(!json.includes('813-555-0100'));
});

test('unreviewed detections never reach the model context', () => {
  const devices = [...confirmedDevices(), createDevice({ symbolId: 'receptacle', confidence: 0.9, box: box(999), origin: Origin.AI })];
  const ctx = modelContext(ground({ devices }));
  assert.equal(ctx.takeoff.receptacle, 7, 'the unconfirmed one is not in the counts');
});

test('the model is told what it may not do', () => {
  const joined = SYSTEM_RULES.join(' ');
  assert.match(joined, /may NOT state a conductor size/);
  assert.match(joined, /may NOT cite the NEC/);
  assert.match(joined, /can't verify this/);
  assert.match(joined, /energized/);
});

// ─── Tools ───────────────────────────────────────────────────────────────────

test('every tool is well formed and cites what it claims', () => {
  for (const t of TOOLS) {
    assert.ok(t.id && t.answers && t.tab, JSON.stringify(t));
    assert.ok(t.params.length > 0, `${t.id} needs nothing, which cannot be right`);
    for (const p of t.params) assert.ok(t.ask[p], `${t.id} cannot ask for "${p}"`);
    assert.ok(t.triggers.length > 0, `${t.id} can never be matched`);
  }
  assert.equal(new Set(TOOLS.map((t) => t.id)).size, TOOLS.length);
});

test('tool results carry citations that resolve', () => {
  const results = [
    runTool('voltage_drop', { awg: 12, amps: 20, feet: 100 }),
    runTool('box_fill', { awg: 12, conductors: 6, devices: 1 }),
    runTool('conduit_fill', { awg: 12, conduitSize: '1/2"' }),
    runTool('derating', { awg: 12, ccc: 6 }),
  ];
  for (const r of results) {
    assert.equal(r.provenance, Provenance.ENGINE, r.reason);
    assert.ok(r.sources.length > 0, 'an engine answer still shows its authority');
    for (const s of r.sources) assert.ok(resolveCitation(s.ref));
  }
});

test('the conduit tool agrees with the conduit engine', () => {
  const viaTool = runTool('conduit_fill', { awg: 12, conduitSize: '1/2"', count: 9 });
  const viaEngine = fillFor({ conduitType: 'EMT', tradeSize: '1/2"', insulation: 'THHN', gauge: '12', count: 9 });
  assert.match(viaTool.text, new RegExp(viaEngine.percent.toFixed(1)));
  assert.equal(viaEngine.passed, true);
});

test('derating applies the small-conductor cap last', () => {
  const r = runTool('derating', { awg: 12, ccc: 6 });
  assert.match(r.text, /20 A/);
  assert.match(r.detail, /small-conductor rule/);
  assert.deepEqual(r.sources.map((s) => s.ref).sort(), ['240.4(D)', '310.15(C)(1)']);
});

test('adjustment factors match Table 310.15(C)(1)', () => {
  assert.equal(adjustmentFactor(3), 1);
  assert.equal(adjustmentFactor(6), 0.8);
  assert.equal(adjustmentFactor(9), 0.7);
  assert.equal(adjustmentFactor(20), 0.5);
  assert.equal(adjustmentFactor(41), 0.35);
});

test('a tool asked for data it does not have refuses instead of extrapolating', () => {
  const r = runTool('voltage_drop', { awg: 4000, amps: 20, feet: 50 });
  assert.equal(r.provenance, Provenance.REFUSED);
  assert.match(r.reason, /No resistance value on file/);
});

test('an unknown tool refuses', () => {
  assert.equal(runTool('teleporter', {}).provenance, Provenance.REFUSED);
});

// ─── Knowledge base ──────────────────────────────────────────────────────────

test('EVERY citation in the knowledge base resolves', () => {
  for (const e of KNOWLEDGE) {
    assert.ok(e.refs.length > 0, `${e.id} states something with no reference`);
    for (const ref of e.refs) {
      assert.ok(resolveCitation(ref), `${e.id} cites "${ref}", which does not resolve`);
    }
  }
});

test('knowledge entries state principle, never a specific answer', () => {
  for (const e of KNOWLEDGE) {
    assert.ok(e.short && e.explain, `${e.id} is incomplete`);
    // A number-with-a-unit here would be a calculation wearing a citation.
    assert.ok(!/\buse\s+#?\d+\s*AWG\b/i.test(e.short + e.explain),
      `${e.id} gives a specific conductor size, which belongs in a tool`);
  }
});

test('the longest matching topic wins', () => {
  assert.equal(find('tell me about conduit fill').id, 'conduit-fill');
  assert.equal(find('gfci line and load').id, 'gfci-line-load');
  // A miss returns null so the question routes onward. A wrong hit would answer
  // confidently about the wrong topic, which is worse than not answering.
  assert.equal(find('what is the weather'), null);
  assert.equal(find(''), null);
  assert.equal(find(null), null);
});

test('the GFCI entry does not let the switch exception generalise', () => {
  const e = byId('gfci-line-load');
  assert.match(e.explain, /does not generalise/i);
  assert.match(e.explain, /dimmers|timers|smart switches/i);
});

// ─── The footer the UI renders ───────────────────────────────────────────────

test('the footer tells the user how much to trust it', async () => {
  const engine = answerFooter(await ask('voltage drop 100 feet 12 AWG 20 amps'));
  assert.equal(engine.reproducible, true);
  assert.equal(engine.showVerifyPrompt, false);
  assert.equal(engine.label, PROVENANCE_LABEL.ENGINE);

  const model = answerFooter(await ask('give me some general encouragement about the trade', {
    askModel: async () => ({ text: 'It is a good trade to be in.', confidence: 0.9 }),
  }));
  assert.equal(model.showVerifyPrompt, true, 'a generated answer says so');
  assert.equal(model.reproducible, false);
});

test('the manifest tells the model what the app can compute', () => {
  const m = toolManifest();
  assert.equal(m.length, TOOLS.length);
  for (const t of m) {
    assert.ok(t.id && t.answers && Array.isArray(t.requires));
    assert.ok(toolById(t.id));
  }
});
