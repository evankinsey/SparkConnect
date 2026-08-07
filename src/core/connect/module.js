// ─── CONTRACTORS: THE MODULE ─────────────────────────────────────────────────
// ContractorConnect as a section of SparkConnect, not a second app.
//
// The sequencing decision, and it is the right one: a user who downloads an
// electrician's app and finds licence verification inside it experiences one
// product growing. A user asked to download SparkConnect AND ContractorConnect
// AND TradeConnect experiences a decision they did not want to make. So this
// ships as a tab, and the architecture underneath — source adapters, provenance,
// jurisdictions — is built so the split later is a routing change rather than a
// rewrite.
//
// THE HARD PART IS NOT THE TABS. It is that four of the six things a user wants
// here need data this app does not have and cannot honestly invent:
//
//   Find Contractor      needs a contractor index
//   Nearby Contractors   needs that index plus geography
//   Verify License       needs the state board
//   Find Qualifying Agent needs people who have opted in
//
// Every one of those is a place where a plausible-looking fake would be easy and
// catastrophic. Telling somebody a contractor is licensed when nobody checked is
// worse than telling them nothing, because they act on it.
//
// So each section declares its own `availability`, and a section with no data
// renders as what it actually is: a deep link to the authority that does have
// it, or an honest not-yet. `SECTIONS` is the single source of truth for that,
// and a test asserts no section can claim data it has no adapter for.
//
// Pure module: no React, no network, no storage.

import { AdapterStatus, SourceKind, ATTRIBUTION_NOTICE } from './sources.js';
import { CONNECT_DISCLAIMER, Trade, ACTIVE_TRADES } from './index.js';
import { PATHWAY_DISCLAIMER } from './pathways.js';

/**
 * What a section can do TODAY. The distinction that matters is between
 * "we have records" and "we can take you to whoever does".
 */
export const Availability = Object.freeze({
  // We hold records, with provenance, and can search them.
  SEARCHABLE: 'SEARCHABLE',
  // No records. We know the official portal and hand the user straight to it.
  OFFICIAL_PORTAL: 'OFFICIAL_PORTAL',
  // Works entirely on the user's own data. No external source needed.
  LOCAL_ONLY: 'LOCAL_ONLY',
  // Declared, not built. Says so plainly rather than showing an empty list.
  NOT_YET: 'NOT_YET',
});

export const AVAILABILITY_LABEL = Object.freeze({
  SEARCHABLE: 'Search',
  OFFICIAL_PORTAL: 'Opens the official record',
  LOCAL_ONLY: 'Yours, on this device',
  NOT_YET: 'Not built yet',
});

export const SECTIONS = Object.freeze([
  {
    id: 'verify_license',
    icon: 'checkmark-circle',
    title: 'Verify a licence',
    // The single most useful thing here, and the one where being wrong is worst.
    blurb: 'Check a contractor licence against the state board that issued it.',
    availability: Availability.OFFICIAL_PORTAL,
    requiresAdapter: true,
    // A licence board satisfies this. A county permit portal does not — and
    // without saying so, registering ANY adapter lit up every data-backed tile.
    satisfiedBy: Object.freeze([SourceKind.STATE_LICENSE_BOARD]),
    order: 1,
    emptyState: 'Enter a licence number and this opens the issuing board’s own record for it. '
      + 'We do not keep a copy — the board’s page is the one that is current.',
    whyNoData: 'A cached licence status is a licence status from whenever we cached it. '
      + 'For something a person is about to hire on, the live official record is the only '
      + 'answer worth giving.',
  },
  {
    id: 'permit_assistant',
    icon: 'document-text',
    title: 'Permit Assistant',
    blurb: 'Work out what your jurisdiction requires, and keep what they tell you.',
    // Already built, already shipping, and works with no external data at all.
    availability: Availability.LOCAL_ONLY,
    requiresAdapter: false,
    order: 2,
    tab: 'permit',
    emptyState: 'Look up your authority, record what they tell you, and it is there for the next job.',
  },
  {
    id: 'find_contractor',
    icon: 'search',
    title: 'Find a contractor',
    blurb: 'Search licensed contractors by name, licence number or trade.',
    availability: Availability.NOT_YET,
    requiresAdapter: true,
    // Needs a searchable index of contractors. A deep link to a board's own
    // search page is not that: it cannot answer "who works near me".
    satisfiedBy: Object.freeze([SourceKind.OPEN_DATA_PORTAL]),
    requiresLive: true,
    order: 3,
    emptyState: 'There is no contractor index yet. When there is, every record will carry the '
      + 'authority it came from and the date it was read.',
    whyNoData: 'Building this means importing public records from each state board and county. '
      + 'Until that is done for a jurisdiction, showing a search box implies a database that '
      + 'does not exist.',
  },
  {
    id: 'nearby_contractors',
    icon: 'location',
    title: 'Nearby contractors',
    blurb: 'Licensed contractors working near a job.',
    availability: Availability.NOT_YET,
    requiresAdapter: true,
    satisfiedBy: Object.freeze([SourceKind.OPEN_DATA_PORTAL]),
    requiresLive: true,
    order: 4,
    emptyState: 'Needs the contractor index first.',
    whyNoData: 'Proximity is only meaningful over a real index. A map with three seeded pins '
      + 'is a demo, and a demo that looks like a product is how somebody rings a company that '
      + 'was never there.',
  },
  {
    id: 'qualifying_agent',
    icon: 'shield-checkmark',
    title: 'Qualifying agents',
    blurb: 'What a qualifying agent is, whether you need one, and what it involves to be one.',
    // The explanation is real and useful now. The directory is not.
    availability: Availability.LOCAL_ONLY,
    requiresAdapter: false,
    order: 5,
    emptyState: 'The explanations are here now. The directory opens when enough licensed people '
      + 'have opted in — nobody is listed without asking them.',
  },
  {
    id: 'saved',
    icon: 'heart',
    title: 'Saved',
    blurb: 'Contractors, licences and searches you want to keep.',
    availability: Availability.LOCAL_ONLY,
    requiresAdapter: false,
    order: 6,
    emptyState: 'Nothing saved yet. Anything you look up can be kept here with the date you '
      + 'checked it.',
  },
]);

export const sectionById = (id) => SECTIONS.find((s) => s.id === id) ?? null;

/**
 * The section list a screen renders, resolved against what is actually wired.
 *
 * A section that needs an adapter and has none is DOWNGRADED here rather than
 * being allowed to advertise a capability. Availability in the declaration is a
 * ceiling, not a promise.
 */
export const sections = (registry = null, { jurisdictionId = null } = {}) => {
  const rows = [...SECTIONS].sort((a, b) => a.order - b.order).map((s) => {
    let availability = s.availability;
    let adapters = [];

    if (s.requiresAdapter) {
      const kinds = s.satisfiedBy ?? [];
      adapters = (registry ? registry.all() : [])
        .filter((a) => !jurisdictionId || a.jurisdictionId === jurisdictionId)
        // Only adapters of a kind that actually answers this section's question.
        .filter((a) => kinds.includes(a.kind));

      const live = adapters.filter((a) => a.status === AdapterStatus.LIVE);
      const linkable = adapters.filter((a) => a.status === AdapterStatus.DEEP_LINK_ONLY);

      if (live.length) availability = Availability.SEARCHABLE;
      // A section that needs a real index is not satisfied by a deep link.
      // "Search contractors near me" cannot be answered by handing somebody a
      // board's own search page, so requiresLive holds it back.
      else if (linkable.length && !s.requiresLive) availability = Availability.OFFICIAL_PORTAL;
      else availability = Availability.NOT_YET;
    }

    return Object.freeze({
      id: s.id,
      icon: s.icon,
      title: s.title,
      blurb: s.blurb,
      tab: s.tab ?? null,
      availability,
      availabilityLabel: AVAILABILITY_LABEL[availability],
      usable: availability !== Availability.NOT_YET,
      emptyState: s.emptyState,
      // Only shown when there is genuinely nothing behind the tile. Explaining
      // WHY is what stops "not built yet" reading as neglect.
      whyNoData: availability === Availability.NOT_YET ? (s.whyNoData ?? null) : null,
      adapterCount: adapters.length,
      portals: Object.freeze(adapters
        .filter((a) => a.status === AdapterStatus.DEEP_LINK_ONLY || a.status === AdapterStatus.LIVE)
        .map((a) => Object.freeze({ id: a.id, name: a.name, url: a.portalUrl }))),
    });
  });

  return Object.freeze(rows);
};

/**
 * Everything the Contractors tab needs, in one call.
 *
 * `honestSummary` is the line under the header. It counts what is real rather
 * than listing six tiles as though all six work, because a user who taps into
 * two empty screens stops trusting the other four.
 */
export const contractorsTab = (registry = null, options = {}) => {
  const rows = sections(registry, options);
  const usable = rows.filter((r) => r.usable);
  const waiting = rows.filter((r) => !r.usable);

  return Object.freeze({
    sections: rows,
    usable: Object.freeze(usable),
    waiting: Object.freeze(waiting),
    badge: 'Beta',
    honestSummary: waiting.length === 0
      ? 'Everything here is live.'
      : `${usable.length} of ${rows.length} are live. The rest need public records we have not imported yet, and say so.`,
    coverage: registry ? registry.coverage() : null,
    trades: Object.freeze([...ACTIVE_TRADES]),
    attribution: ATTRIBUTION_NOTICE,
    disclaimer: CONNECT_DISCLAIMER,
    pathwayDisclaimer: PATHWAY_DISCLAIMER,
  });
};

// ─── Where this goes ─────────────────────────────────────────────────────────

/**
 * The split, written down while the decision is fresh.
 *
 * Kept in code rather than a doc because the thing that makes a later split
 * cheap is that nothing in `src/core/connect/` imports a SparkConnect screen,
 * and the easiest way to keep that true is to say so where an engineer adding
 * an import will read it.
 */
export const SPLIT_PLAN = Object.freeze({
  now: 'A section of SparkConnect. One app, one download, one login.',
  later: 'Its own app over the same backend, when the contractor index is large '
    + 'enough to stand on its own.',
  whatMakesItCheap: Object.freeze([
    'Nothing in src/core/connect imports a screen, a store, or anything electrical.',
    'Every record carries its own provenance, so the data layer moves intact.',
    'Source adapters are declared, not hardcoded per screen.',
    'Jurisdictions are keyed by id, not by "Florida" appearing in a component.',
  ]),
  umbrella: 'TradeConnect — shared identity, payments, messaging and search under '
    + 'SparkConnect, HVACConnect, PlumbConnect and the rest.',
  tradesReady: Object.freeze(Object.keys(Trade)),
});
