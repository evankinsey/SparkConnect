// ─── WHAT ACTUALLY WENT WRONG ────────────────────────────────────────────────
// Turning a failed backend call into a sentence that is true.
//
// THE BUG THIS EXISTS FOR: Blueprint Takeoff displayed "Could not reach SparkAI.
// Check your connection and try again." on a device with a working connection —
// SparkAI text answers were arriving from the same endpoint at the same moment.
// The client had the HTTP status and threw it away, so a 413 and airplane mode
// rendered identically and the search went to the wrong end of the stack.
//
// Same lesson as the store diagnosis: the failure knew its own name and nobody
// wrote it down.
//
// Pure module: no React, no network.

/** Vercel rejects a serverless request body over this, at the edge. */
export const MAX_UPLOAD_BYTES = 4_500_000;

/** Leaves room for the prompt, the device id and JSON escaping around it. */
export const MAX_IMAGE_BASE64 = 3_200_000;

export const Cause = Object.freeze({
  OFFLINE: 'OFFLINE',
  TIMEOUT: 'TIMEOUT',
  TOO_LARGE: 'TOO_LARGE',
  BLOCKED: 'BLOCKED',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER: 'SERVER',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Classify a result from askNecBackend.
 *
 * `{ ok: false, status }` carries the truth. A null is still accepted because
 * older callers pass one, and it is honestly unknown rather than assumed to be
 * the network.
 */
export const classify = (result) => {
  if (result === 'rate_limited') return Cause.RATE_LIMITED;
  if (!result) return Cause.UNKNOWN;
  if (result.ok !== false) return null;
  if (result.aborted) return Cause.TIMEOUT;
  const s = Number(result.status) || 0;
  if (s === 0) return Cause.OFFLINE;
  if (s === 413) return Cause.TOO_LARGE;
  if (s === 401 || s === 403) return Cause.BLOCKED;
  if (s === 429) return Cause.RATE_LIMITED;
  if (s >= 500) return Cause.SERVER;
  return Cause.UNKNOWN;
};

const MESSAGES = Object.freeze({
  [Cause.OFFLINE]: 'No connection to SparkAI. Check your signal and try again.',
  [Cause.TIMEOUT]: 'That took too long to come back. A big photo on a weak signal is the usual reason — try again, or move somewhere with better service.',
  [Cause.TOO_LARGE]: 'That photo is too large to send. Take it from a little further back, or use a smaller image.',
  [Cause.BLOCKED]: 'SparkAI refused the request. Nothing is wrong with your connection — this one is on us, and reporting it helps.',
  [Cause.RATE_LIMITED]: 'You are out of answers for today.',
  [Cause.SERVER]: 'SparkAI had a problem at its end. Nothing you did — try again shortly.',
  [Cause.UNKNOWN]: 'That did not come back, and the reason was not clear. Try again.',
});

export const messageFor = (result) => {
  const c = classify(result);
  return c ? MESSAGES[c] : null;
};

/** Whether trying again is honest advice. */
export const retryWorthwhile = (result) => {
  const c = classify(result);
  return c === Cause.OFFLINE || c === Cause.TIMEOUT || c === Cause.SERVER;
};

/**
 * Is this image small enough to send?
 *
 * Checked BEFORE the upload. Discovering the limit after a 20-second upload on
 * a job site is the same information delivered at the worst possible moment.
 */
export const imageTooLarge = (base64) =>
  typeof base64 === 'string' && base64.length > MAX_IMAGE_BASE64;

/** For the log and a bug report, never for the user. */
export const technicalLine = (result) => {
  if (!result || result.ok !== false) return null;
  return `cause=${classify(result)} status=${result.status ?? '?'}${result.aborted ? ' aborted' : ''}`;
};
