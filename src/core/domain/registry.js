// ─── MARKETPLACE FOUNDATION ──────────────────────────────────────────────────
// Contractor profiles, license verification, permits, insurance, service areas.
//
// The brief is explicit: do NOT build the marketplace, build the infrastructure
// so the future marketplace is mostly UI. Everything here is data shapes, state
// machines and provider interfaces — no network calls, no public exposure.
//
// All of it sits behind `contractorProfilesEnabled` / `licenseVerificationEnabled`
// / `permitTrackingEnabled`, which default OFF.

// ─── Contractor profile ──────────────────────────────────────────────────────

export const VerificationStatus = {
  UNVERIFIED: 'UNVERIFIED',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
};

export const Specialty = {
  RESIDENTIAL: 'RESIDENTIAL',
  COMMERCIAL: 'COMMERCIAL',
  INDUSTRIAL: 'INDUSTRIAL',
  SERVICE: 'SERVICE',
  LOW_VOLTAGE: 'LOW_VOLTAGE',
  SOLAR: 'SOLAR',
  EV_CHARGING: 'EV_CHARGING',
  GENERATORS: 'GENERATORS',
  CONTROLS: 'CONTROLS',
  FIRE_ALARM: 'FIRE_ALARM',
};

export const contractorProfile = ({
  id, companyName = '', ownerName = '', logoUri = null,
  phone = null, website = null, email = null,
  licenses = [], insurance = [], states = [], specialties = [],
  serviceArea = null, portfolio = [], emergencyService = false,
  createdAt,
}) => ({
  id, companyName, ownerName, logoUri,
  phone, website, email,
  licenses, insurance, states, specialties,
  serviceArea, portfolio,
  emergencyService,
  // Reviews are read-only from the client's perspective — a contractor can never
  // write their own. The shape exists so the future marketplace has somewhere to
  // put server-supplied reviews.
  reviews: { count: 0, averageRating: null, source: 'NONE' },
  verification: {
    status: VerificationStatus.UNVERIFIED,
    badge: false,
    verifiedAt: null,
    // A badge is only ever granted by a verified provider result, never by the
    // client and never by the contractor editing their own profile.
    grantedBy: null,
  },
  createdAt,
  updatedAt: createdAt,
  // Not public. The marketplace is not built; nothing here is published.
  visibility: 'PRIVATE',
});

/** A badge requires a VERIFIED licence from a real provider result. */
export const canShowVerificationBadge = (profile) =>
  profile?.verification?.status === VerificationStatus.VERIFIED &&
  profile?.verification?.grantedBy != null &&
  (profile.licenses ?? []).some((l) => l.status === VerificationStatus.VERIFIED);

export const serviceArea = ({ centerZip = null, radiusMiles = 0, states = [], counties = [] }) =>
  ({ centerZip, radiusMiles, states, counties });

// ─── Licence verification provider interface ─────────────────────────────────
//
// Not Florida-specific. Every state gets the same interface; a provider is
// whatever can answer for that jurisdiction (a state API, a scraper service, or
// a manual-entry fallback).

export const license = ({
  id, number, state, type = 'ELECTRICAL', holderName = '',
  issuedAt = null, expiresAt = null,
}) => ({
  id, number, state, type, holderName,
  issuedAt, expiresAt,
  status: VerificationStatus.UNVERIFIED,
  lastCheckedAt: null,
  provider: null,
  raw: null,          // normalized provider payload, never rendered directly
});

/**
 * The contract every provider implements. Registering a new state means writing
 * one of these — nothing else in the app changes.
 *
 *   verifyLicense({ number, state })   -> NormalizedResult
 *   searchLicense({ name, state })     -> NormalizedResult[]
 *   verifyBusiness({ name, state })    -> NormalizedResult
 *   normalizeResults(raw)              -> NormalizedResult[]
 */
export const LicenseProviderInterface = Object.freeze([
  'id', 'states', 'verifyLicense', 'searchLicense', 'verifyBusiness', 'normalizeResults',
]);

export const isValidProvider = (provider) =>
  !!provider &&
  typeof provider.id === 'string' &&
  Array.isArray(provider.states) &&
  ['verifyLicense', 'searchLicense', 'verifyBusiness', 'normalizeResults']
    .every((fn) => typeof provider[fn] === 'function');

/** The shape every provider must return, whatever the state's API looks like. */
export const normalizedResult = ({
  found = false, number = null, holderName = null, state = null,
  status = VerificationStatus.UNVERIFIED, issuedAt = null, expiresAt = null,
  licenseType = null, providerId = null, checkedAt = null, disclaimer = null,
}) => ({
  found, number, holderName, state, status,
  issuedAt, expiresAt, licenseType, providerId, checkedAt,
  // Every jurisdiction has different authority and freshness. The disclaimer is
  // required so the app never implies it is the licensing authority.
  disclaimer: disclaimer ??
    'Licence data is supplied by third parties and may be out of date. Verify with the issuing authority.',
});

export const createLicenseRegistry = ({ cacheTtlMs = 86400000, now = () => Date.now() } = {}) => {
  const providers = new Map();
  const cache = new Map();

  const register = (provider) => {
    if (!isValidProvider(provider)) throw new Error(`Invalid licence provider: missing ${LicenseProviderInterface.join('/')}`);
    providers.set(provider.id, provider);
    return provider.id;
  };

  const providerForState = (state) =>
    [...providers.values()].find((p) => p.states.includes(state) || p.states.includes('*')) ?? null;

  const cacheKey = (state, number) => `${state}::${number}`;

  const verify = async ({ number, state }) => {
    const key = cacheKey(state, number);
    const hit = cache.get(key);
    if (hit && now() - hit.at < cacheTtlMs) return { ...hit.result, fromCache: true };

    const provider = providerForState(state);
    if (!provider) {
      return {
        ...normalizedResult({ state, number, checkedAt: now() }),
        unsupportedState: true,
        fromCache: false,
      };
    }
    const result = await provider.verifyLicense({ number, state });
    cache.set(key, { at: now(), result });
    return { ...result, fromCache: false };
  };

  return {
    register,
    verify,
    providerForState,
    registeredProviders: () => [...providers.keys()],
    clearCache: () => cache.clear(),
  };
};

// ─── Insurance ───────────────────────────────────────────────────────────────

export const insurancePolicy = ({
  id, kind = 'GENERAL_LIABILITY', carrier = '', policyNumber = '',
  coverageCents = 0, expiresAt = null,
}) => ({
  id, kind, carrier, policyNumber, coverageCents, expiresAt,
  status: VerificationStatus.UNVERIFIED,
  documentUri: null,
});

export const isExpired = (item, today) =>
  !!item?.expiresAt && String(today) > String(item.expiresAt);

// ─── Permits ─────────────────────────────────────────────────────────────────

export const PermitStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  ISSUED: 'ISSUED',
  INSPECTION_SCHEDULED: 'INSPECTION_SCHEDULED',
  PASSED: 'PASSED',
  CORRECTION_REQUIRED: 'CORRECTION_REQUIRED',
  FAILED: 'FAILED',
  FINALED: 'FINALED',
  EXPIRED: 'EXPIRED',
};

export const PERMIT_TRANSITIONS = Object.freeze({
  DRAFT: ['SUBMITTED', 'EXPIRED'],
  SUBMITTED: ['ISSUED', 'CORRECTION_REQUIRED', 'EXPIRED'],
  ISSUED: ['INSPECTION_SCHEDULED', 'EXPIRED'],
  INSPECTION_SCHEDULED: ['PASSED', 'FAILED', 'CORRECTION_REQUIRED', 'EXPIRED'],
  PASSED: ['FINALED', 'INSPECTION_SCHEDULED'],   // multi-inspection jobs re-enter
  CORRECTION_REQUIRED: ['INSPECTION_SCHEDULED', 'SUBMITTED', 'EXPIRED'],
  FAILED: ['CORRECTION_REQUIRED', 'INSPECTION_SCHEDULED', 'EXPIRED'],
  FINALED: [],
  EXPIRED: ['SUBMITTED'],
});

export const permit = ({
  id, projectId = null, number = null, ahj = '', type = 'ELECTRICAL',
  description = '', createdAt,
}) => ({
  id, projectId, number, ahj, type, description,
  status: PermitStatus.DRAFT,
  createdAt,
  updatedAt: createdAt,
  inspections: [],
  documents: [],
  reviewerNotes: [],
  timeline: [{ at: createdAt, status: PermitStatus.DRAFT, note: 'Created' }],
});

export const transitionPermit = (p, to, { at, note = null } = {}) => {
  if (!(PERMIT_TRANSITIONS[p.status] ?? []).includes(to)) {
    return { ok: false, error: `Illegal permit transition ${p.status} → ${to}`, allowed: PERMIT_TRANSITIONS[p.status] ?? [] };
  }
  return {
    ok: true,
    permit: {
      ...p,
      status: to,
      updatedAt: at,
      timeline: [...p.timeline, { at, status: to, note }],
    },
  };
};

export const inspection = ({ id, kind = 'ROUGH_IN', scheduledFor = null, inspector = null }) => ({
  id, kind, scheduledFor, inspector,
  result: null,          // PASSED | FAILED | CORRECTION_REQUIRED
  notes: [],
  photoIds: [],
});

// ─── Inspection assistant checklist ──────────────────────────────────────────
//
// A prep checklist, deliberately phrased as reminders to verify — not as a claim
// that a job is code-compliant. The app is not the AHJ.

export const INSPECTION_CHECKLIST = Object.freeze([
  { id: 'panel_labels', title: 'Panel directory legible and specific', ref: 'NEC 408.4(A)', verified: true },
  { id: 'gfci', title: 'GFCI protection where required', ref: 'NEC 210.8', verified: true },
  { id: 'afci', title: 'AFCI protection where required', ref: 'NEC 210.12', verified: true },
  { id: 'grounding', title: 'Grounding and bonding complete', ref: 'NEC Article 250', verified: true },
  { id: 'device_spacing', title: 'Receptacle spacing meets requirements', ref: 'NEC 210.52', verified: true },
  { id: 'torque', title: 'Terminations torqued to listed values', ref: 'NEC 110.14(D)', verified: true },
  { id: 'box_fill', title: 'Box fill within limits', ref: 'NEC 314.16', verified: true },
  { id: 'support', title: 'Raceway and cable support/securing', ref: null, verified: false },
  { id: 'permit_notes', title: 'Permit conditions and plan notes addressed', ref: null, verified: false },
  { id: 'photos', title: 'Concealed work photographed before cover', ref: null, verified: false },
]);

export const INSPECTION_DISCLAIMER =
  'A preparation aid only. It does not certify compliance and does not replace the ' +
  'authority having jurisdiction, the adopted code, approved plans, or listing instructions.';
