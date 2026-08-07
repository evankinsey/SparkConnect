// ─── PROJECT HUB ─────────────────────────────────────────────────────────────
// The project becomes the thing every other feature hangs off.
//
// Before this file, a project was a photo album with artifacts stapled to it,
// and the estimate, the invoice, the permit, the material list and the SparkAI
// conversation each lived in their own store knowing nothing about the job. A
// contractor could not open "Reyes panel upgrade" and see the job — only the
// photos of it.
//
// The hub does not move that data. Moving it would mean an estimate has two
// homes and one of them goes stale. Instead it draws the line explicitly:
//
//   OWNED    the project record holds it, and deleting the project deletes it:
//            customer, address, photos, daily logs, saved calculations, notes.
//   LINKED   it lives in its own store with its own lifecycle and points back by
//            projectId: estimates, invoices, permits, material lists,
//            warranties, conversations, blueprint takeoffs.
//
// Every section below declares which it is, so nobody has to guess where the
// truth for a given number lives — and so a delete can be honest about what it
// is actually going to remove.
//
// Pure module: no React, no storage, no network.

import { projectOverview, ArtifactKind, artifactsOfKind } from './projectArtifacts.js';
import { projectStats, TEMPLATES } from './jobcam.js';
import { logOverview, logsForProject } from './dailyLog.js';
import { formatMoney } from './money.js';
import { InvoiceStatus, EstimateStatus, totalsFor, isOverdue } from './documents.js';
import { PermitStatus } from './registry.js';

export const Ownership = Object.freeze({ OWNED: 'OWNED', LINKED: 'LINKED', ACTION: 'ACTION' });

/** A job logged within this many days is treated as still running. */
export const ACTIVE_JOB_DAYS = 3;

/** Whole days between two ISO calendar dates. Negative if `to` is earlier. */
const dayGap = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export const SectionGroup = Object.freeze({
  JOB: 'The job',
  FIELD: 'In the field',
  MONEY: 'Money',
  COMPLIANCE: 'Permit & compliance',
  INTELLIGENCE: 'Plans & AI',
  OUT: 'Getting it out',
});

// ─── Hydration ───────────────────────────────────────────────────────────────

/** Collections the hub expects a project to carry. Added, never replaced. */
const OWNED_COLLECTIONS = Object.freeze({
  photos: () => [],
  artifacts: () => [],
  folders: () => [],
  suggestedShots: () => [],
});

/**
 * Bring an older project record up to the hub shape.
 *
 * Idempotent and strictly additive: it fills in fields that are absent and never
 * overwrites one that is present, so running it on every load — which is what
 * the screen does — cannot erode a record over time. A project saved before this
 * file existed keeps every photo and every artifact it had.
 */
export const hydrate = (proj) => {
  if (!proj || typeof proj !== 'object') return null;
  const next = { ...proj };

  for (const [key, seed] of Object.entries(OWNED_COLLECTIONS)) {
    if (!Array.isArray(next[key])) next[key] = seed();
  }

  // The customer used to be an id pointing at a list that was never built. Keep
  // the id — a future shared customer list will want it — and add the record the
  // job screen actually edits.
  if (next.customer === undefined) next.customer = null;
  if (next.customerId === undefined) next.customerId = null;
  if (next.address === undefined) next.address = null;
  if (next.archived === undefined) next.archived = false;
  if (next.closedAt === undefined) next.closedAt = null;
  if (!next.updatedAt) next.updatedAt = next.createdAt ?? null;

  return next;
};

export const customerRecord = ({ name = '', phone = '', email = '', company = '', note = '' } = {}) => {
  const s = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const rec = {
    name: s(name, 120), phone: s(phone, 40), email: s(email, 160),
    company: s(company, 120), note: s(note, 500),
  };
  // An entirely blank customer is null, not an empty record — otherwise the hub
  // reports a customer on file when nobody entered one.
  return Object.values(rec).some(Boolean) ? Object.freeze(rec) : null;
};

export const setCustomer = (proj, fields) => ({
  ...hydrate(proj),
  customer: customerRecord(fields),
  updatedAt: new Date().toISOString(),
});

export const setAddress = (proj, address) => ({
  ...hydrate(proj),
  address: typeof address === 'string' && address.trim() ? address.replace(/\s+/g, ' ').trim().slice(0, 240) : null,
  updatedAt: new Date().toISOString(),
});

// ─── The world a project lives in ────────────────────────────────────────────

/**
 * Everything stored elsewhere that points back at this job. Passing it in — as
 * opposed to importing the stores — keeps this module pure and lets the tests
 * describe a whole job in one object literal.
 */
export const emptyWorld = () => Object.freeze({
  estimates: [], invoices: [], permits: [], materialLists: [],
  warranties: [], conversations: [], logs: [], takeoffs: [],
});

const forProject = (list, projectId) =>
  (list ?? []).filter((x) => x && x.projectId === projectId);

// ─── Sections ────────────────────────────────────────────────────────────────
//
// The canonical list of what a job is made of. The screen renders this array; it
// does not keep its own copy, so a new section appears everywhere at once.

export const SECTIONS = Object.freeze([
  {
    id: 'customer', label: 'Customer', icon: 'person', group: SectionGroup.JOB,
    ownership: Ownership.OWNED, tab: null,
    read: (proj) => {
      const c = proj.customer;
      return {
        present: !!c,
        count: c ? 1 : 0,
        detail: c ? [c.name, c.company].filter(Boolean).join(' · ') || c.phone || c.email : 'Nobody on file',
      };
    },
  },
  {
    id: 'address', label: 'Address', icon: 'location', group: SectionGroup.JOB,
    ownership: Ownership.OWNED, tab: null,
    read: (proj) => ({
      present: !!proj.address,
      count: proj.address ? 1 : 0,
      detail: proj.address || 'No site address',
    }),
  },
  {
    id: 'photos', label: 'Photos', icon: 'camera', group: SectionGroup.FIELD,
    ownership: Ownership.OWNED, tab: null,
    read: (proj) => {
      const s = projectStats(proj);
      return {
        present: s.photoCount > 0,
        count: s.photoCount,
        detail: s.photoCount
          ? `${s.photoCount} photo${s.photoCount === 1 ? '' : 's'}${s.untagged ? ` · ${s.untagged} untagged` : ''}`
          : 'No photos yet',
        warn: s.untagged > 0 ? `${s.untagged} untagged` : null,
      };
    },
  },
  {
    id: 'dailyLogs', label: 'Daily logs', icon: 'today', group: SectionGroup.FIELD,
    ownership: Ownership.LINKED, tab: null,
    read: (proj, world, opts) => {
      const o = logOverview(world.logs, proj.id, opts);
      // Nag only while the job is actually running. A job last worked in March
      // does not need to be told every day that today has no log — a warning
      // that is always on is a warning nobody reads.
      const running = !!(opts?.today && o.latestDate && dayGap(o.latestDate, opts.today) <= ACTIVE_JOB_DAYS);
      return {
        present: o.count > 0,
        count: o.count,
        detail: o.count
          ? `${o.count} day${o.count === 1 ? '' : 's'} logged · ${o.labor.totalHoursLabel} on site`
          : 'No days logged',
        warn: running && !o.loggedToday ? 'Nothing logged today' : null,
      };
    },
  },
  {
    id: 'calculations', label: 'Calculations', icon: 'calculator', group: SectionGroup.FIELD,
    ownership: Ownership.OWNED, tab: 'calculators',
    read: (proj) => {
      const n = artifactsOfKind(proj, ArtifactKind.CALCULATION).length;
      return { present: n > 0, count: n, detail: n ? `${n} saved to this job` : 'None saved to this job' };
    },
  },
  {
    id: 'blueprint', label: 'Blueprint takeoff', icon: 'documents', group: SectionGroup.INTELLIGENCE,
    ownership: Ownership.LINKED, tab: 'blueprint',
    read: (proj, world) => {
      const saved = artifactsOfKind(proj, ArtifactKind.TAKEOFF).length + forProject(world.takeoffs, proj.id).length;
      return { present: saved > 0, count: saved, detail: saved ? `${saved} takeoff${saved === 1 ? '' : 's'}` : 'No takeoff yet' };
    },
  },
  {
    id: 'estimate', label: 'Estimate', icon: 'cash', group: SectionGroup.MONEY,
    ownership: Ownership.LINKED, tab: 'estimator',
    read: (proj, world) => {
      const mine = forProject(world.estimates, proj.id);
      const accepted = mine.filter((e) => e.status === EstimateStatus.ACCEPTED);
      const head = accepted[0] ?? mine[0] ?? null;
      return {
        present: mine.length > 0,
        count: mine.length,
        detail: head
          ? `${accepted.length ? 'Accepted' : (head.status ?? 'Draft')} · ${formatMoney(totalsFor(head).totalCents)}`
          : 'No estimate',
      };
    },
  },
  {
    id: 'invoice', label: 'Invoices', icon: 'receipt', group: SectionGroup.MONEY,
    ownership: Ownership.LINKED, tab: 'estimator',
    read: (proj, world, opts) => {
      const mine = forProject(world.invoices, proj.id);
      if (!mine.length) return { present: false, count: 0, detail: 'No invoice' };
      let outstanding = 0;
      let overdue = 0;
      for (const inv of mine) {
        const t = totalsFor(inv);
        if (!t.isPaidInFull) outstanding += t.balanceDueCents;
        if (opts?.today && isOverdue(inv, opts.today)) overdue += 1;
      }
      return {
        present: true,
        count: mine.length,
        detail: outstanding > 0 ? `${formatMoney(outstanding)} outstanding` : 'Paid in full',
        warn: overdue ? `${overdue} overdue` : null,
      };
    },
  },
  {
    id: 'materials', label: 'Materials', icon: 'cart', group: SectionGroup.MONEY,
    ownership: Ownership.LINKED, tab: 'materials',
    read: (proj, world) => {
      const mine = forProject(world.materialLists, proj.id);
      const items = mine.reduce((n, l) => n + (l.items?.length ?? 0), 0);
      const bought = mine.reduce((n, l) => n + (l.items ?? []).filter((i) => i.purchased).length, 0);
      return {
        present: mine.length > 0,
        count: items,
        detail: items ? `${bought}/${items} picked up` : 'No material list',
      };
    },
  },
  {
    id: 'labor', label: 'Labor', icon: 'time', group: SectionGroup.MONEY,
    ownership: Ownership.LINKED, tab: null,
    read: (proj, world) => {
      const o = logOverview(world.logs, proj.id);
      return {
        present: o.labor.totalMinutes > 0,
        count: o.labor.totalMinutes,
        detail: o.labor.totalMinutes
          ? `${o.labor.totalHoursLabel}${o.labor.priced ? ` · ${o.labor.costLabel}` : ' · not priced'}`
          : 'No hours recorded',
        warn: o.labor.entriesMissingRate > 0 ? 'Some hours have no rate' : null,
      };
    },
  },
  {
    id: 'permit', label: 'Permit', icon: 'document-text', group: SectionGroup.COMPLIANCE,
    ownership: Ownership.LINKED, tab: 'permit',
    read: (proj, world) => {
      const mine = forProject(world.permits, proj.id);
      const head = mine[0] ?? null;
      const fromArtifact = projectOverview(proj);
      if (!head) {
        return {
          present: !!fromArtifact.permitNumber,
          count: fromArtifact.permitNumber ? 1 : 0,
          detail: fromArtifact.permitNumber
            ? `${fromArtifact.permitNumber}${fromArtifact.ahj ? ` · ${fromArtifact.ahj}` : ''}`
            : 'No permit recorded',
        };
      }
      return {
        present: true,
        count: mine.length,
        detail: `${head.number || 'Unnumbered'} · ${head.status}`,
        warn: head.status === PermitStatus.EXPIRED ? 'Expired' : null,
      };
    },
  },
  {
    id: 'inspection', label: 'Inspections', icon: 'checkmark-circle', group: SectionGroup.COMPLIANCE,
    ownership: Ownership.LINKED, tab: 'permit',
    read: (proj, world) => {
      const fromPermits = forProject(world.permits, proj.id).flatMap((p) => p.inspections ?? []);
      const fromArtifacts = artifactsOfKind(proj, ArtifactKind.INSPECTION);
      const total = fromPermits.length + fromArtifacts.length;
      const failed = fromPermits.filter((i) => i.result === 'FAILED' || i.result === 'CORRECTION_REQUIRED').length;
      return {
        present: total > 0,
        count: total,
        detail: total ? `${total} logged` : 'None logged',
        warn: failed ? `${failed} needing correction` : null,
      };
    },
  },
  {
    id: 'warranty', label: 'Warranty', icon: 'shield-checkmark', group: SectionGroup.COMPLIANCE,
    ownership: Ownership.LINKED, tab: null,
    read: (proj, world) => {
      const mine = forProject(world.warranties, proj.id);
      const fromArtifacts = artifactsOfKind(proj, ArtifactKind.WARRANTY).length;
      const n = mine.length + fromArtifacts;
      return { present: n > 0, count: n, detail: n ? `${n} on record` : 'Nothing on record' };
    },
  },
  {
    id: 'sparkai', label: 'Ask about this job', icon: 'flash', group: SectionGroup.INTELLIGENCE,
    ownership: Ownership.ACTION, tab: 'necai',
    read: () => ({ present: true, count: 0, detail: 'Scoped to this project only' }),
  },
  {
    id: 'chat', label: 'Chat history', icon: 'chatbubbles', group: SectionGroup.INTELLIGENCE,
    ownership: Ownership.LINKED, tab: 'necai',
    read: (proj, world) => {
      const mine = forProject(world.conversations, proj.id);
      const saved = artifactsOfKind(proj, ArtifactKind.AI_SUMMARY).length;
      return {
        present: mine.length + saved > 0,
        count: mine.length,
        detail: mine.length
          ? `${mine.length} conversation${mine.length === 1 ? '' : 's'}${saved ? ` · ${saved} saved answer${saved === 1 ? '' : 's'}` : ''}`
          : 'No conversations on this job',
      };
    },
  },
  {
    id: 'export', label: 'Export', icon: 'share', group: SectionGroup.OUT,
    ownership: Ownership.ACTION, tab: null,
    read: (proj) => {
      const o = projectOverview(proj);
      return { present: o.artifacts + o.photos > 0, count: o.artifacts + o.photos, detail: 'Close-out package' };
    },
  },
]);

export const sectionById = (id) => SECTIONS.find((s) => s.id === id) ?? null;

// ─── The overview ────────────────────────────────────────────────────────────

/**
 * Every section, resolved against this project and the stores around it.
 *
 * One pass, one shape, grouped for rendering. A section that throws — because a
 * store handed it something malformed — degrades to "unavailable" rather than
 * taking the whole job screen down with it.
 */
export const hubOverview = (proj, world = emptyWorld(), { today = null } = {}) => {
  const p = hydrate(proj);
  if (!p) return null;
  const w = { ...emptyWorld(), ...(world ?? {}) };

  const sections = SECTIONS.map((s) => {
    let read;
    try {
      read = s.read(p, w, { today }) ?? {};
    } catch {
      read = { present: false, count: 0, detail: 'Unavailable', unavailable: true };
    }
    return Object.freeze({
      id: s.id,
      label: s.label,
      icon: s.icon,
      group: s.group,
      ownership: s.ownership,
      tab: s.tab,
      present: !!read.present,
      count: Number.isFinite(read.count) ? read.count : 0,
      detail: read.detail ?? '',
      warn: read.warn ?? null,
      unavailable: !!read.unavailable,
    });
  });

  const groups = [];
  for (const group of Object.values(SectionGroup)) {
    const inGroup = sections.filter((s) => s.group === group);
    if (inGroup.length) groups.push(Object.freeze({ group, sections: Object.freeze(inGroup) }));
  }

  return Object.freeze({
    projectId: p.id,
    name: p.name,
    template: TEMPLATES[p.template]?.label ?? 'Custom',
    sections: Object.freeze(sections),
    groups: Object.freeze(groups),
    warnings: Object.freeze(sections.filter((s) => s.warn).map((s) => ({ id: s.id, label: s.label, warn: s.warn }))),
    lastActivity: projectOverview(p).lastActivity,
  });
};

// ─── Close-out readiness ─────────────────────────────────────────────────────

/**
 * What a job still needs before it can be called done.
 *
 * Explicitly NOT a compliance check. It reads what is in the app and says what
 * is absent from it — nothing here inspects work, verifies a calculation, or
 * knows whether the installation is correct. A job can be complete by this
 * measure and still be wrong on site, which is why the wording is "recorded"
 * throughout rather than "passed" or "verified".
 */
export const CLOSEOUT_DISCLAIMER =
  'This checks what has been recorded in the app, not whether the work is correct or code-compliant. '
  + 'It does not replace the authority having jurisdiction, the adopted code, or your own inspection.';

const CLOSEOUT_ITEMS = Object.freeze([
  { id: 'customer', label: 'Customer recorded', required: true },
  { id: 'photos', label: 'Photos taken', required: true },
  { id: 'dailyLogs', label: 'Days logged', required: false },
  { id: 'estimate', label: 'Estimate on file', required: false },
  { id: 'invoice', label: 'Invoice raised', required: true },
  { id: 'permit', label: 'Permit recorded', required: false },
  { id: 'inspection', label: 'Inspection logged', required: false },
]);

export const completeness = (proj, world = emptyWorld(), opts = {}) => {
  const overview = hubOverview(proj, world, opts);
  if (!overview) return null;
  const byId = new Map(overview.sections.map((s) => [s.id, s]));

  const items = CLOSEOUT_ITEMS.map((item) => Object.freeze({
    ...item,
    done: !!byId.get(item.id)?.present,
    detail: byId.get(item.id)?.detail ?? '',
  }));

  const required = items.filter((i) => i.required);
  const outstandingRequired = required.filter((i) => !i.done);
  const done = items.filter((i) => i.done).length;

  return Object.freeze({
    items: Object.freeze(items),
    done,
    total: items.length,
    percent: Math.round((done / items.length) * 100),
    readyToClose: outstandingRequired.length === 0,
    outstanding: Object.freeze(outstandingRequired.map((i) => i.label)),
    warnings: overview.warnings,
    disclaimer: CLOSEOUT_DISCLAIMER,
  });
};

// ─── Deleting honestly ───────────────────────────────────────────────────────

/**
 * What deleting this project would actually destroy, and what it would leave
 * behind. The current screen promises "the photos themselves stay on your
 * device" and says nothing about the invoice — which is the item a user would
 * most want to know survives.
 */
export const deletionImpact = (proj, world = emptyWorld()) => {
  const p = hydrate(proj);
  if (!p) return null;
  const w = { ...emptyWorld(), ...(world ?? {}) };

  const destroyed = [];
  if (p.photos.length) destroyed.push(`${p.photos.length} photo reference${p.photos.length === 1 ? '' : 's'}`);
  if (p.artifacts.length) destroyed.push(`${p.artifacts.length} saved calculation${p.artifacts.length === 1 ? '' : 's'} and record${p.artifacts.length === 1 ? '' : 's'}`);
  if (p.customer) destroyed.push('the customer details');

  const orphaned = [];
  const counts = [
    [forProject(w.estimates, p.id).length, 'estimate'],
    [forProject(w.invoices, p.id).length, 'invoice'],
    [forProject(w.permits, p.id).length, 'permit'],
    [forProject(w.materialLists, p.id).length, 'material list'],
    [logsForProject(w.logs, p.id).length, 'daily log'],
    [forProject(w.conversations, p.id).length, 'conversation'],
  ];
  for (const [n, noun] of counts) if (n) orphaned.push(`${n} ${noun}${n === 1 ? '' : 's'}`);

  return Object.freeze({
    destroyed: Object.freeze(destroyed),
    orphaned: Object.freeze(orphaned),
    // The image files are not ours to delete — we only ever stored a URI.
    note: 'The photo files themselves stay in your camera roll.',
    summary: destroyed.length
      ? `This removes ${destroyed.join(', ')}.`
      : 'This project has nothing saved to it yet.',
    orphanSummary: orphaned.length
      ? `${orphaned.join(', ')} will stay in the app but will no longer be attached to a job.`
      : null,
  });
};
