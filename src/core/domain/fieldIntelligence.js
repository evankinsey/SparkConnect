// ─── FIELD INTELLIGENCE ENGINE ───────────────────────────────────────────────
// Blueprint → Project → Estimate → Materials → Bending → Voltage Drop → SparkAI
// → Photos → Inspection → Warranty → Invoice → Archive → Service call.
//
// Nothing isolated. Everything talks.
//
// The thing worth being careful about is what "talks" means, because the naive
// version of this feature is the dangerous one. If a takeoff automatically
// becomes an estimate, which automatically becomes a material list, which
// automatically becomes an invoice, then ONE MISCOUNTED SYMBOL is now wrong in
// four documents, two of which went to the customer, and nothing anywhere says
// they share an origin. Automation without lineage does not remove the error —
// it removes the chance of noticing it.
//
// So the engine is built on two rules, and they are what make the integration
// an asset rather than a liability:
//
//   1. HANDOFFS ARE PROPOSED, NEVER AUTOMATIC. The engine says "you have a
//      takeoff with 47 devices — this can become a material list" and a person
//      says yes. Nothing crosses a tool boundary on its own.
//
//   2. EVERY DERIVED THING REMEMBERS WHERE IT CAME FROM. A material list stamps
//      the takeoff it was built from. That single field is what lets the app
//      answer the question that actually matters on a job: "the takeoff was
//      wrong — what else is wrong?"
//
// That second rule is the moat. Any competitor can wire tool A to tool B in a
// weekend. Being able to trace a number on an invoice back through the material
// list and the estimate to the specific blueprint takeoff it came from, and to
// flag the invoice the moment that takeoff is superseded, is a different kind of
// product.
//
// Values are carried as SNAPSHOTS, never live joins — consistent with
// projectArtifacts.js. A number that went to a customer in March must still read
// the way it read in March.
//
// Pure module: no React, no storage, no network.

import {
  ArtifactKind, KIND_LABEL, createArtifact, artifactsOfKind, readPayload,
} from './projectArtifacts.js';
import { hydrate, emptyWorld } from './projectHub.js';

// ─── What flows between tools ────────────────────────────────────────────────

export const PayloadKind = Object.freeze({
  DEVICE_COUNT: 'DEVICE_COUNT',       // blueprint takeoff: symbols and counts
  ESTIMATE_LINES: 'ESTIMATE_LINES',   // priced scope
  MATERIAL_LINES: 'MATERIAL_LINES',   // what to buy
  CIRCUIT_SPEC: 'CIRCUIT_SPEC',       // load, length, conductor — feeds the calculators
  CALCULATION: 'CALCULATION',         // a computed result worth keeping
  PHOTO_SET: 'PHOTO_SET',
  PERMIT_RECORD: 'PERMIT_RECORD',
  INSPECTION_RECORD: 'INSPECTION_RECORD',
  INVOICE: 'INVOICE',
  WARRANTY: 'WARRANTY',
  JOB_CONTEXT: 'JOB_CONTEXT',         // everything SparkAI is allowed to see
});

/**
 * The tools, and what each one takes in and puts out.
 *
 * Declared as data so the graph is inspectable: a test can assert that every
 * handoff's payload is one the receiving tool actually consumes, which is the
 * check that stops the chain quietly breaking when a tool changes shape.
 */
export const TOOLS = Object.freeze([
  { id: 'blueprint', label: 'Blueprint AI', tab: 'blueprint',
    consumes: [], produces: [PayloadKind.DEVICE_COUNT] },
  { id: 'estimator', label: 'Estimator', tab: 'estimator',
    consumes: [PayloadKind.DEVICE_COUNT], produces: [PayloadKind.ESTIMATE_LINES] },
  { id: 'materials', label: 'Material List', tab: 'materials',
    consumes: [PayloadKind.ESTIMATE_LINES, PayloadKind.DEVICE_COUNT], produces: [PayloadKind.MATERIAL_LINES] },
  { id: 'bender', label: 'Pipe Bending', tab: 'bend',
    consumes: [PayloadKind.CIRCUIT_SPEC], produces: [PayloadKind.CALCULATION, PayloadKind.MATERIAL_LINES] },
  { id: 'voltagedrop', label: 'Voltage Drop', tab: 'volt',
    consumes: [PayloadKind.CIRCUIT_SPEC], produces: [PayloadKind.CALCULATION] },
  { id: 'panel', label: 'Panel Schedule', tab: 'panelschedule',
    consumes: [PayloadKind.DEVICE_COUNT], produces: [PayloadKind.CIRCUIT_SPEC, PayloadKind.CALCULATION] },
  { id: 'sparkai', label: 'SparkAI', tab: 'necai',
    consumes: [PayloadKind.JOB_CONTEXT], produces: [PayloadKind.CALCULATION] },
  { id: 'jobcam', label: 'Photos', tab: 'projects',
    consumes: [], produces: [PayloadKind.PHOTO_SET] },
  { id: 'permit', label: 'Permit', tab: 'permit',
    consumes: [PayloadKind.ESTIMATE_LINES], produces: [PayloadKind.PERMIT_RECORD] },
  { id: 'inspection', label: 'Inspection', tab: 'permit',
    consumes: [PayloadKind.PERMIT_RECORD, PayloadKind.PHOTO_SET], produces: [PayloadKind.INSPECTION_RECORD] },
  { id: 'invoice', label: 'Invoice', tab: 'estimator',
    consumes: [PayloadKind.ESTIMATE_LINES, PayloadKind.MATERIAL_LINES], produces: [PayloadKind.INVOICE] },
  { id: 'warranty', label: 'Warranty', tab: 'projects',
    consumes: [PayloadKind.INVOICE, PayloadKind.INSPECTION_RECORD], produces: [PayloadKind.WARRANTY] },
  { id: 'service', label: 'Service call', tab: 'projects',
    consumes: [PayloadKind.WARRANTY, PayloadKind.JOB_CONTEXT], produces: [PayloadKind.PHOTO_SET] },
]);

export const toolById = (id) => TOOLS.find((t) => t.id === id) ?? null;

/** Which artifact kind carries which payload — the bridge to what is stored. */
export const ARTIFACT_PAYLOAD = Object.freeze({
  [ArtifactKind.TAKEOFF]: PayloadKind.DEVICE_COUNT,
  [ArtifactKind.ESTIMATE]: PayloadKind.ESTIMATE_LINES,
  [ArtifactKind.MATERIAL_LIST]: PayloadKind.MATERIAL_LINES,
  [ArtifactKind.CALCULATION]: PayloadKind.CALCULATION,
  [ArtifactKind.PANEL_SCHEDULE]: PayloadKind.CIRCUIT_SPEC,
  [ArtifactKind.PERMIT]: PayloadKind.PERMIT_RECORD,
  [ArtifactKind.INSPECTION]: PayloadKind.INSPECTION_RECORD,
  [ArtifactKind.INVOICE]: PayloadKind.INVOICE,
  [ArtifactKind.WARRANTY]: PayloadKind.WARRANTY,
  [ArtifactKind.AI_SUMMARY]: PayloadKind.CALCULATION,
});

// ─── Provenance ──────────────────────────────────────────────────────────────

/**
 * Create an artifact that remembers its parents.
 *
 * `derivedFrom` is a list of artifact ids, stored in meta. It is the entire
 * mechanism — everything else in this section is graph-walking over that one
 * field. Deliberately a list, because a material list can come from a takeoff
 * AND a panel schedule and losing either parent breaks the trace.
 */
export const deriveArtifact = (spec, { from = [], tool = null } = {}) => {
  const parents = (Array.isArray(from) ? from : [from])
    .map((f) => (typeof f === 'string' ? f : f?.id))
    .filter((id) => typeof id === 'string' && id);

  return createArtifact({
    ...spec,
    meta: {
      ...(spec?.meta ?? {}),
      derivedFrom: parents,
      derivedBy: tool,
      derivedAt: spec?.savedAt ?? Date.now(),
    },
  });
};

const artifactIndex = (proj) => {
  const map = new Map();
  for (const a of proj?.artifacts ?? []) map.set(a.id, a);
  return map;
};

const parentsOf = (artifact) => {
  const raw = artifact?.meta?.derivedFrom;
  return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
};

/**
 * Walk backwards: everything this artifact was built from, transitively.
 *
 * Cycle-safe. A cycle should not be possible — an artifact can only name
 * parents that already existed — but a hand-edited or imported record can carry
 * one, and an infinite loop in a job screen is worse than a truncated trace.
 */
export const lineage = (proj, artifactId) => {
  const index = artifactIndex(hydrate(proj));
  const start = index.get(artifactId);
  if (!start) return null;

  const chain = [];
  const seen = new Set([artifactId]);
  const queue = [...parentsOf(start)];

  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const a = index.get(id);
    if (!a) {
      // The parent was deleted. Say so — a broken trace is information, and
      // silently omitting it would make the lineage look complete.
      chain.push(Object.freeze({ id, missing: true, title: 'Deleted record', kind: null, savedAt: null }));
      continue;
    }
    chain.push(Object.freeze({
      id: a.id, missing: false, title: a.title, kind: a.kind,
      label: KIND_LABEL[a.kind] ?? a.kind, savedAt: a.savedAt,
    }));
    queue.push(...parentsOf(a));
  }

  return Object.freeze({
    artifactId,
    title: start.title,
    ancestors: Object.freeze(chain.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))),
    // A trace with a hole in it cannot be relied on to be complete.
    complete: chain.every((c) => !c.missing),
    depth: chain.length,
  });
};

/** Walk forwards: everything built on top of this artifact, transitively. */
export const downstreamOf = (proj, artifactId) => {
  const p = hydrate(proj);
  const all = p?.artifacts ?? [];
  const children = new Map();
  for (const a of all) {
    for (const parent of parentsOf(a)) {
      const list = children.get(parent) ?? [];
      list.push(a);
      children.set(parent, list);
    }
  }

  const out = [];
  const seen = new Set([artifactId]);
  const queue = [...(children.get(artifactId) ?? [])];
  while (queue.length) {
    const a = queue.shift();
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(Object.freeze({
      id: a.id, title: a.title, kind: a.kind,
      label: KIND_LABEL[a.kind] ?? a.kind, savedAt: a.savedAt,
    }));
    queue.push(...(children.get(a.id) ?? []));
  }
  return Object.freeze(out.sort((a, b) => a.savedAt - b.savedAt));
};

/**
 * "This takeoff was wrong. What else is wrong?"
 *
 * The question the whole provenance mechanism exists to answer, and the one no
 * amount of tool-to-tool automation answers on its own. Anything that reached a
 * customer is called out separately, because those are the ones that need a
 * phone call rather than an edit.
 */
export const CUSTOMER_FACING = Object.freeze([ArtifactKind.ESTIMATE, ArtifactKind.INVOICE, ArtifactKind.WARRANTY]);

export const impactReport = (proj, artifactId) => {
  const p = hydrate(proj);
  const index = artifactIndex(p);
  const source = index.get(artifactId);
  if (!source) return null;

  const affected = downstreamOf(p, artifactId);
  const customerFacing = affected.filter((a) => CUSTOMER_FACING.includes(a.kind));

  return Object.freeze({
    source: Object.freeze({ id: source.id, title: source.title, kind: source.kind, savedAt: source.savedAt }),
    affected,
    customerFacing: Object.freeze(customerFacing),
    count: affected.length,
    summary: affected.length === 0
      ? 'Nothing was built on this. Correcting it affects only this record.'
      : `${affected.length} record${affected.length === 1 ? ' was' : 's were'} built on this and would need rechecking.`,
    warning: customerFacing.length
      ? `${customerFacing.length} of them went to the customer: ${customerFacing.map((a) => a.title).join(', ')}.`
      : null,
  });
};

/**
 * Work built on a source that has since been replaced.
 *
 * A second takeoff of the same plan supersedes the first. Everything derived
 * from the older one is now built on a number nobody believes any more — and
 * without this check, it looks exactly as current as everything else.
 */
export const supersededWork = (proj) => {
  const p = hydrate(proj);
  const all = p?.artifacts ?? [];
  const index = artifactIndex(p);

  // Newest artifact per kind is the live one; older ones of the same kind are
  // superseded. Only applies to kinds where one supersedes another — a second
  // photo does not replace the first, but a second takeoff replaces the first.
  const SUPERSEDING = [ArtifactKind.TAKEOFF, ArtifactKind.PANEL_SCHEDULE, ArtifactKind.MATERIAL_LIST];
  const stale = new Set();
  for (const kind of SUPERSEDING) {
    const ofKind = artifactsOfKind(p, kind).sort((a, b) => b.savedAt - a.savedAt);
    for (const old of ofKind.slice(1)) stale.add(old.id);
  }

  const out = [];
  for (const a of all) {
    const staleParents = parentsOf(a).filter((id) => stale.has(id));
    if (!staleParents.length) continue;
    out.push(Object.freeze({
      id: a.id, title: a.title, kind: a.kind, savedAt: a.savedAt,
      builtOn: Object.freeze(staleParents.map((id) => Object.freeze({
        id, title: index.get(id)?.title ?? 'Deleted record',
      }))),
      note: 'Built on a version that has since been replaced.',
    }));
  }
  return Object.freeze(out);
};

// ─── Handoffs ────────────────────────────────────────────────────────────────

/**
 * The chain, as edges. Each says what flows and what it takes to be ready.
 *
 * `ready` returns { ready, detail, sourceIds } from real project data — so a
 * handoff is never offered as an empty gesture, and the label can name the
 * actual counts rather than saying "create material list".
 */
const latestOfKind = (p, kind) => artifactsOfKind(p, kind).sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;

const fromArtifact = (kind, describe) => (p) => {
  const a = latestOfKind(p, kind);
  return a
    ? { ready: true, detail: describe(a), sourceIds: [a.id] }
    : { ready: false, detail: `No ${(KIND_LABEL[kind] ?? kind).toLowerCase()} yet`, sourceIds: [] };
};

const countIn = (artifact, key) => {
  const payload = readPayload(artifact);
  const value = payload?.[key];
  if (Array.isArray(value)) return value.length;
  if (Number.isFinite(value)) return value;
  return null;
};

export const HANDOFFS = Object.freeze([
  {
    id: 'takeoff-to-estimate', from: 'blueprint', to: 'estimator',
    payload: PayloadKind.DEVICE_COUNT, label: 'Price this takeoff',
    ready: fromArtifact(ArtifactKind.TAKEOFF, (a) => {
      const n = countIn(a, 'devices');
      return n === null ? a.summary || 'Takeoff ready' : `${n} device${n === 1 ? '' : 's'} counted`;
    }),
  },
  {
    id: 'estimate-to-materials', from: 'estimator', to: 'materials',
    payload: PayloadKind.ESTIMATE_LINES, label: 'Build the material list',
    ready: fromArtifact(ArtifactKind.ESTIMATE, (a) => a.summary || 'Estimate ready'),
  },
  {
    id: 'takeoff-to-panel', from: 'blueprint', to: 'panel',
    payload: PayloadKind.DEVICE_COUNT, label: 'Start the panel schedule',
    ready: fromArtifact(ArtifactKind.TAKEOFF, (a) => a.summary || 'Takeoff ready'),
  },
  {
    id: 'panel-to-voltagedrop', from: 'panel', to: 'voltagedrop',
    payload: PayloadKind.CIRCUIT_SPEC, label: 'Check voltage drop on these circuits',
    ready: fromArtifact(ArtifactKind.PANEL_SCHEDULE, (a) => a.summary || 'Panel schedule ready'),
  },
  {
    id: 'panel-to-bender', from: 'panel', to: 'bender',
    payload: PayloadKind.CIRCUIT_SPEC, label: 'Work out the pipe runs',
    ready: fromArtifact(ArtifactKind.PANEL_SCHEDULE, (a) => a.summary || 'Panel schedule ready'),
  },
  {
    id: 'estimate-to-permit', from: 'estimator', to: 'permit',
    payload: PayloadKind.ESTIMATE_LINES, label: 'Pull the permit for this scope',
    ready: fromArtifact(ArtifactKind.ESTIMATE, () => 'Scope is priced'),
  },
  {
    id: 'photos-to-inspection', from: 'jobcam', to: 'inspection',
    payload: PayloadKind.PHOTO_SET, label: 'Attach photos to the inspection',
    ready: (p) => {
      const n = (p.photos ?? []).filter((ph) => (ph.tags ?? []).includes('CONCEALED') || (ph.tags ?? []).includes('ROUGH_IN')).length;
      return n > 0
        ? { ready: true, detail: `${n} concealed-work photo${n === 1 ? '' : 's'}`, sourceIds: [] }
        : { ready: false, detail: 'No concealed or rough-in photos yet', sourceIds: [] };
    },
  },
  {
    id: 'materials-to-invoice', from: 'materials', to: 'invoice',
    payload: PayloadKind.MATERIAL_LINES, label: 'Bill the materials',
    ready: fromArtifact(ArtifactKind.MATERIAL_LIST, (a) => a.summary || 'Material list ready'),
  },
  {
    id: 'inspection-to-warranty', from: 'inspection', to: 'warranty',
    payload: PayloadKind.INSPECTION_RECORD, label: 'Start the warranty',
    ready: fromArtifact(ArtifactKind.INSPECTION, () => 'Inspection on record'),
  },
  {
    id: 'warranty-to-service', from: 'warranty', to: 'service',
    payload: PayloadKind.WARRANTY, label: 'Log a service visit',
    ready: fromArtifact(ArtifactKind.WARRANTY, (a) => a.summary || 'Under warranty'),
  },
]);

/** Every handoff has to make sense against the tool graph. */
export const validateGraph = () => {
  const problems = [];
  for (const h of HANDOFFS) {
    const from = toolById(h.from);
    const to = toolById(h.to);
    if (!from) problems.push(`${h.id}: unknown source tool "${h.from}"`);
    if (!to) problems.push(`${h.id}: unknown target tool "${h.to}"`);
    if (from && !from.produces.includes(h.payload)) problems.push(`${h.id}: ${h.from} does not produce ${h.payload}`);
    if (to && !to.consumes.includes(h.payload)) problems.push(`${h.id}: ${h.to} does not consume ${h.payload}`);
  }
  return Object.freeze(problems);
};

/**
 * What this job can do next, right now, with data it already has.
 *
 * This is the surface the brief is really asking for: not a menu of tools, but
 * a short list of moves that are available because of work already done.
 */
export const availableHandoffs = (proj, world = emptyWorld()) => {
  const p = hydrate(proj);
  if (!p) return Object.freeze({ ready: Object.freeze([]), blocked: Object.freeze([]) });
  const w = { ...emptyWorld(), ...(world ?? {}) };

  const ready = [];
  const blocked = [];
  for (const h of HANDOFFS) {
    let state;
    try { state = h.ready(p, w) ?? { ready: false, detail: '', sourceIds: [] }; }
    catch { state = { ready: false, detail: 'Unavailable', sourceIds: [] }; }

    const row = Object.freeze({
      id: h.id,
      label: h.label,
      from: h.from,
      fromLabel: toolById(h.from)?.label ?? h.from,
      to: h.to,
      toLabel: toolById(h.to)?.label ?? h.to,
      tab: toolById(h.to)?.tab ?? null,
      payload: h.payload,
      detail: state.detail,
      sourceIds: Object.freeze(state.sourceIds ?? []),
    });
    (state.ready ? ready : blocked).push(row);
  }
  return Object.freeze({ ready: Object.freeze(ready), blocked: Object.freeze(blocked) });
};

// ─── The engine's view of a job ──────────────────────────────────────────────

export const INTELLIGENCE_NOTE =
  'Handoffs are offered, never applied on their own. Anything carried from one tool to another is a '
  + 'snapshot of what was there at the time, and it records where it came from so a correction can be traced.';

/**
 * One object a screen can render: what can happen next, what is built on what,
 * and what is quietly out of date.
 */
export const intelligenceReport = (proj, world = emptyWorld()) => {
  const p = hydrate(proj);
  if (!p) return null;

  const handoffs = availableHandoffs(p, world);
  const stale = supersededWork(p);
  const derived = (p.artifacts ?? []).filter((a) => parentsOf(a).length > 0);

  return Object.freeze({
    projectId: p.id,
    nextMoves: handoffs.ready,
    blocked: handoffs.blocked,
    derivedCount: derived.length,
    tracedCount: derived.filter((a) => lineage(p, a.id)?.complete).length,
    superseded: stale,
    // A job where nothing is derived is not broken — it just has not used the
    // chain yet. Said plainly so the screen does not imply a problem.
    connected: derived.length > 0,
    note: INTELLIGENCE_NOTE,
  });
};

export { ArtifactKind, KIND_LABEL };
