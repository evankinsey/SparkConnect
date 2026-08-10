// ─── DO THE TWO SYSTEMS AGREE? ───────────────────────────────────────────────
// The app says one number, the server enforces another, and nobody finds out
// until a paying customer is cut off early or runs far past what was sold.
//
// The generator and the shared policy file stop them drifting in the SOURCE.
// This catches the case they cannot: a backend that has not been redeployed, or
// one enforcing a figure typed in by hand months ago. The server already tells
// us `remainingQuestions` on every answer — that number is a claim about the
// policy, and it can be checked against ours for free.
//
// WHAT THIS DOES NOT DO: change anybody's allowance. The server is the
// authority on what it will serve; the client cannot overrule it and must not
// try. This only NOTICES, so a mismatch surfaces as a fact rather than as a
// confused support thread.
//
// Pure module: no React, no network.

import { ASK_ALLOWANCE } from './entitlements.js';

export const Agreement = Object.freeze({
  AGREE: 'AGREE',
  UNKNOWN: 'UNKNOWN',
  SERVER_STRICTER: 'SERVER_STRICTER',
  SERVER_LOOSER: 'SERVER_LOOSER',
});

/**
 * Compare what the server reported against what the app advertises.
 *
 * `remaining` is the server's own count after answering. Add the answers used
 * today and you have the ceiling it is enforcing.
 */
export const checkAgreement = (input) => {
  // `= {}` only fires for undefined. An explicit null — which is what a storage
  // read that found nothing hands over — throws. This is the fourth time that
  // default has bitten in this codebase, so it is written the safe way here.
  const { remaining = null, usedToday = 0, isPro = false } = input ?? {};
  // Number(null) is 0, not NaN — so an absent reading looked like "the server
  // is enforcing zero" and reported a mismatch against a number nobody had
  // observed. Absence has to be checked before coercion.
  if (remaining === null || remaining === undefined || remaining === '') {
    return Object.freeze({ status: Agreement.UNKNOWN, clientLimit: null, serverLimit: null });
  }
  const r = Number(remaining);
  const used = Number(usedToday);
  if (!Number.isFinite(r) || r < 0 || !Number.isFinite(used) || used < 0) {
    return Object.freeze({ status: Agreement.UNKNOWN, clientLimit: null, serverLimit: null });
  }

  const clientLimit = isPro ? ASK_ALLOWANCE.pro.perDay : ASK_ALLOWANCE.free.perDay;
  const serverLimit = r + used;

  // One off is a rounding or ordering artefact between counting the request and
  // answering it, not a policy disagreement. Only a real gap is reported.
  if (Math.abs(serverLimit - clientLimit) <= 1) {
    return Object.freeze({ status: Agreement.AGREE, clientLimit, serverLimit });
  }
  return Object.freeze({
    status: serverLimit < clientLimit ? Agreement.SERVER_STRICTER : Agreement.SERVER_LOOSER,
    clientLimit,
    serverLimit,
  });
};

/**
 * What to say, if anything.
 *
 * SERVER_STRICTER is the one that reaches the user: they were sold a number and
 * are being given fewer, so they get told the truth rather than being left to
 * conclude the app is broken. SERVER_LOOSER is a windfall — nobody needs a
 * message saying they got more than promised — so it is logged and no more.
 */
export const agreementNotice = (check) => {
  if (!check || check.status !== Agreement.SERVER_STRICTER) return null;
  return `You have ${check.serverLimit} answers a day right now, not ${check.clientLimit}. `
    + 'We are correcting this — nothing you have bought is affected.';
};

/** For the health screen and a bug report. */
export const agreementLine = (check) => {
  if (!check || check.status === Agreement.UNKNOWN) return 'Server allowance not yet observed.';
  if (check.status === Agreement.AGREE) return `App and server agree: ${check.clientLimit}/day.`;
  return `MISMATCH — app advertises ${check.clientLimit}/day, server is enforcing ${check.serverLimit}/day.`;
};
