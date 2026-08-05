// ─── TOOLS, VEHICLES, WARRANTIES, MAINTENANCE ────────────────────────────────
// Four features that share one shape: a thing, its identity, and a date that
// eventually matters.
//
// Maintenance reminders are the highest-revenue item on this list. A contractor
// who installed a generator in March gets a reminder in September to call that
// customer about a service — turning a one-off install into recurring revenue.
// That is the difference between a tool app and a business app.

// ─── Tools ───────────────────────────────────────────────────────────────────

export const ToolCategory = {
  POWER: 'POWER', HAND: 'HAND', METER: 'METER', BATTERY: 'BATTERY',
  LADDER: 'LADDER', BENDER: 'BENDER', SAFETY: 'SAFETY', OTHER: 'OTHER',
};

export const tool = ({
  id, name, brand = '', model = '', serialNumber = null,
  category = ToolCategory.OTHER, purchasedAt = null, purchasePriceCents = null,
  assignedTo = null, vehicleId = null, photoUri = null, notes = '',
  warrantyExpiresAt = null,
}) => ({
  id, name, brand, model, serialNumber, category,
  purchasedAt, purchasePriceCents,
  assignedTo, vehicleId, photoUri, notes,
  warrantyExpiresAt,
  status: 'IN_SERVICE',   // IN_SERVICE | LOANED | LOST | STOLEN | RETIRED
  lastSeenAt: null,
});

export const vehicle = ({ id, name, plate = null, make = '', model = '', year = null }) => ({
  id, name, plate, make, model, year, toolIds: [],
});

/**
 * Insurance-ready export. This is the actual reason to track serial numbers:
 * after a van gets broken into, an insurer wants make, model, serial and a
 * purchase date, and nobody has that written down.
 */
export const insuranceManifest = (tools, { asOf }) => {
  const covered = tools.filter((t) => t.status !== 'RETIRED');
  const totalCents = covered.reduce((sum, t) => sum + (t.purchasePriceCents ?? 0), 0);
  return {
    asOf,
    itemCount: covered.length,
    declaredValueCents: totalCents,
    itemsMissingSerial: covered.filter((t) => !t.serialNumber).map((t) => t.id),
    itemsMissingPrice: covered.filter((t) => t.purchasePriceCents == null).map((t) => t.id),
    items: covered.map((t) => ({
      name: t.name, brand: t.brand, model: t.model,
      serialNumber: t.serialNumber, purchasedAt: t.purchasedAt,
      purchasePriceCents: t.purchasePriceCents, category: t.category,
    })),
  };
};

export const toolsMissingFromVehicle = (vehicleRecord, tools, { scannedToolIds }) => {
  const expected = new Set(vehicleRecord.toolIds);
  const seen = new Set(scannedToolIds);
  const missing = [...expected].filter((id) => !seen.has(id));
  const unexpected = [...seen].filter((id) => !expected.has(id));
  return {
    missing: missing.map((id) => tools.find((t) => t.id === id) ?? { id }),
    unexpected: unexpected.map((id) => tools.find((t) => t.id === id) ?? { id }),
    complete: missing.length === 0,
  };
};

// ─── Warranties ──────────────────────────────────────────────────────────────

export const WarrantySubject = {
  INSTALLED_EQUIPMENT: 'INSTALLED_EQUIPMENT',  // what you put in a customer's home
  OWN_TOOL: 'OWN_TOOL',
  LABOUR: 'LABOUR',
};

export const warranty = ({
  id, subject = WarrantySubject.INSTALLED_EQUIPMENT,
  description, customerId = null, projectId = null,
  installedAt, expiresAt, manufacturer = '', model = '', serialNumber = null,
  termMonths = null, notes = '',
}) => ({
  id, subject, description, customerId, projectId,
  installedAt, expiresAt, manufacturer, model, serialNumber, termMonths, notes,
  claimedAt: null,
});

const addMonths = (isoDate, months) => {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCMonth(base.getUTCMonth() + months);
  return base.toISOString().slice(0, 10);
};

export const warrantyFromTerm = (props) => warranty({
  ...props,
  expiresAt: props.expiresAt ?? addMonths(props.installedAt, props.termMonths ?? 12),
});

export const warrantyStatus = (w, today) => {
  if (w.claimedAt) return 'CLAIMED';
  if (!w.expiresAt) return 'UNKNOWN';
  if (String(today) > String(w.expiresAt)) return 'EXPIRED';
  const daysLeft = dayGap(today, w.expiresAt);
  return daysLeft <= 60 ? 'EXPIRING_SOON' : 'ACTIVE';
};

export const expiringWarranties = (warranties, today, withinDays = 60) =>
  warranties
    .filter((w) => !w.claimedAt && w.expiresAt && dayGap(today, w.expiresAt) >= 0 && dayGap(today, w.expiresAt) <= withinDays)
    .sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));

// ─── Maintenance reminders ───────────────────────────────────────────────────

export const MaintenanceKind = {
  GENERATOR_SERVICE: 'GENERATOR_SERVICE',
  SURGE_PROTECTOR: 'SURGE_PROTECTOR',
  SMOKE_DETECTOR: 'SMOKE_DETECTOR',
  PANEL_INSPECTION: 'PANEL_INSPECTION',
  THERMAL_SCAN: 'THERMAL_SCAN',
  EV_CHARGER_CHECK: 'EV_CHARGER_CHECK',
  EMERGENCY_LIGHTING: 'EMERGENCY_LIGHTING',
  CUSTOM: 'CUSTOM',
};

// Default intervals. These are scheduling conveniences, not code requirements —
// the actual interval comes from the manufacturer's instructions, and the UI
// says so.
export const DEFAULT_INTERVAL_MONTHS = Object.freeze({
  GENERATOR_SERVICE: 12,
  SURGE_PROTECTOR: 60,
  SMOKE_DETECTOR: 120,
  PANEL_INSPECTION: 36,
  THERMAL_SCAN: 12,
  EV_CHARGER_CHECK: 12,
  EMERGENCY_LIGHTING: 12,
  CUSTOM: 12,
});

export const MAINTENANCE_DISCLAIMER =
  'Intervals are scheduling defaults, not code requirements. Follow the manufacturer\'s ' +
  'instructions and any requirement adopted by your jurisdiction.';

export const maintenanceReminder = ({
  id, kind = MaintenanceKind.CUSTOM, description = '',
  customerId = null, projectId = null, lastServicedAt,
  intervalMonths = null, notes = '',
}) => {
  const months = intervalMonths ?? DEFAULT_INTERVAL_MONTHS[kind] ?? 12;
  return {
    id, kind, description, customerId, projectId,
    lastServicedAt,
    intervalMonths: months,
    nextDueAt: addMonths(lastServicedAt, months),
    notes,
    active: true,
    disclaimer: MAINTENANCE_DISCLAIMER,
  };
};

/** Completing a service rolls the reminder forward — the recurring-revenue loop. */
export const completeMaintenance = (reminder, { servicedAt }) => ({
  ...reminder,
  lastServicedAt: servicedAt,
  nextDueAt: addMonths(servicedAt, reminder.intervalMonths),
});

export const dueMaintenance = (reminders, today, withinDays = 30) =>
  reminders
    .filter((r) => r.active)
    .map((r) => ({ ...r, daysUntilDue: dayGap(today, r.nextDueAt) }))
    .filter((r) => r.daysUntilDue <= withinDays)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

/**
 * The follow-up worklist: everything worth a phone call this month.
 * This is the screen that makes a contractor money, so it is one call.
 */
export const followUpWorklist = ({ warranties = [], reminders = [], today, withinDays = 30 }) => {
  const due = dueMaintenance(reminders, today, withinDays).map((r) => ({
    type: 'MAINTENANCE',
    id: r.id,
    customerId: r.customerId,
    label: r.description || r.kind.replace(/_/g, ' ').toLowerCase(),
    dueAt: r.nextDueAt,
    daysUntil: r.daysUntilDue,
    overdue: r.daysUntilDue < 0,
  }));

  const expiring = expiringWarranties(warranties, today, withinDays).map((w) => ({
    type: 'WARRANTY',
    id: w.id,
    customerId: w.customerId,
    label: `${w.description} warranty expiring`,
    dueAt: w.expiresAt,
    daysUntil: dayGap(today, w.expiresAt),
    overdue: false,
  }));

  return [...due, ...expiring].sort((a, b) => a.daysUntil - b.daysUntil);
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toDayNumber = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return NaN;
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function dayGap(from, to) {
  const a = toDayNumber(from);
  const b = toDayNumber(to);
  return Number.isNaN(a) || Number.isNaN(b) ? NaN : b - a;
}

export { addMonths };
