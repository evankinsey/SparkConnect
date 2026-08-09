// ─── MARKETPLACE STORE ───────────────────────────────────────────────────────
// Persistence for Contractor Connect, honest about where it runs.
//
// TODAY this store runs on the device, over injected storage (AsyncStorage in
// the app, a Map in tests). There is no backend yet, and nothing here
// pretends otherwise: `syncState()` reports LOCAL_ONLY, submissions carry an
// outbox status, and the ops channel for early matches is explicit — records
// are exported and brokered by a person until src/core/backend exists.
//
// WHY THIS IS STILL THE RIGHT SHAPE: every method takes an `actor` and writes
// an audit row; reads are scoped by owner; verification fields cannot be
// written at all (the store re-derives them through verification.js). When
// the backend lands, this file's METHODS become API calls and the models move
// unchanged — that is the extraction the brief requires, kept cheap the same
// way module.js keeps the app split cheap.
//
// Pure module: no React, no network. Storage is injected.

import { screenSubmission, reviewItem } from './moderation.js';
import { ModerationState } from './opportunity.js';

const KEY = '@sc_connect_marketplace_v1';

export const Role = Object.freeze({
  USER: 'USER',
  ADMIN: 'ADMIN',
});

const emptyState = () => ({
  opportunities: [],
  contractors: [],
  qualifiers: [],
  businessNeeds: [],
  intros: [],
  qualifications: [],
  billingEvents: [],
  reviewQueue: [],
  audit: [],
  outbox: [],
});

/**
 * Create a store over any async storage with getItem/setItem.
 *
 * `actor` on every mutating call is { id, role }. This is not real auth — the
 * device is single-user and the backend will own identity — but it means every
 * call site already passes an actor, so moving to enforced server-side auth is
 * a validation change, not a call-site hunt.
 */
export const createMarketplaceStore = (storage, { now = () => Date.now() } = {}) => {
  let state = null;

  const load = async () => {
    if (state) return state;
    try {
      const raw = await storage.getItem(KEY);
      state = raw ? { ...emptyState(), ...JSON.parse(raw) } : emptyState();
    } catch {
      state = emptyState();
    }
    return state;
  };

  const save = async () => {
    try { await storage.setItem(KEY, JSON.stringify(state)); } catch { /* offline is fine; memory holds */ }
  };

  const audit = (actor, action, subjectId, detail = null) => {
    state.audit.push({
      at: new Date(now()).toISOString(),
      actorId: actor?.id ?? 'unknown',
      actorRole: actor?.role ?? Role.USER,
      action,
      subjectId,
      detail,
    });
  };

  const requireActor = (actor) => {
    if (!actor || typeof actor.id !== 'string' || !actor.id.trim()) {
      return { ok: false, reason: 'Every write names its actor.' };
    }
    return { ok: true };
  };

  const requireAdmin = (actor) => {
    const a = requireActor(actor);
    if (!a.ok) return a;
    if (actor.role !== Role.ADMIN) return { ok: false, reason: 'Admin only.' };
    return { ok: true };
  };

  // ── Submissions ────────────────────────────────────────────────────────────

  /** Every opportunity enters through moderation. There is no other door. */
  const submitOpportunity = async (actor, opportunity) => {
    const a = requireActor(actor);
    if (!a.ok) return a;
    if (!opportunity?.id) return { ok: false, reason: 'Not an opportunity.' };
    await load();

    const screening = screenSubmission(opportunity);
    const stored = {
      ...opportunity,
      ownerId: actor.id,
      moderationState: screening.clean ? ModerationState.PENDING : ModerationState.FLAGGED,
      screening: { flags: screening.flags.map((f) => ({ ...f })) },
      // Until a backend exists the record also queues for the manual ops
      // channel. PENDING_SEND is a fact about infrastructure, shown in the UI.
      outboxStatus: 'PENDING_SEND',
    };
    state.opportunities.push(stored);
    if (!screening.clean) {
      state.reviewQueue.push({ ...reviewItem(opportunity, screening, { at: new Date(now()).toISOString() }) });
    }
    audit(actor, 'opportunity.submit', opportunity.id,
      screening.clean ? null : `flagged: ${screening.flags.map((f) => f.id).join(',')}`);
    await save();
    return { ok: true, reason: null, screening, stored };
  };

  const submitProfile = async (actor, profile) => {
    const a = requireActor(actor);
    if (!a.ok) return a;
    if (!profile?.id || !profile?.kind) return { ok: false, reason: 'Not a profile.' };
    await load();

    // The one write rule that matters most: whatever verification the caller
    // put on the object is discarded. UNVERIFIED is not a default — it is the
    // only accepted starting point, and only applyVerification moves it.
    const stored = {
      ...profile,
      ownerId: actor.id,
      outboxStatus: 'PENDING_SEND',
      ...(profile.kind === 'BUSINESS_NEED'
        ? (() => {
          const screening = screenSubmission({ description: profile.reasonQualifierNeeded ?? '', howObtained: profile.expectedOversight ?? '' });
          if (!screening.clean) {
            state.reviewQueue.push({ opportunityId: profile.id, flags: screening.flags.map((f) => ({ ...f })), enteredQueueAt: new Date(now()).toISOString(), status: 'AWAITING_REVIEW' });
          }
          return { moderationState: screening.clean ? 'PENDING' : 'FLAGGED' };
        })()
        : { verification: { status: 'UNVERIFIED', outcome: null, history: [] } }),
    };
    const list = profile.kind === 'CONTRACTOR' ? state.contractors
      : profile.kind === 'QUALIFIER' ? state.qualifiers
        : profile.kind === 'BUSINESS_NEED' ? state.businessNeeds : null;
    if (!list) return { ok: false, reason: `Unknown profile kind: ${profile.kind}` };
    list.push(stored);
    audit(actor, `${profile.kind.toLowerCase()}.submit`, profile.id);
    await save();
    return { ok: true, reason: null, stored };
  };

  /**
   * Attach a verification transition. The caller passes the RESULT of
   * verification.js applyVerification — this store re-checks that the status
   * is evidenced-or-holding via the same module before writing, so a caller
   * cannot hand-roll a verified object past it.
   */
  const applyProfileVerification = async (actor, profileId, applied) => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    if (!applied?.ok || !applied?.next) return { ok: false, reason: 'Pass the result of applyVerification().' };
    await load();
    const list = [...state.contractors, ...state.qualifiers];
    const found = list.find((p) => p.id === profileId);
    if (!found) return { ok: false, reason: 'No such profile.' };
    found.verification = applied.next;
    audit(actor, 'profile.verification', profileId, applied.next.status);
    await save();
    return { ok: true, reason: null, stored: found };
  };

  // ── Moderation ─────────────────────────────────────────────────────────────

  const decideModeration = async (actor, subjectId, decision, reason = null) => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    if (!['CLEARED', 'REJECTED', 'DUPLICATE'].includes(decision)) {
      return { ok: false, reason: `Not a decision a reviewer can make: ${decision}` };
    }
    await load();
    const subject = state.opportunities.find((o) => o.id === subjectId)
      ?? state.businessNeeds.find((b) => b.id === subjectId);
    if (!subject) return { ok: false, reason: 'No such submission.' };
    subject.moderationState = decision;
    subject.moderation = { by: actor.id, reason, at: new Date(now()).toISOString() };
    state.reviewQueue = state.reviewQueue.map((r) =>
      r.opportunityId === subjectId ? { ...r, status: 'DECIDED', decision } : r);
    audit(actor, 'moderation.decide', subjectId, `${decision}${reason ? `: ${reason}` : ''}`);
    await save();
    return { ok: true, reason: null, stored: subject };
  };

  // ── Introductions / qualifications / billing ───────────────────────────────

  const putIntro = async (actor, intro) => {
    const a = requireActor(actor);
    if (!a.ok) return a;
    if (!intro?.id) return { ok: false, reason: 'Not an introduction.' };
    await load();
    const i = state.intros.findIndex((x) => x.id === intro.id);
    if (i >= 0) state.intros[i] = intro; else state.intros.push(intro);
    audit(actor, 'intro.put', intro.id, intro.status);
    await save();
    return { ok: true, reason: null };
  };

  const putQualification = async (actor, pipeline) => {
    const a = requireActor(actor);
    if (!a.ok) return a;
    if (!pipeline?.id) return { ok: false, reason: 'Not a pipeline.' };
    await load();
    const i = state.qualifications.findIndex((x) => x.id === pipeline.id);
    if (i >= 0) state.qualifications[i] = pipeline; else state.qualifications.push(pipeline);
    audit(actor, 'qualification.put', pipeline.id, pipeline.status);
    await save();
    return { ok: true, reason: null };
  };

  const putBillingEvent = async (actor, event) => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    if (!event?.id) return { ok: false, reason: 'Not a billing event.' };
    await load();
    state.billingEvents.push(event);
    audit(actor, 'billing.record', event.id, event.kind);
    await save();
    return { ok: true, reason: null };
  };

  // ── Reads, scoped ──────────────────────────────────────────────────────────

  /** A user reads their own records. An admin reads everything. */
  const readOwn = async (actor) => {
    const a = requireActor(actor);
    if (!a.ok) return a;
    await load();
    const mine = (rows) => rows.filter((r) => r.ownerId === actor.id);
    return {
      ok: true,
      data: actor.role === Role.ADMIN
        ? snapshot()
        : Object.freeze({
          opportunities: mine(state.opportunities),
          contractors: mine(state.contractors),
          qualifiers: mine(state.qualifiers),
          businessNeeds: mine(state.businessNeeds),
          intros: state.intros.filter((i) => i.senderId === actor.id || i.recipientId === actor.id),
        }),
    };
  };

  const snapshot = () => Object.freeze({
    opportunities: [...state.opportunities],
    contractors: [...state.contractors],
    qualifiers: [...state.qualifiers],
    businessNeeds: [...state.businessNeeds],
    intros: [...state.intros],
    qualifications: [...state.qualifications],
    billingEvents: [...state.billingEvents],
    reviewQueue: [...state.reviewQueue],
    audit: [...state.audit],
  });

  const adminSnapshot = async (actor) => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    await load();
    return { ok: true, data: snapshot() };
  };

  /** Where the data actually lives, said plainly for the UI to render. */
  const syncState = () => Object.freeze({
    mode: 'LOCAL_ONLY',
    detail: 'Records live on this device and are brokered manually until the backend ships. '
      + 'Nothing is published to other users from here.',
  });

  return {
    submitOpportunity,
    submitProfile,
    applyProfileVerification,
    decideModeration,
    putIntro,
    putQualification,
    putBillingEvent,
    readOwn,
    adminSnapshot,
    syncState,
  };
};

export const STORAGE_KEY = KEY;
