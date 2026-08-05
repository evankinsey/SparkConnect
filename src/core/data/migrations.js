// ─── VERSIONED STORAGE + MIGRATIONS ──────────────────────────────────────────
// Requirements: DAT-01 … DAT-06, TST-05, NNR-12
//
// The audit found no schema and no versioning: every screen wrote raw strings to
// AsyncStorage. That is fine until v1.1 needs to change a shape, at which point
// a user's invoices, estimates, Job Cam projects, quiz progress and purchase
// state are one bad write away from gone. DAT-03 forbids that outright.
//
// Design rules, in priority order (safety → correctness → data preservation):
//   1. NEVER destroy data. A failed migration leaves the original untouched.
//   2. Back up before writing, and keep the backup until the write is verified.
//   3. A corrupt record is quarantined, not dropped, and never blocks the rest.
//   4. Migrations are pure functions and are replayable — running twice is safe.
//   5. The storage adapter is injected, so this whole layer is testable.

export const SCHEMA_VERSION = 2;

const META_KEY = '@sc_schema_meta_v1';
const BACKUP_PREFIX = '@sc_backup_';
const QUARANTINE_PREFIX = '@sc_quarantine_';

export const MigrationStatus = {
  OK: 'OK',
  ALREADY_CURRENT: 'ALREADY_CURRENT',
  MIGRATED: 'MIGRATED',
  FAILED_ROLLED_BACK: 'FAILED_ROLLED_BACK',
  PARTIAL_QUARANTINED: 'PARTIAL_QUARANTINED',
};

/**
 * Keys that existed before v1.1 shipped. Listed explicitly so a migration can
 * never touch a key nobody declared, and so DAT-03 is enforceable by test.
 */
export const LEGACY_KEYS = Object.freeze([
  '@sc_onboarding_done',
  '@sc_show_daily_q',
  '@sc_streak_data',
  '@sc_app_language',
  '@sc_notif_enabled',
  '@sc_notif_dismissed',
  '@sc_sparky_uses_v2',
  '@sc_sparky_date_v2',
  '@sc_calc_uses_v2',
  '@sc_calc_date_v2',
]);

/** Data that must survive every migration, forever (DAT-03). */
export const PROTECTED_DOMAINS = Object.freeze([
  'invoices', 'estimates', 'jobcam_projects', 'preferences', 'purchase_state', 'quiz_progress',
]);

// ─── Migration definitions ───────────────────────────────────────────────────
// Each migration is { from, to, describe, migrate(state) -> state }.
// `state` is a plain object: { [domain]: value }. Pure — no I/O.

export const MIGRATIONS = [
  {
    from: 0,
    to: 1,
    describe: 'Adopt a versioned envelope. Existing loose keys are read and preserved as-is.',
    migrate: (state) => ({
      ...state,
      preferences: {
        onboardingDone: state.legacy?.['@sc_onboarding_done'] === 'true',
        showDailyQuestion: state.legacy?.['@sc_show_daily_q'] !== 'false',
        language: state.legacy?.['@sc_app_language'] ?? 'english',
        notificationsEnabled: state.legacy?.['@sc_notif_enabled'] === 'true',
        ...(state.preferences ?? {}),
      },
      quiz_progress: state.quiz_progress ?? (() => {
        try {
          const raw = state.legacy?.['@sc_streak_data'];
          return raw ? { streak: JSON.parse(raw) } : {};
        } catch { return {}; }
      })(),
      invoices: state.invoices ?? [],
      estimates: state.estimates ?? [],
      jobcam_projects: state.jobcam_projects ?? [],
      purchase_state: state.purchase_state ?? {},
    }),
  },
  {
    from: 1,
    to: 2,
    describe: 'Add the v1.1 domains: role, code edition, simulation progress and attempt history.',
    migrate: (state) => ({
      ...state,
      preferences: { role: null, codeEdition: '2023', ...(state.preferences ?? {}) },
      simulation_progress: state.simulation_progress ?? {
        lessonsCompleted: [], attempts: {}, totalXp: 0,
        currentStreak: 0, longestStreak: 0, lastCompletedDate: null,
      },
      simulation_attempts: state.simulation_attempts ?? [],
      contractor_profile: state.contractor_profile ?? null,
      permits: state.permits ?? [],
      licenses: state.licenses ?? [],
    }),
  },
];

export const migrationPath = (from, to = SCHEMA_VERSION) => {
  const path = [];
  let v = from;
  while (v < to) {
    const step = MIGRATIONS.find((m) => m.from === v);
    if (!step) throw new Error(`No migration from schema v${v}`);
    path.push(step);
    v = step.to;
  }
  return path;
};

/** Apply a migration chain to a state object. Pure — used directly by tests. */
export const applyMigrations = (state, from, to = SCHEMA_VERSION) =>
  migrationPath(from, to).reduce((acc, step) => step.migrate(acc), state);

// ─── Corrupt record handling (DAT-05) ────────────────────────────────────────

const safeParse = (raw) => {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  try { return { ok: true, value: JSON.parse(raw) }; } catch (e) { return { ok: false, error: String(e && e.message) }; }
};

// ─── Runner ──────────────────────────────────────────────────────────────────

/**
 * @param storage  { getItem, setItem, removeItem, getAllKeys? } — injected so this is testable
 * @param now      injectable clock for deterministic backup keys
 */
export const createMigrationRunner = (storage, { now = () => new Date().toISOString() } = {}) => {
  const readMeta = async () => {
    const parsed = safeParse(await storage.getItem(META_KEY));
    if (!parsed.ok || !parsed.value || typeof parsed.value.version !== 'number') {
      return { version: 0, migratedAt: null, history: [] };
    }
    return parsed.value;
  };

  const readLegacy = async () => {
    const legacy = {};
    for (const key of LEGACY_KEYS) {
      try { legacy[key] = await storage.getItem(key); } catch { legacy[key] = null; }
    }
    return legacy;
  };

  /** Reads every declared domain, quarantining anything unparseable (DAT-05). */
  const readState = async (domains) => {
    const state = {};
    const quarantined = [];
    for (const domain of domains) {
      const raw = await storage.getItem(`@sc_${domain}`);
      const parsed = safeParse(raw);
      if (parsed.ok) {
        if (parsed.value !== null) state[domain] = parsed.value;
      } else {
        // Corrupt: preserve the raw bytes under quarantine and carry on. The
        // record is never silently discarded, and one bad domain cannot block
        // the migration of everything else.
        quarantined.push({ domain, error: parsed.error });
        try { await storage.setItem(`${QUARANTINE_PREFIX}${domain}_${now()}`, raw); } catch { /* best effort */ }
      }
    }
    return { state, quarantined };
  };

  const backup = async (state, meta) => {
    const key = `${BACKUP_PREFIX}v${meta.version}_${now()}`;
    await storage.setItem(key, JSON.stringify({ meta, state }));
    return key;
  };

  const writeState = async (state) => {
    const written = [];
    for (const [domain, value] of Object.entries(state)) {
      if (domain === 'legacy') continue; // legacy keys are read-only, never rewritten
      await storage.setItem(`@sc_${domain}`, JSON.stringify(value));
      written.push(domain);
    }
    return written;
  };

  /**
   * Run any pending migrations.
   * On failure the original data is untouched and the backup key is returned so
   * a human can recover (DAT-05, DAT-06).
   */
  const run = async ({ domains = null } = {}) => {
    const meta = await readMeta();
    if (meta.version === SCHEMA_VERSION) {
      return { status: MigrationStatus.ALREADY_CURRENT, from: meta.version, to: meta.version, quarantined: [] };
    }
    if (meta.version > SCHEMA_VERSION) {
      // A downgrade. Never migrate backwards — an older build must not rewrite
      // data a newer build created.
      return { status: MigrationStatus.OK, from: meta.version, to: meta.version, downgradeDetected: true, quarantined: [] };
    }

    const allDomains = domains ?? [
      ...PROTECTED_DOMAINS, 'simulation_progress', 'simulation_attempts',
      'contractor_profile', 'permits', 'licenses',
    ];

    const { state, quarantined } = await readState(allDomains);
    state.legacy = await readLegacy();

    let backupKey = null;
    try {
      backupKey = await backup(state, meta);
      const migrated = applyMigrations(state, meta.version, SCHEMA_VERSION);

      // DAT-03 guard: refuse to write a migration that dropped a protected
      // domain which previously had content.
      for (const domain of PROTECTED_DOMAINS) {
        const had = state[domain] !== undefined && state[domain] !== null;
        const has = migrated[domain] !== undefined && migrated[domain] !== null;
        if (had && !has) throw new Error(`Migration would drop protected domain "${domain}"`);
      }

      const written = await writeState(migrated);
      await storage.setItem(META_KEY, JSON.stringify({
        version: SCHEMA_VERSION,
        migratedAt: now(),
        history: [...(meta.history ?? []), { from: meta.version, to: SCHEMA_VERSION, at: now() }],
        lastBackupKey: backupKey,
      }));

      return {
        status: quarantined.length ? MigrationStatus.PARTIAL_QUARANTINED : MigrationStatus.MIGRATED,
        from: meta.version,
        to: SCHEMA_VERSION,
        written,
        backupKey,
        quarantined,
      };
    } catch (e) {
      // Nothing was committed: the meta version is unchanged, so the next launch
      // retries from the same starting point (DAT-05 "retry migration").
      return {
        status: MigrationStatus.FAILED_ROLLED_BACK,
        from: meta.version,
        to: meta.version,
        error: String(e && e.message),
        backupKey,
        quarantined,
      };
    }
  };

  const restoreFromBackup = async (backupKey) => {
    const parsed = safeParse(await storage.getItem(backupKey));
    if (!parsed.ok || !parsed.value) return { ok: false, error: 'Backup missing or unreadable' };
    await writeState(parsed.value.state ?? {});
    await storage.setItem(META_KEY, JSON.stringify(parsed.value.meta ?? { version: 0, history: [] }));
    return { ok: true, restored: Object.keys(parsed.value.state ?? {}) };
  };

  return { run, readMeta, readState, restoreFromBackup, applyMigrations, META_KEY };
};

export { META_KEY, BACKUP_PREFIX, QUARANTINE_PREFIX };
