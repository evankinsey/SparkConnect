// ─── LEARN BECOMES TOOLS ─────────────────────────────────────────────────────
// The move is only safe if nothing gets lost in it. These tests hold that:
// every tool is reachable, every available study track still has a home, and
// no section points at a screen that does not exist.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  TOOLS, toolsGrouped, toolById, toolFor, TOOL_SECTIONS, Section, SECTION_LABEL,
  parentToolForTrack, orphanedTracks, tracksForTool,
} from '../src/core/learn/tools.js';
import { HOME_CARDS, CardKind, allTools } from '../src/core/home/layout.js';
import { TRACKS } from '../src/core/learn/curriculum.js';

const validTabs = () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.js'), 'utf8');
  const m = src.match(/const VALID_TABS\s*=\s*\[([^\]]*)\]/);
  assert.ok(m, 'App.js must declare VALID_TABS');
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
};

test('tools are derived from the card catalog, not a second list', () => {
  const toolIds = TOOLS().map((t) => t.id);
  const cardIds = allTools().map((c) => c.id);
  assert.deepEqual(toolIds, cardIds,
    'a feature must not be able to exist in one catalog and not the other');
});

test('every tool opens to the thing it is, never to a menu', () => {
  for (const t of TOOLS()) {
    assert.ok(t.tab, `${t.id} has no destination`);
    assert.ok(t.title && t.icon, `${t.id} is missing display fields`);
  }
});

test('every section points at a screen that actually exists', () => {
  const VALID = validTabs();
  for (const t of TOOLS()) {
    assert.ok(VALID.includes(t.tab), `${t.id} opens "${t.tab}", which is not a real tab`);
    for (const s of t.sections) {
      assert.ok(VALID.includes(s.tab),
        `${t.id} · ${s.section} points at "${s.tab}", which is not a real tab`);
    }
  }
});

test('a tool with no lessons has no Lessons tab, rather than an empty one', () => {
  // Inventing a section that opens a blank screen is worse than not having it.
  for (const t of TOOLS()) {
    const labels = t.sections.map((s) => s.section);
    assert.equal(new Set(labels).size, labels.length, `${t.id} has a duplicate section`);
    if (!t.hasLessons) {
      assert.ok(!t.sections.some((s) => s.section === Section.LESSONS));
    }
  }
  const wire = toolById('wire');
  assert.equal(wire.hasLessons, false, 'the colour reference has nothing to teach yet');
  assert.equal(wire.sections.length, 1);
});

test('the tools people learn with have all three sections', () => {
  for (const id of ['bend', 'volt', 'boxfill', 'conduitfill', 'ampacity', 'wiring_lab']) {
    const t = toolById(id);
    assert.ok(t, `${id} is missing`);
    assert.equal(t.hasLessons, true, `${id} should teach`);
    assert.equal(t.hasPractice, true, `${id} should let you practise`);
    assert.equal(t.sections.length, 3);
  }
});

test('sections carry a human label, not an enum name', () => {
  for (const t of TOOLS()) {
    for (const s of t.sections) {
      assert.ok(s.label && s.label !== s.section, `${t.id} · ${s.section} shows a raw enum`);
      assert.equal(s.sectionLabel, SECTION_LABEL[s.section]);
    }
  }
});

test('NO study track is orphaned by the move', () => {
  // The requirement that makes this safe to ship. An available track with no
  // parent tool is content that used to be reachable and now is not.
  const orphans = orphanedTracks();
  assert.deepEqual(orphans.map((t) => t.id), [],
    `these tracks lost their home: ${orphans.map((t) => t.id).join(', ')}`);
});

test('every available track resolves to exactly one parent tool', () => {
  for (const track of TRACKS.filter((t) => t.available)) {
    const parent = parentToolForTrack(track);
    assert.ok(parent, `${track.id} has no parent tool`);
    assert.ok(tracksForTool(parent.id).some((t) => t.id === track.id),
      `${track.id} does not appear under its own parent ${parent.id}`);
  }
});

test('an unbuilt track is exempt rather than pretended into a home', () => {
  // Being honest about not being built is different from being lost.
  const unbuilt = TRACKS.filter((t) => !t.available);
  assert.ok(unbuilt.length > 0, 'the roadmap entries are still listed');
  for (const t of unbuilt) assert.equal(parentToolForTrack(t), null);
});

test('grouping keeps every tool and invents none', () => {
  const grouped = toolsGrouped().flatMap((g) => g.tools.map((t) => t.id));
  assert.deepEqual([...grouped].sort(), [...TOOLS().map((t) => t.id)].sort());
  assert.equal(new Set(grouped).size, grouped.length);
  for (const g of toolsGrouped()) assert.ok(g.group && g.tools.length > 0);
});

test('every wired tool id is a real card', () => {
  for (const id of Object.keys(TOOL_SECTIONS)) {
    assert.ok(HOME_CARDS.some((c) => c.id === id),
      `TOOL_SECTIONS wires "${id}", which is not in the card catalog`);
  }
});

test('a card with no section wiring still becomes a usable tool', () => {
  // Adding a card must not require touching this file to stay reachable.
  const fake = { id: 'brand_new', kind: CardKind.SHORTCUT, tab: 'calculators', title: 'New', sub: 's', icon: 'flash', group: 'Tools' };
  const t = toolFor(fake);
  assert.equal(t.tab, 'calculators', 'it falls back to the card own tab');
  assert.equal(t.sections.length, 0);
  assert.equal(t.hasLessons, false);
});

test('Learn survives as a tool rather than disappearing', () => {
  const learn = toolById('learn');
  assert.ok(learn, 'the study-path index is still reachable');
  assert.equal(learn.tab, 'learn');
});
