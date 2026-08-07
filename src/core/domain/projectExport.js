// ─── PROJECT EXPORT ──────────────────────────────────────────────────────────
// Getting the job back out of the app.
//
// A close-out package is the deliverable a contractor actually gets paid for
// producing: photos, hours, permit and inspection record, the numbers. Today the
// app can only Share a list of folder names.
//
// The hard part is not formatting. It is that the SAME job produces different
// documents for different readers, and sending the wrong one is a real cost:
//
//   CUSTOMER    what they are paying for. No labor rates, no internal margin,
//               no internal notes — a customer who sees the hourly cost basis
//               will negotiate against it.
//   GC          scope, schedule, delays, inspections. No pricing at all.
//   INSPECTOR   permit, inspections, concealed-work photos. No money, no
//               customer contact details.
//   INTERNAL    everything.
//
// So redaction is not a formatting option, it is the point of the module, and it
// is enforced by an allowlist per audience rather than by remembering to omit
// things. A field that nobody has classified does not get exported.
//
// One thing the package never does is assert that the work is correct. It is a
// record of what was done, not a certificate that it was done right.
//
// Pure module: no React, no file system, no network.

import { formatMoney } from './money.js';
import { totalsFor } from './documents.js';
import { logsForProject, laborSummary, delaySummary, renderLogText, formatMinutes } from './dailyLog.js';
import { hydrate, emptyWorld, completeness, CLOSEOUT_DISCLAIMER } from './projectHub.js';
import { projectStats, photosInFolder, beforeAfterPairs } from './jobcam.js';
import { ArtifactKind, artifactsOfKind, KIND_LABEL } from './projectArtifacts.js';

export const Audience = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  GC: 'GC',
  INSPECTOR: 'INSPECTOR',
  INTERNAL: 'INTERNAL',
});

export const AUDIENCE_LABEL = Object.freeze({
  CUSTOMER: 'Customer', GC: 'General contractor', INSPECTOR: 'Inspector', INTERNAL: 'Internal',
});

/**
 * What each reader is allowed to see. An allowlist, not a denylist: a section
 * added later is invisible to every audience until somebody decides who it is
 * for. The failure mode of a denylist is that new data leaks by default.
 */
export const AUDIENCE_SECTIONS = Object.freeze({
  CUSTOMER: Object.freeze(['header', 'customer', 'address', 'scope', 'photos', 'permit', 'inspections', 'totals', 'warranty', 'disclaimer']),
  GC: Object.freeze(['header', 'address', 'scope', 'schedule', 'delays', 'photos', 'permit', 'inspections', 'disclaimer']),
  INSPECTOR: Object.freeze(['header', 'address', 'scope', 'photos', 'permit', 'inspections', 'calculations', 'disclaimer']),
  INTERNAL: Object.freeze(['header', 'customer', 'address', 'scope', 'schedule', 'delays', 'photos', 'permit',
    'inspections', 'calculations', 'materials', 'labor', 'totals', 'warranty', 'logs', 'completeness', 'disclaimer']),
});

/**
 * Money detail per audience. `NONE` is not the same as `TOTALS`: a GC on a
 * subcontract has no business seeing the customer's price, and an inspector has
 * no business seeing any of it.
 */
export const MoneyDetail = Object.freeze({ NONE: 'NONE', TOTALS: 'TOTALS', FULL: 'FULL' });

export const MONEY_BY_AUDIENCE = Object.freeze({
  CUSTOMER: MoneyDetail.TOTALS,
  GC: MoneyDetail.NONE,
  INSPECTOR: MoneyDetail.NONE,
  INTERNAL: MoneyDetail.FULL,
});

export const EXPORT_DISCLAIMER =
  'This is a record of work recorded in SparkConnect. It is not a certification that the '
  + 'installation is code-compliant, and it does not replace the authority having jurisdiction, '
  + 'the adopted code, approved plans, or listing instructions.';

const has = (audience, section) => (AUDIENCE_SECTIONS[audience] ?? []).includes(section);

// ─── Building the package ────────────────────────────────────────────────────

/**
 * Assemble the structured export. Renderers consume this; nothing downstream
 * re-reads the stores, so what is rendered is exactly what was redacted.
 *
 * @returns {{audience, sections, omitted, generatedAt, disclaimer}}
 */
export const buildExport = (proj, world = emptyWorld(), {
  audience = Audience.CUSTOMER, today = null, businessName = '', generatedAt = null,
} = {}) => {
  const p = hydrate(proj);
  if (!p) return null;
  if (!Object.prototype.hasOwnProperty.call(Audience, audience)) return null;

  const w = { ...emptyWorld(), ...(world ?? {}) };
  const money = MONEY_BY_AUDIENCE[audience];
  const logs = logsForProject(w.logs, p.id);
  const mine = (list) => (list ?? []).filter((x) => x && x.projectId === p.id);

  const sections = {};
  const omitted = [];
  const include = (name, build) => {
    if (!has(audience, name)) { omitted.push(name); return; }
    const value = build();
    if (value !== null && value !== undefined) sections[name] = value;
  };

  include('header', () => ({
    project: p.name,
    business: typeof businessName === 'string' ? businessName.trim().slice(0, 120) : '',
    audience,
    audienceLabel: AUDIENCE_LABEL[audience],
    generatedAt: generatedAt ?? new Date().toISOString(),
  }));

  include('customer', () => (p.customer ? {
    name: p.customer.name,
    company: p.customer.company,
    // Contact details go to the customer's own copy and to internal. A GC or an
    // inspector has no need for the homeowner's phone number.
    phone: audience === Audience.INTERNAL || audience === Audience.CUSTOMER ? p.customer.phone : '',
    email: audience === Audience.INTERNAL || audience === Audience.CUSTOMER ? p.customer.email : '',
  } : null));

  include('address', () => p.address ?? null);

  include('scope', () => {
    const takeoffs = artifactsOfKind(p, ArtifactKind.TAKEOFF);
    return {
      template: p.template,
      // The scope description is the estimate's line-item descriptions, never a
      // generated summary — an invented scope line is a contractual claim.
      lines: mine(w.estimates).flatMap((e) => (e.lineItems ?? []).map((i) => i.description)).filter(Boolean).slice(0, 60),
      takeoffs: takeoffs.map((t) => t.summary || t.title),
    };
  });

  include('schedule', () => {
    const dates = logs.map((l) => l.date).sort();
    const labor = laborSummary(logs);
    return {
      firstDay: dates[0] ?? null,
      lastDay: dates[dates.length - 1] ?? null,
      daysOnSite: labor.days,
      // Hours are schedule information, not pricing — a GC gets them, and they
      // carry no rate.
      totalHours: labor.totalHoursLabel,
      totalMinutes: labor.totalMinutes,
    };
  });

  include('delays', () => {
    const d = delaySummary(logs);
    if (!d.byKind.length) return null;
    return {
      totalLabel: d.totalLabel,
      byKind: d.byKind.map((k) => ({ label: k.label, minutes: k.minutes, label_time: formatMinutes(k.minutes), occurrences: k.occurrences })),
      weatherDays: d.weatherDays,
    };
  });

  include('photos', () => {
    const stats = projectStats(p);
    return {
      total: stats.photoCount,
      tagged: stats.taggedCount,
      beforeAfterPairs: beforeAfterPairs(p).length,
      byFolder: p.folders.map((f) => ({ label: f.label, count: photosInFolder(p, f.id).length }))
        .filter((f) => f.count > 0),
      // URIs are device-local. They are listed for an internal export only; a
      // customer copy containing file:// paths is noise at best.
      uris: audience === Audience.INTERNAL ? p.photos.map((ph) => ph.uri).filter(Boolean) : undefined,
    };
  });

  include('permit', () => {
    const permits = mine(w.permits);
    if (permits.length) {
      return permits.map((x) => ({ number: x.number, ahj: x.ahj, status: x.status, type: x.type }));
    }
    const art = artifactsOfKind(p, ArtifactKind.PERMIT)[0];
    return art ? [{ number: art.meta?.permitNumber ?? null, ahj: art.meta?.ahj ?? null, status: null, type: null }] : null;
  });

  include('inspections', () => {
    const fromPermits = mine(w.permits).flatMap((x) => (x.inspections ?? []).map((i) => ({
      kind: i.kind, result: i.result, scheduledFor: i.scheduledFor,
      // The inspector's name goes on the internal record only.
      inspector: audience === Audience.INTERNAL ? i.inspector : null,
    })));
    const fromArtifacts = artifactsOfKind(p, ArtifactKind.INSPECTION)
      .map((a) => ({ kind: a.title, result: a.meta?.result ?? null, scheduledFor: null, inspector: null }));
    const all = [...fromPermits, ...fromArtifacts];
    return all.length ? all : null;
  });

  include('calculations', () => {
    const calcs = artifactsOfKind(p, ArtifactKind.CALCULATION);
    return calcs.length ? calcs.map((c) => ({ title: c.title, summary: c.summary, savedAt: c.savedAt })) : null;
  });

  include('materials', () => {
    const lists = mine(w.materialLists);
    if (!lists.length) return null;
    return lists.map((l) => ({
      items: (l.items ?? []).map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        // Supplier pricing is internal. It is the contractor's cost basis.
        priceCents: money === MoneyDetail.FULL ? i.priceCents ?? null : undefined,
      })),
    }));
  });

  include('labor', () => {
    const l = laborSummary(logs);
    return {
      totalHours: l.totalHoursLabel,
      days: l.days,
      people: money === MoneyDetail.FULL
        ? l.people.map((x) => ({ name: x.name, hours: x.label, days: x.days, costCents: x.costCents }))
        : l.people.map((x) => ({ name: x.name, hours: x.label, days: x.days })),
      costCents: money === MoneyDetail.FULL ? l.costCents : undefined,
      pricingNote: money === MoneyDetail.FULL ? l.pricingNote : undefined,
    };
  });

  include('totals', () => {
    if (money === MoneyDetail.NONE) return null;
    const invoices = mine(w.invoices);
    const estimates = mine(w.estimates);
    const docs = invoices.length ? invoices : estimates;
    if (!docs.length) return null;
    const rows = docs.map((d) => {
      const t = totalsFor(d);
      return {
        number: d.number ?? null,
        kind: invoices.length ? 'Invoice' : 'Estimate',
        totalCents: t.totalCents,
        // A customer sees what they owe. The cost basis behind it is not theirs.
        balanceDueCents: t.balanceDueCents,
        paid: t.isPaidInFull,
        subtotalCents: money === MoneyDetail.FULL ? t.subtotalCents : undefined,
        taxCents: money === MoneyDetail.FULL ? t.taxCents : undefined,
        discountCents: money === MoneyDetail.FULL ? t.discountCents : undefined,
      };
    });
    return rows;
  });

  include('warranty', () => {
    const ws = mine(w.warranties);
    const fromArtifacts = artifactsOfKind(p, ArtifactKind.WARRANTY)
      .map((a) => ({ subject: a.title, note: a.summary, expiresAt: a.meta?.expiresAt ?? null }));
    const all = [...ws.map((x) => ({ subject: x.subject ?? x.description ?? 'Warranty', note: x.note ?? '', expiresAt: x.expiresAt ?? null })), ...fromArtifacts];
    return all.length ? all : null;
  });

  include('logs', () => (logs.length ? logs.map((l) => ({ date: l.date, text: renderLogText(l) })) : null));

  include('completeness', () => completeness(p, w, { today }));

  include('disclaimer', () => EXPORT_DISCLAIMER);

  return Object.freeze({
    audience,
    audienceLabel: AUDIENCE_LABEL[audience],
    projectId: p.id,
    sections: Object.freeze(sections),
    omitted: Object.freeze(omitted),
    generatedAt: sections.header?.generatedAt ?? (generatedAt ?? new Date().toISOString()),
    disclaimer: EXPORT_DISCLAIMER,
  });
};

// ─── Rendering ───────────────────────────────────────────────────────────────

const rule = (title) => `\n${title}\n${'─'.repeat(Math.min(title.length, 44))}`;

/**
 * Plain text, because it is what Share, email and a text message all accept, and
 * what survives being pasted into someone else's system.
 */
export const renderExportText = (pkg) => {
  if (!pkg) return '';
  const s = pkg.sections;
  const out = [];

  if (s.header) {
    out.push(s.header.business ? `${s.header.business}` : '');
    out.push(s.header.project);
    out.push(`${s.header.audienceLabel} copy · ${String(s.header.generatedAt).slice(0, 10)}`);
  }
  if (s.customer) {
    out.push(rule('Customer'));
    out.push([s.customer.name, s.customer.company].filter(Boolean).join(' · '));
    if (s.customer.phone) out.push(s.customer.phone);
    if (s.customer.email) out.push(s.customer.email);
  }
  if (s.address) { out.push(rule('Site')); out.push(s.address); }

  if (s.scope && (s.scope.lines.length || s.scope.takeoffs.length)) {
    out.push(rule('Scope'));
    for (const line of s.scope.lines) out.push(`  • ${line}`);
    for (const t of s.scope.takeoffs) out.push(`  • ${t}`);
  }

  if (s.schedule && s.schedule.daysOnSite) {
    out.push(rule('Schedule'));
    out.push(`${s.schedule.daysOnSite} day(s) on site · ${s.schedule.totalHours}`);
    if (s.schedule.firstDay) out.push(`${s.schedule.firstDay} to ${s.schedule.lastDay}`);
  }

  if (s.delays) {
    out.push(rule('Delays'));
    out.push(`Total ${s.delays.totalLabel}`);
    for (const d of s.delays.byKind) out.push(`  • ${d.label} — ${d.label_time} (${d.occurrences})`);
  }

  if (s.photos && s.photos.total) {
    out.push(rule('Photos'));
    out.push(`${s.photos.total} photo(s), ${s.photos.tagged} tagged, ${s.photos.beforeAfterPairs} before/after pair(s)`);
    for (const f of s.photos.byFolder) out.push(`  • ${f.label}: ${f.count}`);
  }

  if (s.permit) {
    out.push(rule('Permit'));
    for (const x of s.permit) {
      out.push(`  • ${x.number || 'Number not recorded'}${x.ahj ? ` · ${x.ahj}` : ''}${x.status ? ` · ${x.status}` : ''}`);
    }
  }

  if (s.inspections) {
    out.push(rule('Inspections'));
    for (const i of s.inspections) {
      out.push(`  • ${i.kind}${i.result ? ` — ${i.result}` : ''}${i.scheduledFor ? ` (${i.scheduledFor})` : ''}${i.inspector ? ` · ${i.inspector}` : ''}`);
    }
  }

  if (s.calculations) {
    out.push(rule('Calculations on file'));
    for (const c of s.calculations) out.push(`  • ${c.title}${c.summary ? ` — ${c.summary}` : ''}`);
  }

  if (s.labor) {
    out.push(rule('Labor'));
    out.push(`${s.labor.totalHours} across ${s.labor.days} day(s)`);
    for (const person of s.labor.people) {
      const cost = person.costCents != null ? ` · ${formatMoney(person.costCents)}` : '';
      out.push(`  • ${person.name} — ${person.hours} (${person.days} day(s))${cost}`);
    }
    if (s.labor.costCents != null) out.push(`Labor total: ${formatMoney(s.labor.costCents)}`);
    else if (s.labor.pricingNote) out.push(s.labor.pricingNote);
  }

  if (s.totals) {
    out.push(rule('Totals'));
    for (const t of s.totals) {
      out.push(`  ${t.kind} ${t.number ?? ''} — ${formatMoney(t.totalCents)}${t.paid ? ' (paid in full)' : ` · ${formatMoney(t.balanceDueCents)} due`}`);
    }
  }

  if (s.warranty) {
    out.push(rule('Warranty'));
    for (const x of s.warranty) out.push(`  • ${x.subject}${x.expiresAt ? ` — until ${x.expiresAt}` : ''}${x.note ? ` · ${x.note}` : ''}`);
  }

  if (s.logs) {
    out.push(rule('Daily logs'));
    for (const l of s.logs) { out.push(''); out.push(l.text); }
  }

  if (s.completeness) {
    out.push(rule('Recorded so far'));
    out.push(`${s.completeness.done} of ${s.completeness.total} · ${s.completeness.percent}%`);
    if (s.completeness.outstanding.length) out.push(`Still outstanding: ${s.completeness.outstanding.join(', ')}`);
  }

  out.push('');
  out.push(pkg.disclaimer);
  return out.filter((l) => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

/** A one-line description of what is about to leave the app, for a confirm step. */
export const exportSummary = (pkg) => {
  if (!pkg) return '';
  const names = Object.keys(pkg.sections).filter((k) => k !== 'header' && k !== 'disclaimer');
  return `${pkg.audienceLabel} copy · ${names.length} section${names.length === 1 ? '' : 's'}`
    + `${pkg.omitted.length ? ` · ${pkg.omitted.length} withheld` : ''}`;
};

export { CLOSEOUT_DISCLAIMER };
