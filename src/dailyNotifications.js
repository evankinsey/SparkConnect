// ─── DAILY CODE QUESTION NOTIFICATIONS ───────────────────────────────────────
// Delivers one code question every morning to the lock screen / notification
// centre, with the app icon badged.
//
// WHY THIS IS NOT A TRUE HOME-SCREEN WIDGET
// A real iOS Home Screen widget needs WidgetKit (Swift) and an Android widget
// needs an AppWidgetProvider (Kotlin). Neither can be written in JS, and
// neither runs in Expo Go. The scheduled local notification below is the
// cross-platform equivalent that actually ships today: it lands on the lock
// screen, in the notification centre, and as a banner, and tapping it opens
// SparkConnect on the Daily Question.
//
// HOW SCHEDULING WORKS
// A repeating DAILY trigger freezes its payload at schedule time, so it would
// show the SAME question forever. Instead we schedule one dated notification
// per day across a rolling horizon, each carrying that day's real question,
// and top the horizon back up every time the app opens.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getQuestionForDate, dayNumber } from './core/content/dailyQuestions';

const CHANNEL_ID = 'daily-code-question';
const ID_PREFIX = 'sc-daily-q-';
const HORIZON_DAYS = 21; // iOS caps pending local notifications at 64

export const STORAGE_ENABLED = '@sc_notif_enabled';
export const STORAGE_HOUR = '@sc_notif_hour';
export const STORAGE_MINUTE = '@sc_notif_minute';

export const DEFAULT_HOUR = 7;
export const DEFAULT_MINUTE = 30;

// Times offered by the Settings row, in tap order.
export const REMINDER_TIMES = [
  { hour: 5, minute: 30 },
  { hour: 6, minute: 0 },
  { hour: 6, minute: 30 },
  { hour: 7, minute: 0 },
  { hour: 7, minute: 30 },
  { hour: 8, minute: 0 },
];

const log = (context, error) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(`[SparkConnect:${context}]`, error);
};

const readStorage = async (key) => {
  try { return await AsyncStorage.getItem(key); } catch (e) { log('storage.get', e); return null; }
};
const writeStorage = async (key, value) => {
  try { await AsyncStorage.setItem(key, value); return true; } catch (e) { log('storage.set', e); return false; }
};

// ─── Module loading ──────────────────────────────────────────────────────────
// Lazy + cached so the app still runs where expo-notifications has no native
// module (Expo Go on Android since SDK 53, web, Snack).
let _mod;
let _handlerInstalled = false;

const loadNotifications = async () => {
  if (_mod !== undefined) return _mod;
  try {
    _mod = await import('expo-notifications');
  } catch (e) {
    log('dailyNotifications', 'expo-notifications unavailable in this environment');
    _mod = null;
    return null;
  }
  if (_mod && !_handlerInstalled) {
    _handlerInstalled = true;
    try {
      // Without a handler, a notification arriving while the app is in the
      // foreground is swallowed instead of shown.
      _mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowAlert: true, // pre-SDK-53 key, harmless afterwards
        }),
      });
    } catch (e) { log('setNotificationHandler', e); }
  }
  return _mod;
};

// Android 8+ drops notifications that have no channel, and the channel's
// importance — not the notification — decides whether it pops as a heads-up.
const ensureChannel = async (N) => {
  try {
    if (!N.setNotificationChannelAsync) return;
    await N.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Daily Code Question',
      description: 'One NEC code question each morning.',
      importance: N.AndroidImportance ? N.AndroidImportance.HIGH : 4,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
      sound: 'default',
      lockscreenVisibility: N.AndroidNotificationVisibility
        ? N.AndroidNotificationVisibility.PUBLIC
        : 1,
    });
  } catch (e) { log('ensureChannel', e); }
};

// ─── Preferences ─────────────────────────────────────────────────────────────
export const isDailyQuestionEnabled = async () => (await readStorage(STORAGE_ENABLED)) === 'true';

export const getReminderTime = async () => {
  const h = parseInt(await readStorage(STORAGE_HOUR), 10);
  const m = parseInt(await readStorage(STORAGE_MINUTE), 10);
  return {
    hour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : DEFAULT_HOUR,
    minute: Number.isInteger(m) && m >= 0 && m <= 59 ? m : DEFAULT_MINUTE,
  };
};

export const formatReminderTime = ({ hour, minute }) => {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
};

// ─── Permission ──────────────────────────────────────────────────────────────
export const getPermissionStatus = async () => {
  const N = await loadNotifications();
  if (!N) return 'unavailable';
  try {
    const { status } = await N.getPermissionsAsync();
    return status;
  } catch (e) { log('getPermissionStatus', e); return 'unavailable'; }
};

const requestPermission = async (N) => {
  try {
    const { status: existing } = await N.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await N.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return status === 'granted';
  } catch (e) { log('requestPermission', e); return false; }
};

// ─── Content ─────────────────────────────────────────────────────────────────
const buildContent = (q) => {
  // Show every choice. A two-choice preview would narrow the answer to a coin
  // flip before the user has even opened the app.
  const preview = q.choices
    .map((c, i) => `${String.fromCharCode(65 + i)}) ${c}`)
    .join('   ');
  return {
    title: '⚡ Daily Code Question',
    subtitle: `${q.category} · ${q.difficulty}`, // iOS only
    body: `${q.question}\n${preview}\n📖 ${q.ref}`,
    data: { screen: 'home', type: 'daily_question', questionId: q.id },
    sound: 'default',
    badge: 1,
  };
};

const dateTrigger = (N, date) => {
  const type = N.SchedulableTriggerInputTypes ? N.SchedulableTriggerInputTypes.DATE : 'date';
  return { type, date, channelId: CHANNEL_ID };
};

// ─── Scheduling ──────────────────────────────────────────────────────────────
export const cancelDailyQuestionNotifications = async () => {
  const N = await loadNotifications();
  if (!N) return;
  try {
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((s) => String(s.identifier || '').startsWith(ID_PREFIX))
        .map((s) => N.cancelScheduledNotificationAsync(s.identifier)),
    );
  } catch (e) { log('cancelDailyQuestionNotifications', e); }
};

// Rebuilds the whole horizon. Returns the number of notifications now pending,
// or 0 when notifications are off, denied, or unavailable.
export const scheduleDailyQuestionNotifications = async ({ skipEnabledCheck = false } = {}) => {
  const N = await loadNotifications();
  if (!N) return 0;
  if (!skipEnabledCheck && !(await isDailyQuestionEnabled())) return 0;

  try {
    const { status } = await N.getPermissionsAsync();
    if (status !== 'granted') return 0;
  } catch (e) { log('scheduleDailyQuestionNotifications.permission', e); return 0; }

  await ensureChannel(N);
  await cancelDailyQuestionNotifications();

  const { hour, minute } = await getReminderTime();
  const now = new Date();
  let scheduled = 0;

  for (let i = 0; i < HORIZON_DAYS; i++) {
    // Date arithmetic on the day component rolls months and years correctly.
    const fireAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0);
    if (fireAt.getTime() <= Date.now() + 5000) continue; // today's slot already passed
    try {
      await N.scheduleNotificationAsync({
        identifier: `${ID_PREFIX}${dayNumber(fireAt)}`,
        content: buildContent(getQuestionForDate(fireAt)),
        trigger: dateTrigger(N, fireAt),
      });
      scheduled++;
    } catch (e) { log('scheduleNotificationAsync', e); }
  }

  await writeStorage('@sc_notif_last_scheduled', new Date().toISOString());
  log('dailyNotifications', `scheduled ${scheduled} day(s) at ${formatReminderTime({ hour, minute })}`);
  return scheduled;
};

// Silent top-up for app launch / foreground. Never prompts for permission.
export const refreshDailyQuestionNotifications = async () => {
  if (!(await isDailyQuestionEnabled())) return 0;
  return scheduleDailyQuestionNotifications();
};

// User-facing opt-in. Prompts for permission, then fills the horizon.
// -> { ok, reason?, scheduled? }
export const enableDailyQuestionNotifications = async () => {
  const N = await loadNotifications();
  if (!N) return { ok: false, reason: 'unavailable' };

  const granted = await requestPermission(N);
  if (!granted) return { ok: false, reason: 'denied' };

  await writeStorage(STORAGE_ENABLED, 'true');
  const scheduled = await scheduleDailyQuestionNotifications({ skipEnabledCheck: true });
  return { ok: true, scheduled };
};

export const disableDailyQuestionNotifications = async () => {
  await writeStorage(STORAGE_ENABLED, 'false');
  await cancelDailyQuestionNotifications();
  const N = await loadNotifications();
  try { if (N && N.setBadgeCountAsync) await N.setBadgeCountAsync(0); } catch (e) { log('clearBadge', e); }
};

export const setReminderTime = async (hour, minute) => {
  await writeStorage(STORAGE_HOUR, String(hour));
  await writeStorage(STORAGE_MINUTE, String(minute));
  return refreshDailyQuestionNotifications();
};

// Advances to the next preset and reschedules. Returns the new {hour, minute}.
export const cycleReminderTime = async () => {
  const current = await getReminderTime();
  const idx = REMINDER_TIMES.findIndex((t) => t.hour === current.hour && t.minute === current.minute);
  const next = REMINDER_TIMES[(idx + 1) % REMINDER_TIMES.length];
  await setReminderTime(next.hour, next.minute);
  return next;
};

// ─── Taps ────────────────────────────────────────────────────────────────────
const isDailyQuestionResponse = (response) => {
  const data = response && response.notification && response.notification.request
    && response.notification.request.content
    && response.notification.request.content.data;
  return !!data && data.type === 'daily_question';
};

// Fires when the user taps the notification while the app is running.
// Returns an unsubscribe function (always safe to call).
export const addDailyQuestionTapListener = (onTap) => {
  let subscription = null;
  let cancelled = false;

  loadNotifications().then((N) => {
    if (!N || cancelled) return;
    try {
      subscription = N.addNotificationResponseReceivedListener((response) => {
        if (isDailyQuestionResponse(response)) onTap(response);
      });
    } catch (e) { log('addDailyQuestionTapListener', e); }
  });

  return () => {
    cancelled = true;
    try { if (subscription) subscription.remove(); } catch (e) { log('removeTapListener', e); }
  };
};

// Cold start: the app was launched *by* the notification, so no listener was
// mounted in time to see it.
export const getInitialDailyQuestionResponse = async () => {
  const N = await loadNotifications();
  if (!N || !N.getLastNotificationResponseAsync) return null;
  try {
    const response = await N.getLastNotificationResponseAsync();
    return isDailyQuestionResponse(response) ? response : null;
  } catch (e) { log('getInitialDailyQuestionResponse', e); return null; }
};

export const clearBadge = async () => {
  const N = await loadNotifications();
  try { if (N && N.setBadgeCountAsync) await N.setBadgeCountAsync(0); } catch (e) { log('clearBadge', e); }
};

// Debug helper — how many daily-question notifications are actually pending.
export const getPendingDailyQuestionCount = async () => {
  const N = await loadNotifications();
  if (!N) return 0;
  try {
    const scheduled = await N.getAllScheduledNotificationsAsync();
    return scheduled.filter((s) => String(s.identifier || '').startsWith(ID_PREFIX)).length;
  } catch (e) { log('getPendingDailyQuestionCount', e); return 0; }
};
