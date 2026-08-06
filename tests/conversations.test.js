// ─── CONVERSATIONS AND PROJECT SCOPING ───────────────────────────────────────
// The worst possible output of this pipeline is a confident, evidenced answer
// about somebody else's building. These tests exist to make that unreachable.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GLOBAL_SCOPE, MAX_CONVERSATIONS, MAX_TURNS,
  conversation, turn, addTurn, rename, togglePinned, attachToProject, remove,
  sortConversations, capConversations, forScope, contextFor,
  wouldCrossContaminate, toArtifactSpec, resume,
} from '../src/core/ai/conversations.js';
import { ask, checkScope } from '../src/core/ai/sparkai.js';
import { Provenance } from '../src/core/ai/answer.js';
import { createArtifact, readPayload, ArtifactKind } from '../src/core/domain/projectArtifacts.js';
import { createDevice, Origin } from '../src/core/blueprint/device.js';
import { accept } from '../src/core/blueprint/verification.js';

const box = (x) => ({ x1: x, y1: 0, x2: x + 10, y2: 10 });
const devicesFor = (projectId, n = 5, symbolId = 'receptacle') =>
  Array.from({ length: n }, (_, i) => accept(createDevice({
    symbolId, confidence: 0.95, box: box(i * 20), origin: Origin.AI, meta: { projectId },
  })));

// ─── Scope enforcement ───────────────────────────────────────────────────────

test('a takeoff from another job cannot answer this job’s question', async () => {
  const r = await ask('how many receptacles on this job', {
    project: { id: 'p_starbucks', name: 'Starbucks Ybor' },
    devices: devicesFor('p_walgreens', 40),
  });
  assert.equal(r.provenance, Provenance.REFUSED,
    'a count from the wrong building must never be answered, however confident');
  assert.match(r.reason, /different project/i);
  assert.ok(!/\b40\b/.test(r.text), 'and the wrong number must not leak into the text');
});

test('the matching takeoff answers normally', async () => {
  const r = await ask('how many receptacles on this job', {
    project: { id: 'p_starbucks', name: 'Starbucks Ybor' },
    devices: devicesFor('p_starbucks', 5),
  });
  assert.equal(r.provenance, Provenance.PROJECT);
  assert.match(r.text, /5 receptacle/i);
});

test('scope is a refusal, not a filter', () => {
  // Filtering would answer from the half that matched, which still looks like a
  // complete answer and is not one.
  const mixed = [...devicesFor('p_a', 3), ...devicesFor('p_b', 3)];
  assert.ok(checkScope({ project: { id: 'p_a' }, devices: mixed }),
    'a mixed takeoff must be refused outright');
});

test('devices with no project attached are allowed through', () => {
  // A takeoff done before a project was picked is legitimate.
  const loose = Array.from({ length: 3 }, (_, i) => accept(createDevice({
    symbolId: 'receptacle', confidence: 0.95, box: box(i), origin: Origin.AI,
  })));
  assert.equal(checkScope({ project: { id: 'p_a' }, devices: loose }), null);
});

test('a conversation from another job cannot seed this one', () => {
  const err = checkScope({
    project: { id: 'p_a' },
    conversation: [{ role: 'user', text: 'earlier question', projectId: 'p_b' }],
  });
  assert.ok(err);
  assert.match(err, /different project/i);
});

test('contextFor returns nothing across a scope boundary', () => {
  let conv = conversation({ title: 'Starbucks', projectId: 'p_starbucks' });
  conv = addTurn(conv, turn({ role: 'user', text: 'vd on 100ft 12awg 20a', tool: 'voltage_drop', params: { awg: 12 } }));

  assert.equal(contextFor(conv, { projectId: 'p_starbucks' }).length, 1);
  assert.deepEqual(contextFor(conv, { projectId: 'p_walgreens' }), [],
    'memory from one job must not carry into another');
  assert.deepEqual(contextFor(conv, { projectId: GLOBAL_SCOPE }), []);
  assert.equal(wouldCrossContaminate(conv, 'p_walgreens'), true);
  assert.equal(wouldCrossContaminate(conv, 'p_starbucks'), false);
});

test('a global conversation stays global', () => {
  let conv = conversation({ title: 'General' });
  conv = addTurn(conv, turn({ role: 'user', text: 'what is a wire nut' }));
  assert.equal(contextFor(conv, { projectId: GLOBAL_SCOPE }).length, 1);
  assert.deepEqual(contextFor(conv, { projectId: 'p_a' }), [],
    'an unattached conversation is not everybody’s conversation');
});

test('the list for a project shows only that project', () => {
  const list = [
    conversation({ title: 'a', projectId: 'p_a' }),
    conversation({ title: 'b', projectId: 'p_b' }),
    conversation({ title: 'g' }),
  ];
  assert.deepEqual(forScope(list, 'p_a').map((c) => c.title), ['a']);
  assert.deepEqual(forScope(list, 'p_b').map((c) => c.title), ['b']);
  assert.deepEqual(forScope(list, GLOBAL_SCOPE).map((c) => c.title), ['g']);
});

// ─── Structured history, not free text ───────────────────────────────────────

test('a turn stores the evidence, not just the words', async () => {
  const answered = await ask('voltage drop on 100 feet of 12 AWG at 20 amps');
  const t = turn({ role: 'assistant', text: answered.text, evidence: answered.evidence });

  assert.ok(t.evidence, 'an answer read back in six months has to say what it came from');
  assert.equal(t.evidence.calculatedBy, 'voltage_drop');
  assert.equal(t.evidence.verificationStatus, 'UNVERIFIED');
  assert.deepEqual(t.evidence.inputsUsed.awg, 12);
});

test('stored evidence is frozen against later mutation', async () => {
  const answered = await ask('voltage drop on 100 feet of 12 AWG at 20 amps');
  const live = { ...answered.evidence };
  const t = turn({ role: 'assistant', text: 'x', evidence: live });
  live.calculatedBy = 'tampered';
  assert.equal(t.evidence.calculatedBy, 'voltage_drop',
    're-deriving or sharing the object would rewrite history');
});

test('a resumed answer says whether its data was verified at the time', async () => {
  const answered = await ask('voltage drop on 100 feet of 12 AWG at 20 amps');
  let conv = conversation({ title: 'x' });
  conv = addTurn(conv, turn({ role: 'assistant', text: answered.text, evidence: answered.evidence }));

  const back = resume(conv);
  assert.equal(back.turns[0].stale, true,
    'an old answer must not silently read as current once tables are verified');
});

// ─── Housekeeping ────────────────────────────────────────────────────────────

test('a conversation names itself from the first question', () => {
  let conv = conversation({});
  assert.equal(conv.title, 'New conversation');
  conv = addTurn(conv, turn({ role: 'user', text: 'why does my light dim' }));
  assert.equal(conv.title, 'why does my light dim');
  conv = addTurn(conv, turn({ role: 'user', text: 'and the other one' }));
  assert.equal(conv.title, 'why does my light dim', 'later turns do not rename it');
});

test('rename, pin, attach and delete behave', () => {
  let conv = conversation({ title: 'a', projectId: 'p_a' });
  assert.equal(rename(conv, 'Starbucks panel').title, 'Starbucks panel');
  assert.equal(rename(conv, '   ').title, 'a', 'a blank rename is ignored');
  assert.equal(togglePinned(conv).pinned, true);
  assert.equal(attachToProject(conv, 'p_b').projectId, 'p_b');
  assert.equal(attachToProject(conv, null).projectId, GLOBAL_SCOPE);
  assert.equal(remove([conv, conversation({ title: 'b' })], conv.id).length, 1);
});

test('pinned conversations sort above recent ones', () => {
  const old = { ...conversation({ title: 'old' }), pinned: true, updatedAt: 1 };
  const fresh = { ...conversation({ title: 'fresh' }), updatedAt: 999 };
  assert.deepEqual(sortConversations([fresh, old]).map((c) => c.title), ['old', 'fresh']);
});

test('conversations and turns are capped', () => {
  const many = Array.from({ length: MAX_CONVERSATIONS + 30 },
    (_, i) => ({ ...conversation({ title: `c${i}` }), updatedAt: i }));
  assert.equal(capConversations(many).length, MAX_CONVERSATIONS);

  let conv = conversation({});
  for (let i = 0; i < MAX_TURNS + 20; i++) conv = addTurn(conv, turn({ role: 'user', text: `t${i}` }));
  assert.equal(conv.turns.length, MAX_TURNS);
  assert.equal(conv.turns.at(-1).text, `t${MAX_TURNS + 19}`, 'newest kept');
});

// ─── Saving an answer to a project ───────────────────────────────────────────

test('an answer saved to a project keeps its evidence', async () => {
  const answered = await ask('voltage drop on 100 feet of 12 AWG at 20 amps');
  let conv = conversation({ title: 'x', projectId: 'p_a' });
  conv = addTurn(conv, turn({ role: 'user', text: 'voltage drop on 100 feet of 12 AWG at 20 amps' }));
  conv = addTurn(conv, turn({ role: 'assistant', text: answered.text, evidence: answered.evidence }));

  const spec = toArtifactSpec(conv, conv.turns[1].id);
  assert.ok(spec);
  assert.equal(spec.kind, ArtifactKind.AI_SUMMARY);
  assert.equal(spec.meta.verificationStatus, 'UNVERIFIED',
    'a saved answer still shows whether its data was checked when it was saved');

  // And it survives the round trip into a real artifact.
  const art = createArtifact(spec);
  assert.ok(art);
  assert.equal(readPayload(art).evidence.calculatedBy, 'voltage_drop');
  assert.match(readPayload(art).question, /voltage drop/);
});

test('only an assistant turn can be saved as an answer', () => {
  let conv = conversation({});
  conv = addTurn(conv, turn({ role: 'user', text: 'a question' }));
  assert.equal(toArtifactSpec(conv, conv.turns[0].id), null);
  assert.equal(toArtifactSpec(conv, 'nope'), null);
  assert.equal(toArtifactSpec(null, 'x'), null);
});

test('junk input does not break the store', () => {
  assert.equal(addTurn(null, null), null);
  assert.deepEqual(remove(null, 'x'), []);
  assert.deepEqual(forScope(null, 'p'), []);
  assert.deepEqual(contextFor(null), []);
  assert.equal(turn({ role: 'nonsense', text: null }).role, 'user');
  assert.equal(turn({ role: 'user', text: 123 }).text, '');
});
