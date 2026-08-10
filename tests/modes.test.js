// ─── SPARKAI MODES ───────────────────────────────────────────────────────────
// The test that matters: a mode has to change what is on screen. Four chips
// that only swap a hidden prompt prefix are decoration.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Mode, MODES, MODE_IDS, modeById, promptFor,
  Attachment, ATTACHMENTS, attachmentTray,
  AnswerAction, answerActions, SIMPLIFY_PROMPT, sourceBadge,
  historyGroups, searchHistory,
} from '../src/core/ai/modes.js';

test('every mode presents a different way in', () => {
  // Previously all four showed an identical empty text box, so picking one
  // changed nothing the user could see.
  const seen = new Set();
  for (const m of MODES) {
    assert.ok(m.headline && m.sub, `${m.id} does not say what it is for`);
    assert.ok(m.entries.length >= 4, `${m.id} offers no ways in`);
    assert.ok(!seen.has(m.headline), `${m.id} reuses another mode's headline`);
    seen.add(m.headline);
    assert.ok(m.placeholder && m.placeholder !== MODES[0].placeholder || m.id === Mode.GENERAL,
      `${m.id} shares the generic placeholder`);
  }
});

test('Explain Simply is an action, never a mode', () => {
  // It was the odd one out: the others describe a kind of QUESTION, that one
  // describes a kind of ANSWER. You decide you want it plainer after reading
  // the answer, not before asking.
  assert.equal(MODE_IDS.length, 4);
  assert.deepEqual([...MODE_IDS], ['general', 'nec', 'troubleshoot', 'estimate']);
  for (const m of MODES) {
    assert.doesNotMatch(m.label, /simpl|apprentice/i, `${m.id} is still a mode`);
  }
  const acts = answerActions({ provenance: 'MODEL' }).map((a) => a.id);
  assert.ok(acts.includes(AnswerAction.SIMPLIFY));
  assert.match(SIMPLIFY_PROMPT, /apprentice/i);
  // Simplifying must not be licence to change the numbers.
  assert.match(SIMPLIFY_PROMPT, /keep every number and code reference exactly/i);
});

test('troubleshoot offers symptoms, not causes', () => {
  // A list of causes hands over the answer before anybody has tested anything,
  // which is the opposite of how the investigation flow works.
  const t = modeById(Mode.TROUBLESHOOT);
  for (const e of t.entries) {
    assert.doesNotMatch(e.label, /loose neutral|bad breaker|open ground is|because/i,
      `${e.id} states a cause: ${e.label}`);
  }
  assert.ok(t.photoAction, 'troubleshooting without a photo path');
});

test('the prompt sent matches the chip that is lit', () => {
  assert.equal(promptFor(Mode.GENERAL, 'hello'), 'hello');
  assert.match(promptFor(Mode.NEC, '210.8'), /^NEC code question: 210\.8$/);
  assert.match(promptFor(Mode.TROUBLESHOOT, 'dead outlet'), /troubleshoot/i);
  // Empty stays empty rather than sending a bare prefix to the model.
  assert.equal(promptFor(Mode.NEC, '   '), '');
  assert.equal(promptFor('not_a_mode', 'x'), 'x', 'an unknown mode must still work');
});

test('the attachment tray marks what is not built rather than hiding it', () => {
  // A row that opens nothing reads as broken; a row that says "not yet" reads
  // as honest.
  const tray = attachmentTray({ hasProjects: true });
  assert.equal(tray.length, ATTACHMENTS.length);
  assert.ok(tray.some((a) => a.ready === false), 'everything claims to be ready');
  assert.ok(tray.find((a) => a.id === Attachment.CAMERA).ready);
  assert.ok(tray.find((a) => a.id === Attachment.PROJECT).ready);
});

test('project attachment is offered only when there are projects', () => {
  const none = attachmentTray({ hasProjects: false }).find((a) => a.id === Attachment.PROJECT);
  assert.equal(none.ready, false, 'a dead end dressed as a feature');
  assert.match(none.note, /Start a project first/);
});

test('an action never appears when it would do nothing', () => {
  // A Source button under an answer with no citation opens a shrug, which
  // undermines the exact claim it was added to demonstrate.
  const bare = answerActions({ provenance: 'MODEL' }).map((a) => a.id);
  assert.ok(!bare.includes(AnswerAction.SOURCE));
  assert.ok(!bare.includes(AnswerAction.CALCULATE));

  const full = answerActions({
    provenance: 'ENGINE', citations: ['NEC 210.8(A)'], tab: 'volt',
  }).map((a) => a.id);
  assert.ok(full.includes(AnswerAction.SOURCE));
  assert.ok(full.includes(AnswerAction.CALCULATE));

  // A refusal has no answer under it to simplify.
  const refused = answerActions({ provenance: 'REFUSED' }).map((a) => a.id);
  assert.ok(!refused.includes(AnswerAction.SIMPLIFY));

  // Save is always offered, and reflects whether it already happened.
  assert.ok(bare.includes(AnswerAction.SAVE));
  assert.equal(answerActions({ projectId: 'p1' }).find((a) => a.id === AnswerAction.SAVE).done, true);

  // Simplifying twice is not offered.
  assert.ok(!answerActions({ alreadySimplified: true }).map((a) => a.id).includes(AnswerAction.SIMPLIFY));
});

test('the source badge never vouches for something nobody checked', () => {
  const unverified = sourceBadge({ edition: 'NEC 2023', article: '210.8(A)' });
  assert.equal(unverified.verified, false);
  assert.match(unverified.label, /not yet verified/i);
  assert.doesNotMatch(unverified.label, /verified source available/i);

  const verified = sourceBadge({ edition: 'NEC 2023', article: '210.8(A)', verified: true });
  assert.equal(verified.tone, 'VERIFIED');
  assert.match(verified.label, /against print/i);

  // No article, no badge — an empty box implying a source is worse than none.
  assert.equal(sourceBadge({ edition: 'NEC 2023' }), null);
  assert.equal(sourceBadge({}), null);
  assert.equal(sourceBadge(), null);
});

test('history is grouped the way somebody looks for it', () => {
  // Nobody remembers asking about GFCI at 11:32. They remember it was this
  // morning.
  const now = new Date('2026-08-09T15:00:00Z');
  const iso = (d) => new Date(d).toISOString();
  const groups = historyGroups([
    { id: 'a', title: 'Today thing', updatedAt: iso('2026-08-09T09:00:00Z') },
    { id: 'b', title: 'Yesterday thing', updatedAt: iso('2026-08-08T09:00:00Z') },
    { id: 'c', title: 'This week thing', updatedAt: iso('2026-08-05T09:00:00Z') },
    { id: 'd', title: 'Old thing', updatedAt: iso('2026-01-01T09:00:00Z') },
  ], now);
  assert.deepEqual(groups.map((g) => g.label), ['Today', 'Yesterday', 'This week', 'Earlier']);
  assert.equal(groups[0].items[0].id, 'a');

  // Empty groups are dropped rather than rendered as headers with nothing under.
  const sparse = historyGroups([{ id: 'x', updatedAt: iso('2026-08-09T09:00:00Z') }], now);
  assert.deepEqual(sparse.map((g) => g.label), ['Today']);
  assert.deepEqual([...historyGroups([], now)], []);
  assert.deepEqual([...historyGroups(null, now)], []);
});

test('history search reads titles and the opening question', () => {
  const list = [
    { id: 'a', title: '200A Service Upgrade', turns: [{ text: 'price for a 200 amp service' }] },
    { id: 'b', title: 'Bathroom GFCI', turns: [{ text: 'do bathrooms need gfci' }] },
  ];
  assert.deepEqual(searchHistory(list, 'gfci').map((c) => c.id), ['b']);
  assert.deepEqual(searchHistory(list, '200 amp').map((c) => c.id), ['a'], 'the question body is searchable too');
  assert.equal(searchHistory(list, '').length, 2);
  assert.equal(searchHistory(null, 'x').length, 0);
});
