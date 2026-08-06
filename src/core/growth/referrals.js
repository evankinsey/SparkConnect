// ─── CREATOR / REFERRAL PROGRAM ──────────────────────────────────────────────
// A creator gets Pro for life and a code. Their followers get a free month or a
// discounted lifetime. Installs, conversions and revenue get attributed back.
//
// THE HONEST BOUNDARY, and the reason this file is smaller than it looks like
// it should be: real attribution cannot live on the phone. A client that counts
// its own conversions is a client that can be edited to count more of them, and
// a creator payout driven by a self-reported number is fraud waiting to happen.
//
// So this module owns exactly the parts that are safe on-device:
//   - the code format, and validating one the user typed
//   - what a code CLAIMS to unlock, as a request
//   - the local record of which code was entered and when
//
// Redemption, entitlement and payout are the server's job, through RevenueCat
// offer codes or its own grant API. `pendingRedemption()` produces what the
// server needs; nothing here grants Pro to anyone. A test asserts that.
//
// Pure module: no React, no storage, no network.

export const RewardKind = {
  FREE_MONTH: 'FREE_MONTH',
  DISCOUNT_LIFETIME: 'DISCOUNT_LIFETIME',
  NONE: 'NONE',
};

export const CreatorTier = {
  AMBASSADOR: 'AMBASSADOR',   // Pro for life, standard share
  PARTNER: 'PARTNER',         // Pro for life, higher share, custom landing
};

// Codes are typed with a thumb, on a job site, possibly with gloves. Six
// characters from an unambiguous alphabet: no O/0, no I/1/L, no S/5.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZ2346789';
export const CODE_LENGTH = 6;

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Normalize what the user typed: case, spaces and dashes all get forgiven. */
export const normalizeCode = (raw) => {
  if (typeof raw !== 'string') return '';
  // Strip anything outside the alphabet rather than trying to "fix" it. The
  // alphabet already excludes the confusable characters (O/0, I/1/L, S/5), so
  // anything else the user typed was punctuation or a slip, not part of a code.
  const only = new RegExp(`[^${CODE_ALPHABET}]`, 'g');
  return raw.toUpperCase().replace(only, '').slice(0, CODE_LENGTH * 2);
};

/**
 * Is this a well-formed code? This is a FORMAT check only — it says nothing
 * about whether the code exists or is still valid, which only the server knows.
 */
export const isWellFormedCode = (raw) => CODE_RE.test(normalizeCode(raw));

/**
 * Generate a code from a creator handle deterministically, so the same creator
 * always gets the same code and it can be regenerated without a database.
 * Server-side generation should still check for collisions.
 */
export const codeForHandle = (handle) => {
  const s = String(handle ?? '').toLowerCase();
  if (!s) return null;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[h % CODE_ALPHABET.length];
    h = Math.floor(h / CODE_ALPHABET.length) + (h % 7) * 131;
  }
  return out;
};

export const emptyReferralState = () => ({
  enteredCode: null,
  enteredAt: null,
  status: 'NONE',          // NONE | PENDING | ACCEPTED | REJECTED
  rewardKind: RewardKind.NONE,
  serverMessage: null,
});

/** Coerce a stored referral record; a corrupt save must not brick onboarding. */
export const sanitizeReferralState = (raw) => {
  if (!raw || typeof raw !== 'object') return emptyReferralState();
  const code = isWellFormedCode(raw.enteredCode) ? normalizeCode(raw.enteredCode) : null;
  const status = ['NONE', 'PENDING', 'ACCEPTED', 'REJECTED'].includes(raw.status) ? raw.status : 'NONE';
  return {
    enteredCode: code,
    enteredAt: Number.isFinite(raw.enteredAt) ? raw.enteredAt : null,
    // A locally stored "ACCEPTED" is a claim, not an entitlement — see the
    // header. Pro comes from RevenueCat, never from this field.
    status: code ? status : 'NONE',
    rewardKind: Object.values(RewardKind).includes(raw.rewardKind) ? raw.rewardKind : RewardKind.NONE,
    serverMessage: typeof raw.serverMessage === 'string' ? raw.serverMessage.slice(0, 200) : null,
  };
};

/**
 * Build the redemption request for the server. Returns { ok:false } for a
 * malformed code so the UI can say so without a round trip.
 */
export const pendingRedemption = (rawCode, { deviceId = null, at = Date.now() } = {}) => {
  if (!isWellFormedCode(rawCode)) {
    return { ok: false, reason: `Codes are ${CODE_LENGTH} characters — check it and try again.` };
  }
  return {
    ok: true,
    request: {
      code: normalizeCode(rawCode),
      deviceId: typeof deviceId === 'string' ? deviceId.slice(0, 64) : null,
      at,
    },
  };
};

/** Apply whatever the server said. The server is the only source of truth. */
export const applyServerResponse = (state, response) => {
  const s = sanitizeReferralState(state);
  if (!response || typeof response !== 'object') {
    return { ...s, status: 'REJECTED', serverMessage: 'Could not reach the server. Try again.' };
  }
  if (response.accepted !== true) {
    return {
      ...s,
      status: 'REJECTED',
      rewardKind: RewardKind.NONE,
      serverMessage: typeof response.message === 'string' ? response.message.slice(0, 200) : 'That code is not valid.',
    };
  }
  return {
    ...s,
    status: 'ACCEPTED',
    rewardKind: Object.values(RewardKind).includes(response.rewardKind) ? response.rewardKind : RewardKind.NONE,
    serverMessage: typeof response.message === 'string' ? response.message.slice(0, 200) : null,
  };
};

export const rewardLabel = (kind) => {
  switch (kind) {
    case RewardKind.FREE_MONTH: return 'One month of Pro, free';
    case RewardKind.DISCOUNT_LIFETIME: return 'Discounted lifetime access';
    default: return null;
  }
};

/**
 * Creator-facing stats. Every field is server-reported and this shapes it for
 * display; nothing is computed on-device, because a creator's payout number
 * must not come from the creator's own phone.
 */
export const creatorDashboard = (raw) => {
  const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    handle: typeof raw?.handle === 'string' ? raw.handle.slice(0, 40) : '',
    code: isWellFormedCode(raw?.code) ? normalizeCode(raw.code) : null,
    tier: Object.values(CreatorTier).includes(raw?.tier) ? raw.tier : CreatorTier.AMBASSADOR,
    installs: n(raw?.installs),
    conversions: n(raw?.conversions),
    activeSubscribers: n(raw?.activeSubscribers),
    revenueCents: n(raw?.revenueCents),
    conversionRate: n(raw?.installs) > 0
      ? Math.round((n(raw?.conversions) / n(raw?.installs)) * 1000) / 10
      : 0,
    // Reported by the server so the creator knows how fresh the numbers are.
    asOf: Number.isFinite(raw?.asOf) ? raw.asOf : null,
  };
};

export const REFERRAL_DISCLAIMER =
  'Referral rewards are granted by the App Store or Google Play through your ' +
  'subscription, not by this app. Creator statistics are reported by the ' +
  'server and may lag real time.';
