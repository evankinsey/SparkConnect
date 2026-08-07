// ─── JOB LIFECYCLE ───────────────────────────────────────────────────────────
// Arrival → estimate → permit → photos → materials → inspection → completion →
// warranty → the service call three years later. One timeline, forever.
//
// The design decision this file turns on: A STAGE IS DERIVED FROM EVIDENCE, NOT
// SET BY A DROPDOWN.
//
// Every job-tracking app starts with a status field, and every one of them ends
// up with jobs sitting in "In Progress" that finished eight months ago, because
// updating the status is work that benefits nobody standing in front of the
// panel. A stage that is computed from "an invoice exists and is paid in full"
// cannot go stale, cannot be forgotten, and cannot be wrong in a way the record
// itself does not already show.
//
// Two consequences worth stating, because they are design, not omission:
//
//   · STAGES ARE MILESTONES, NOT A STATE MACHINE. Real jobs buy material before
//     the permit comes through, and inspect in two passes. Out-of-order stages
//     are reported as fact, never as an error, and nothing is ever "skipped".
//
//   · THE TIMELINE DOES NOT CLOSE. Warranty and service are stages like any
//     other, and a job reaching completion is not archived — a call-out in 2029
//     lands on the same timeline as the rough-in in 2026. That is the whole
//     point of "forever", and it is why there is no `finalise` function here.
//
// Pure module: no React, no storage.

import { ArtifactKind, artifactsOfKind, KIND_LABEL } from './projectArtifacts.js';
import { hydrate, emptyWorld } from './projectHub.js';
import { logsForProject, renderLogText } from './dailyLog.js';
import { totalsFor } from './documents.js';

// ─── Time ────────────────────────────────────────────────────────────────────

/**
 * The stores disagree about what a timestamp is: artifacts use epoch millis,
 * photos and projects use ISO strings, daily logs use a bare calendar date.
 * Sorting those together without normalising puts 2026 before 1970 and reads as
 * a corrupt timeline rather than a bug.
 *
 * Returns null for anything unparseable — never 0, which would sort to the
 * epoch and pin an undated record to the bottom of the job forever.
 */
export const atMs = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  // A bare calendar date is midnight UTC, not "now".
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

const earliest = (values) => {
  const times = values.map(atMs).filter((t) => t !== null);
  return times.length ? Math.min(...times) : null;
};

export const DAY_MS = 86400000;

// ─── Stages ──────────────────────────────────────────────────────────────────
//
// Each stage says what counts as evidence it happened. `evidence` returns
// { reached, at, detail } — the timestamp is the EARLIEST qualifying record,
// because a stage was reached when it first happened, not when it was last
// touched.

const forProject = (list, id) => (list ?? []).filter((x) => x && x.projectId === id);

export const STAGES = Object.freeze([
  {
    id: 'ARRIVAL', label: 'Arrival', icon: 'flag', recurring: false,
    describe: 'The job exists',
    evidence: (p) => ({
      reached: true,
      at: atMs(p.createdAt),
      detail: 'Project created',
    }),
  },
  {
    id: 'ESTIMATE', label: 'Estimate', icon: 'cash', recurring: false,
    describe: 'A price went to the customer',
    evidence: (p, w) => {
      const docs = forProject(w.estimates, p.id);
      const saved = artifactsOfKind(p, ArtifactKind.ESTIMATE);
      const at = earliest([...docs.map((d) => d.createdAt), ...saved.map((a) => a.savedAt)]);
      return { reached: docs.length + saved.length > 0, at, detail: docs.length ? `${docs.length} estimate(s)` : `${saved.length} saved` };
    },
  },
  {
    id: 'PERMIT', label: 'Permit', icon: 'document-text', recurring: false,
    describe: 'Pulled, or recorded as not required',
    evidence: (p, w) => {
      const permits = forProject(w.permits, p.id);
      const saved = artifactsOfKind(p, ArtifactKind.PERMIT);
      const at = earliest([...permits.map((x) => x.createdAt), ...saved.map((a) => a.savedAt)]);
      return { reached: permits.length + saved.length > 0, at, detail: permits[0]?.number || saved[0]?.meta?.permitNumber || 'Recorded' };
    },
  },
  {
    id: 'MATERIALS', label: 'Materials', icon: 'cart', recurring: false,
    describe: 'A list exists, or it has been picked up',
    evidence: (p, w) => {
      const lists = forProject(w.materialLists, p.id);
      const saved = artifactsOfKind(p, ArtifactKind.MATERIAL_LIST);
      const at = earliest([...lists.map((l) => l.createdAt), ...saved.map((a) => a.savedAt)]);
      const items = lists.reduce((n, l) => n + (l.items?.length ?? 0), 0);
      return { reached: lists.length + saved.length > 0, at, detail: items ? `${items} line(s)` : 'List started' };
    },
  },
  {
    id: 'WORK', label: 'Work on site', icon: 'camera', recurring: false,
    describe: 'Photos taken or a day logged',
    evidence: (p, w) => {
      const logs = logsForProject(w.logs, p.id);
      const at = earliest([...(p.photos ?? []).map((x) => x.capturedAt), ...logs.map((l) => l.date)]);
      const bits = [];
      if (p.photos?.length) bits.push(`${p.photos.length} photo(s)`);
      if (logs.length) bits.push(`${logs.length} day(s) logged`);
      return { reached: (p.photos?.length ?? 0) + logs.length > 0, at, detail: bits.join(' · ') || 'Started' };
    },
  },
  {
    id: 'INSPECTION', label: 'Inspection', icon: 'checkmark-circle', recurring: true,
    describe: 'An inspection happened — passed or not',
    evidence: (p, w) => {
      const fromPermits = forProject(w.permits, p.id).flatMap((x) => x.inspections ?? []);
      const saved = artifactsOfKind(p, ArtifactKind.INSPECTION);
      const at = earliest([...fromPermits.map((i) => i.scheduledFor), ...saved.map((a) => a.savedAt)]);
      const passed = fromPermits.filter((i) => i.result === 'PASSED').length;
      const n = fromPermits.length + saved.length;
      return { reached: n > 0, at, detail: n ? `${n} logged${passed ? `, ${passed} passed` : ''}` : 'None' };
    },
  },
  {
    id: 'COMPLETION', label: 'Completion', icon: 'trophy', recurring: false,
    describe: 'Invoiced and paid in full',
    evidence: (p, w) => {
      const invoices = forProject(w.invoices, p.id);
      const paid = invoices.filter((inv) => totalsFor(inv).isPaidInFull);
      if (!invoices.length) return { reached: false, at: null, detail: 'No invoice raised' };
      if (!paid.length) {
        const owed = invoices.reduce((n, inv) => n + totalsFor(inv).balanceDueCents, 0);
        return { reached: false, at: null, detail: `Invoiced, ${owed > 0 ? 'not yet paid' : 'awaiting payment'}` };
      }
      // Complete when every invoice is settled, dated by the last one settled.
      const all = paid.length === invoices.length;
      return {
        reached: all,
        at: all ? Math.max(...paid.map((inv) => atMs(inv.updatedAt) ?? atMs(inv.createdAt) ?? 0)) : null,
        detail: all ? 'Paid in full' : `${paid.length} of ${invoices.length} invoices paid`,
      };
    },
  },
  {
    id: 'WARRANTY', label: 'Warranty', icon: 'shield-checkmark', recurring: false,
    describe: 'The obligation that outlives the job',
    evidence: (p, w) => {
      const ws = forProject(w.warranties, p.id);
      const saved = artifactsOfKind(p, ArtifactKind.WARRANTY);
      const at = earliest([...ws.map((x) => x.startsAt ?? x.createdAt), ...saved.map((a) => a.savedAt)]);
      return { reached: ws.length + saved.length > 0, at, detail: `${ws.length + saved.length} on record` };
    },
  },
  {
    id: 'SERVICE', label: 'Service', icon: 'build', recurring: true,
    describe: 'Back on the same job, later',
    evidence: (p, w) => {
      // A service visit is a day logged or a photo taken after completion. It
      // is derived rather than declared, so nobody has to remember to file it.
      const completion = stageEvidence(p, w, 'COMPLETION');
      if (!completion.reached || completion.at === null) return { reached: false, at: null, detail: 'Job not complete yet' };
      const after = [
        ...logsForProject(w.logs, p.id).map((l) => atMs(l.date)),
        ...(p.photos ?? []).map((x) => atMs(x.capturedAt)),
        ...(p.artifacts ?? []).map((a) => atMs(a.savedAt)),
      ].filter((t) => t !== null && t > completion.at + DAY_MS);
      return {
        reached: after.length > 0,
        at: after.length ? Math.min(...after) : null,
        detail: after.length ? `${after.length} record(s) since completion` : 'None since completion',
      };
    },
  },
]);

export const STAGE_IDS = Object.freeze(STAGES.map((s) => s.id));
export const stageById = (id) => STAGES.find((s) => s.id === id) ?? null;

const stageEvidence = (p, w, id) => {
  const stage = stageById(id);
  if (!stage) return { reached: false, at: null, detail: '' };
  try {
    return stage.evidence(p, w) ?? { reached: false, at: null, detail: '' };
  } catch {
    return { reached: false, at: null, detail: 'Unavailable' };
  }
};

// ─── The lifecycle ───────────────────────────────────────────────────────────

/**
 * Where the job is, derived entirely from what is recorded.
 *
 * `current` is the FURTHEST stage reached, not the last in order — a job with an
 * invoice paid and no permit on file is at Completion, and the missing permit
 * shows up as a gap rather than by holding the job back.
 */
export const lifecycle = (proj, world = emptyWorld()) => {
  const p = hydrate(proj);
  if (!p) return null;
  const w = { ...emptyWorld(), ...(world ?? {}) };

  const stages = STAGES.map((s, index) => {
    const ev = stageEvidence(p, w, s.id);
    return {
      id: s.id, label: s.label, icon: s.icon, describe: s.describe,
      recurring: s.recurring, order: index,
      reached: !!ev.reached,
      at: ev.at ?? null,
      detail: ev.detail ?? '',
    };
  });

  const reached = stages.filter((s) => s.reached);
  const current = reached.length ? reached[reached.length - 1] : stages[0];
  const next = stages.find((s) => !s.reached) ?? null;

  // Gaps: unreached stages BEHIND the furthest one reached. Named as gaps, not
  // as errors — buying material before the permit lands is normal.
  const gaps = stages.filter((s) => !s.reached && s.order < current.order);

  // How long each reached stage sat before the next one started.
  const dated = reached.filter((s) => s.at !== null).sort((a, b) => a.at - b.at);
  const durations = dated.slice(0, -1).map((s, i) => Object.freeze({
    from: s.id, to: dated[i + 1].id,
    ms: dated[i + 1].at - s.at,
    days: Math.round((dated[i + 1].at - s.at) / DAY_MS),
  }));

  const first = dated[0]?.at ?? null;
  const last = dated[dated.length - 1]?.at ?? null;

  return Object.freeze({
    projectId: p.id,
    name: p.name,
    stages: Object.freeze(stages.map(Object.freeze)),
    current: Object.freeze(current),
    next: next ? Object.freeze(next) : null,
    gaps: Object.freeze(gaps.map((g) => Object.freeze({ id: g.id, label: g.label, describe: g.describe }))),
    durations: Object.freeze(durations),
    reachedCount: reached.length,
    totalStages: stages.length,
    firstActivity: first,
    lastActivity: last,
    elapsedDays: first !== null && last !== null ? Math.round((last - first) / DAY_MS) : null,
    // The job is never closed. Completion is a stage, not an end state.
    open: true,
  });
};

// ─── The timeline ────────────────────────────────────────────────────────────

export const EventKind = Object.freeze({
  STAGE: 'STAGE',
  PHOTO: 'PHOTO',
  ARTIFACT: 'ARTIFACT',
  LOG: 'LOG',
  PERMIT: 'PERMIT',
  INSPECTION: 'INSPECTION',
  MONEY: 'MONEY',
});

/**
 * Everything that ever happened on this job, in one ordered list.
 *
 * `projectTimeline` in projectArtifacts.js merges photos and artifacts. This
 * merges every source, normalises the three different timestamp formats they
 * use, and marks the entries that are stage transitions so a renderer can draw
 * the spine differently from the events hanging off it.
 *
 * Undated records are NOT dropped and NOT dated to the epoch — they are
 * returned separately, because a photo with no timestamp is still evidence and
 * silently discarding it is how a job loses its record.
 */
export const timeline = (proj, world = emptyWorld(), { newestFirst = true } = {}) => {
  const p = hydrate(proj);
  if (!p) return null;
  const w = { ...emptyWorld(), ...(world ?? {}) };

  const events = [];
  const undated = [];

  const push = (at, event) => {
    if (at === null) undated.push(Object.freeze({ ...event, at: null }));
    else events.push(Object.freeze({ ...event, at }));
  };

  const life = lifecycle(p, w);
  for (const s of life.stages) {
    if (!s.reached) continue;
    push(s.at, { kind: EventKind.STAGE, id: `stage:${s.id}`, stage: s.id, title: s.label, summary: s.detail, icon: s.icon });
  }

  for (const a of p.artifacts ?? []) {
    push(atMs(a.savedAt), {
      kind: EventKind.ARTIFACT, id: a.id, title: a.title,
      summary: a.summary, label: KIND_LABEL[a.kind] ?? a.kind, artifactKind: a.kind, icon: 'document',
    });
  }

  for (const ph of p.photos ?? []) {
    push(atMs(ph.capturedAt), {
      kind: EventKind.PHOTO, id: ph.id, title: ph.note || 'Photo',
      summary: (ph.tags ?? []).join(' · '), icon: 'image',
    });
  }

  for (const l of logsForProject(w.logs, p.id)) {
    push(atMs(l.date), {
      kind: EventKind.LOG, id: l.id, title: `Daily log — ${l.date}`,
      summary: l.workPerformed || renderLogText(l).split('\n')[1] || '', icon: 'today',
    });
  }

  for (const perm of forProject(w.permits, p.id)) {
    push(atMs(perm.createdAt), {
      kind: EventKind.PERMIT, id: perm.id, title: `Permit ${perm.number ?? ''}`.trim(),
      summary: [perm.ahj, perm.status].filter(Boolean).join(' · '), icon: 'document-text',
    });
    for (const insp of perm.inspections ?? []) {
      push(atMs(insp.scheduledFor), {
        kind: EventKind.INSPECTION, id: `${perm.id}:${insp.kind}`, title: `Inspection — ${insp.kind}`,
        summary: insp.result ?? 'Scheduled', icon: 'checkmark-circle',
      });
    }
  }

  for (const inv of forProject(w.invoices, p.id)) {
    const t = totalsFor(inv);
    push(atMs(inv.createdAt), {
      kind: EventKind.MONEY, id: inv.id, title: `Invoice ${inv.number ?? ''}`.trim(),
      summary: t.isPaidInFull ? 'Paid in full' : 'Raised', icon: 'receipt',
    });
  }

  events.sort((a, b) => (newestFirst ? b.at - a.at : a.at - b.at));

  return Object.freeze({
    events: Object.freeze(events),
    undated: Object.freeze(undated),
    count: events.length + undated.length,
    lifecycle: life,
    // Grouped by year, because "one timeline forever" needs a way to scroll
    // past the three years where nothing happened.
    years: Object.freeze(groupByYear(events)),
  });
};

const groupByYear = (events) => {
  const map = new Map();
  for (const e of events) {
    const y = new Date(e.at).getUTCFullYear();
    const list = map.get(y) ?? [];
    list.push(e);
    map.set(y, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => Object.freeze({ year, count: list.length, events: Object.freeze(list) }));
};

/** Plain text, for sharing a job history or pasting into a dispute. */
export const timelineText = (tl) => {
  if (!tl) return '';
  const out = [];
  for (const group of tl.years) {
    out.push(String(group.year), '─'.repeat(4));
    for (const e of [...group.events].sort((a, b) => a.at - b.at)) {
      const date = new Date(e.at).toISOString().slice(0, 10);
      const marker = e.kind === EventKind.STAGE ? '●' : '·';
      out.push(`${marker} ${date}  ${e.title}${e.summary ? ` — ${e.summary}` : ''}`);
    }
    out.push('');
  }
  if (tl.undated.length) {
    out.push('UNDATED', '───────');
    for (const e of tl.undated) out.push(`· ${e.title}${e.summary ? ` — ${e.summary}` : ''}`);
  }
  return out.join('\n').trim();
};
