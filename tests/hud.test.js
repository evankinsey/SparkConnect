// ─── JOB SITE HUD ────────────────────────────────────────────────────────────
// Two failures matter here and neither is cosmetic: a control the OS steals,
// and a HUD that covers the game.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Panel, DOCK, HUD, panelStyle, HOME_INDICATOR_MIN, STICK_FLOOR,
  stickAnchor, clearsHomeIndicator, density, hudLayout, togglePanel,
  MOTION, motion, PRESS_SCALE, xpBar, currency, taskProgress, completion,
  routeStyle, ROUTE,
} from '../src/core/game/hud.js';

// ─── The control the OS was eating ───────────────────────────────────────────

test('the stick is always clear of the home indicator', () => {
  // It sat at bottom: 0, so its lower third was inside the home indicator on
  // every iPhone since the X: drag down to walk down and the OS takes the
  // gesture. That is not polish, it is a control that does not work in one of
  // the four directions it exists to provide.
  for (const inset of [0, 20, 34, 48]) {
    for (const side of ['left', 'right']) {
      for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932]]) {
        const a = stickAnchor({ width, height, side, inset, radius: 62 });
        assert.ok(
          clearsHomeIndicator(a.bottom, a.radius, inset),
          `stick clipped at inset ${inset} on ${width}x${height} (${side})`,
        );
        // And the whole control, not just its centre, sits above the floor.
        assert.ok(a.bottom - a.radius >= HOME_INDICATOR_MIN, 'the stick still overlaps the indicator');
      }
    }
  }
});

test('a zero inset is never trusted', () => {
  // A device that reports no inset is not a device with no home indicator; it
  // is usually a measurement that has not arrived yet. Treating it as zero is
  // how the bug comes back on first render.
  const a = stickAnchor({ width: 390, height: 844, inset: 0 });
  assert.ok(a.bottom - a.radius >= HOME_INDICATOR_MIN);
  assert.equal(STICK_FLOOR > 0, true);
});

test('the stick can sit on either side and stays on screen', () => {
  const w = 390;
  const left = stickAnchor({ width: w, side: 'left' });
  const right = stickAnchor({ width: w, side: 'right' });
  assert.ok(left.x > left.radius * 0.3, 'left stick runs off the edge');
  assert.ok(right.x < w - right.radius * 0.3, 'right stick runs off the edge');
  assert.notEqual(left.x, right.x);
});

test('the HUD is told how much room the stick has claimed', () => {
  const a = stickAnchor({ width: 390, height: 844 });
  assert.ok(a.reserved > a.bottom, 'reserved must cover the whole control');
});

// ─── Not covering the game ───────────────────────────────────────────────────

test('only four things are always on screen', () => {
  // The mockup shows every panel at once. On a 6.1" phone that is ~40% of the
  // display, and all of it is over the part you are walking through.
  const l = hudLayout({ objective: { room: 'Kitchen' }, nearStation: { id: 'a' }, size: { width: 390, height: 844 } });
  assert.deepEqual(Object.keys(l.always).sort(), ['action', 'level', 'objective', 'stick']);
  assert.equal(l.always.stick, true, 'the stick is never optional');
  assert.equal(l.always.level, true);
});

test('a small iPhone drops the secondary dock slots rather than shrinking everything', () => {
  const se = density({ width: 320, height: 568 });
  assert.equal(se.compact, true);
  assert.ok(se.dock.length < DOCK.length, 'the SE draws the full desktop dock');
  for (const d of se.dock) assert.equal(d.always, true);
  // Nothing is deleted — the rest is reachable, just not permanently drawn.
  assert.ok(DOCK.length >= 5);

  const big = density({ width: 430, height: 932 });
  assert.equal(big.compact, false);
  assert.equal(big.dock.length, DOCK.length);
  assert.equal(big.showNextStepCard, true);
  assert.equal(se.showNextStepCard, false, 'the next-step card must collapse on a small screen');
  assert.ok(se.minimapSize < big.minimapSize);
});

test('the world keeps most of the screen on every size', () => {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
    const d = density({ width, height });
    assert.ok(d.maxHudFraction <= 0.4, `${width}x${height} budgets ${d.maxHudFraction} to the HUD`);
  }
});

test('two modal things never stack on the same strip of world', () => {
  const withDialogue = hudLayout({
    dialogue: { text: 'hi' }, objective: { room: 'Kitchen' }, size: { width: 390, height: 844 },
  });
  assert.equal(withDialogue.always.objective, false, 'the objective chip sits under the dialogue');
  assert.equal(withDialogue.nextStep, false);

  // A panel the player opened beats a dialogue that arrived.
  const withPanel = hudLayout({
    dialogue: { text: 'hi' }, openPanel: Panel.TASKS, size: { width: 390, height: 844 },
  });
  assert.equal(withPanel.dialogue, false);
  assert.equal(withPanel.panel, Panel.TASKS);
});

test('tapping the open panel closes it', () => {
  assert.equal(togglePanel(Panel.NONE, Panel.TASKS), Panel.TASKS);
  assert.equal(togglePanel(Panel.TASKS, Panel.TASKS), Panel.NONE);
  assert.equal(togglePanel(Panel.TASKS, Panel.MAP), Panel.MAP);
});

// ─── The glass ───────────────────────────────────────────────────────────────

test('panels are layered, not flat rectangles', () => {
  const flat = panelStyle();
  const raised = panelStyle({ raised: true });
  assert.notEqual(flat.backgroundColor, raised.backgroundColor, 'every panel is the same fill');
  assert.ok(raised.shadowRadius > flat.shadowRadius);
  assert.ok(raised.borderRadius >= flat.borderRadius);
  for (const s of [flat, raised]) {
    assert.equal(s.borderWidth, 1, 'the light-catching edge is what sells glass');
    assert.match(String(s.backgroundColor), /^rgba\(/, 'a HUD panel must be translucent');
  }
  assert.ok(HUD.radius >= 12 && HUD.radius <= 16);
});

test('colour carries a role, not a mood', () => {
  assert.equal(HUD.objective, '#22C55E');
  assert.equal(HUD.warn, '#F59E0B');
  assert.equal(HUD.system, '#3B82F6');
  assert.notEqual(HUD.text, '#FFFFFF', 'pure white on dark glass glares');
  assert.notEqual(HUD.textSec, HUD.text);
});

// ─── Motion ──────────────────────────────────────────────────────────────────

test('reduced motion means none, not brisk', () => {
  const off = motion(true);
  for (const k of Object.keys(MOTION)) assert.equal(off[k], 0, `${k} still animates`);
  const on = motion(false);
  for (const k of Object.keys(MOTION)) assert.ok(on[k] > 0, `${k} has no duration`);
});

test('nothing animates long enough to wait for', () => {
  // You see these on the fiftieth repetition, not the first.
  for (const [k, ms] of Object.entries(MOTION)) {
    if (k === 'markerPulse') continue; // a loop, not a transition
    assert.ok(ms <= 560, `${k} takes ${ms}ms`);
  }
  assert.ok(PRESS_SCALE > 0.9 && PRESS_SCALE < 1, 'the press scale is a bounce');
});

// ─── Readouts ────────────────────────────────────────────────────────────────

test('the XP bar cannot render past its ends', () => {
  assert.equal(xpBar({ into: 450, needed: 1200, level: 3 }).percent, 38);
  assert.equal(xpBar({ into: 5000, needed: 1200 }).percent, 100);
  assert.equal(xpBar({ into: -20, needed: 1200 }).percent, 0);
  assert.equal(xpBar({ into: 10, needed: 0 }).percent, 0, 'a zero requirement must not divide');
  assert.equal(xpBar({}).level, 1);
  assert.equal(xpBar(undefined).percent, 0);
});

test('currency shows but cannot be spent while credits are off', () => {
  // A shop that takes a currency the app has not shipped is a broken purchase.
  const off = currency({ balance: 1250, enabled: false });
  assert.equal(off.spendable, false);
  assert.equal(off.visible, false);
  assert.ok(off.note);

  const on = currency({ balance: 1250, enabled: true });
  assert.equal(on.visible, true);
  assert.equal(on.spendable, false, 'spending stays off until it is really built');
  assert.equal(on.balance, 1250);
});

test('the task header is derived from the rows', () => {
  const t = [{ done: true }, { done: true }, { done: false }, { done: false }];
  const p = taskProgress(t);
  assert.equal(p.label, '2/4');
  assert.equal(p.percent, 50);
  assert.equal(p.allDone, false);
  assert.equal(taskProgress([]).percent, 0);
  assert.equal(taskProgress(null).total, 0);
  assert.equal(taskProgress([{ done: true }]).allDone, true);
});

test('completion reports time without scoring it', () => {
  const c = completion({ tasks: [{ done: true }, { done: true }], xpEarned: 340, elapsedMs: 9 * 60000 });
  assert.equal(c.ready, true);
  assert.match(c.sub, /340 XP/);
  assert.match(c.timeNote, /9 min/);
  // A stopwatch on electrical work teaches somebody to hurry.
  assert.doesNotMatch(JSON.stringify(c), /fast|record|beat|rank|par time/i);

  assert.equal(completion({ tasks: [{ done: true }, { done: false }] }).ready, false);
});

// ─── The route line ──────────────────────────────────────────────────────────
// A flat stroke tells you where the path is. It does not tell you which way
// along it to walk — that comes from movement, and movement is the one thing
// Reduced Motion has to be able to switch off without losing the line.

test('the route dashes travel forward, and never backward', () => {
  const period = ROUTE.dash + ROUTE.gap;
  let previous = null;
  for (let t = 0; t < period; t += 1) {
    const { dashOffset } = routeStyle(t, { tile: 72 });
    assert.ok(dashOffset <= 0, `offset ${dashOffset} is positive — the dashes run backward`);
    assert.ok(dashOffset > -period - 0.001, 'the offset left its period');
    if (previous !== null && dashOffset > previous) {
      // Only legal at the wrap.
      assert.ok(previous < -period * 0.5, `offset jumped forward mid-cycle: ${previous} → ${dashOffset}`);
    }
    previous = dashOffset;
  }
});

test('reduced motion stops the dashes without hiding the line', () => {
  const still = routeStyle(40, { reduceMotion: true, tile: 72 });
  assert.equal(still.dashOffset, 0, 'the line is still animating');
  assert.ok(still.coreOpacity > 0.9, 'the line faded out instead of just holding still');
  assert.deepEqual(still.dashArray, routeStyle(40, { tile: 72 }).dashArray,
    'the dash pattern changed, so the line reads differently with motion off');
});

test('the route never fades to something hard to follow', () => {
  for (let t = 0; t < 120; t += 3) {
    const { coreOpacity, glowWidth, bodyWidth, coreWidth } = routeStyle(t, { tile: 72 });
    assert.ok(coreOpacity >= 0.72, `route dipped to ${coreOpacity.toFixed(2)} — it disappears`);
    assert.ok(coreOpacity <= 1);
    // Widest to narrowest, or the glow stops reading as a glow.
    assert.ok(glowWidth > bodyWidth && bodyWidth > coreWidth, 'the three strokes are out of order');
  }
});

test('the route scales with the tile rather than being fixed pixels', () => {
  const small = routeStyle(0, { tile: 48 });
  const big = routeStyle(0, { tile: 96 });
  assert.ok(big.coreWidth > small.coreWidth * 1.9, 'the line does not scale with the world');
});
