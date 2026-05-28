import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  FoodLogItem,
  Meal,
  TrainingSession,
  UserProfile,
  DateKey,
  DailyPlanRecord,
  DailyFoodLogRecord,
  DailySessionRecord,
} from '../types';
import { migrateProfile, toDateKey } from '../utils/nutrition';
import { ManualHealthDataProvider, AsyncStorageTokenStore, SecureOAuthTokenStore } from '../lib/health';
import { NoopNotificationScheduler } from '../lib/notifications';

const keys = {
  profile: 'nutrifit.profile.v2',
  legacyProfile: 'nutrifit.profile.v1',
  consent: 'nutrifit.consent.v1',
  // legacy keys for migration
  legacyFoodLog: 'nutrifit.foodLog.v1',
  legacyLastPlan: 'nutrifit.lastPlan.v1',
  legacyTodaySession: 'nutrifit.todaySession.v1',
  // new date-based keys
  plansByDate: 'nutrifit.plansByDate.v1',
  foodLogsByDate: 'nutrifit.foodLogsByDate.v1',
  sessionsByDate: 'nutrifit.sessionsByDate.v1',
  weightsByDate: 'nutrifit.weightsByDate.v1',
  checkIns: 'nutrifit.checkIns.v1',
  /** Aktuálně aplikované kcal úpravy z weekly adjustment. */
  baselineKcalDelta: 'nutrifit.baselineKcalDelta.v1',
  /** Rozpracovaný onboarding (step + draft profile + last-touched). */
  onboardingDraft: 'nutrifit.onboardingDraft.v1',
};

/** Storage retention: drop date-bound entries older than this many days. */
const RETENTION_DAYS = 90;

/** Returns all NutriFit AsyncStorage keys (used by account deletion). */
function allNutriFitKeys(): string[] {
  return Object.values(keys);
}

/** Removes all NutriFit data from the device. Used after account deletion.
 *  Includes core storage keys, every manual health record, every stored OAuth
 *  token (Strava, Whoop, etc.), AND every scheduled notification record so
 *  the device leaves no trace. */
export async function purgeAllLocalData(): Promise<void> {
  await Promise.all([
    AsyncStorage.multiRemove(allNutriFitKeys()),
    AsyncStorage.removeItem('nutrifit.briefing.schedule.v1'),
    ManualHealthDataProvider.purge(),
    AsyncStorageTokenStore.purge(),
    // SecureStore tokens (iOS Keychain / Android Keystore) — wipe these too
    // so account deletion leaves no trace at the system level either.
    SecureOAuthTokenStore.purge(),
    NoopNotificationScheduler.purge(),
  ]);
}

/** Drop date-bound entries older than RETENTION_DAYS to bound AsyncStorage growth. */
async function pruneDateBoundedStores(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffKey = toDateKey(cutoff);

  const filter = <T>(map: Record<string, T>): Record<string, T> => {
    const next: Record<string, T> = {};
    for (const [date, value] of Object.entries(map)) {
      if (date >= cutoffKey) next[date] = value;
    }
    return next;
  };

  const [plans, logs, sessions, weights] = await Promise.all([
    loadPlansByDate(),
    loadFoodLogsByDate(),
    loadSessionsByDate(),
    loadWeights(),
  ]);

  await Promise.all([
    AsyncStorage.setItem(keys.plansByDate, JSON.stringify(filter(plans))),
    AsyncStorage.setItem(keys.foodLogsByDate, JSON.stringify(filter(logs))),
    AsyncStorage.setItem(keys.sessionsByDate, JSON.stringify(filter(sessions))),
    AsyncStorage.setItem(keys.weightsByDate, JSON.stringify(filter(weights))),
  ]);
}

// Profile storage
export async function loadProfile() {
  const current = migrateProfile(await readJson<Partial<UserProfile>>(keys.profile));
  if (current) return current;
  const legacy = migrateProfile(await readJson<Partial<UserProfile>>(keys.legacyProfile));
  if (legacy) {
    await saveProfile(legacy);
    await AsyncStorage.removeItem(keys.legacyProfile);
  }
  return legacy;
}

export async function saveProfile(profile: UserProfile) {
  await AsyncStorage.setItem(keys.profile, JSON.stringify(profile));
}

export async function clearProfile() {
  await AsyncStorage.removeItem(keys.profile);
}

// AI Consent storage
export async function loadConsent() {
  return normalizeConsent(await readJson<{ accepted?: unknown }>(keys.consent));
}

export async function saveConsent() {
  await AsyncStorage.setItem(keys.consent, JSON.stringify({ accepted: true, acceptedAt: new Date().toISOString() }));
}

export function normalizeConsent(value: { accepted?: unknown } | null | undefined) {
  return value?.accepted === true;
}

// New Date-Based Storage Helpers

export async function loadPlansByDate(): Promise<DailyPlanRecord> {
  const data = await readJson<DailyPlanRecord>(keys.plansByDate);
  return data || {};
}

export async function savePlanForDate(date: DateKey, meals: Meal[]): Promise<void> {
  const all = await loadPlansByDate();
  all[date] = meals;
  await AsyncStorage.setItem(keys.plansByDate, JSON.stringify(all));
}

export async function loadFoodLogsByDate(): Promise<DailyFoodLogRecord> {
  const data = await readJson<DailyFoodLogRecord>(keys.foodLogsByDate);
  return data || {};
}

export async function saveFoodLogForDate(date: DateKey, items: FoodLogItem[]): Promise<void> {
  const all = await loadFoodLogsByDate();
  all[date] = items;
  await AsyncStorage.setItem(keys.foodLogsByDate, JSON.stringify(all));
}

export async function loadSessionsByDate(): Promise<DailySessionRecord> {
  const data = await readJson<DailySessionRecord>(keys.sessionsByDate);
  return data || {};
}

export async function saveSessionForDate(date: DateKey, session: TrainingSession): Promise<void> {
  const all = await loadSessionsByDate();
  all[date] = session;
  await AsyncStorage.setItem(keys.sessionsByDate, JSON.stringify(all));
}

export async function listStoredDates(): Promise<DateKey[]> {
  const [plans, logs] = await Promise.all([
    loadPlansByDate(),
    loadFoodLogsByDate(),
  ]);
  const dates = new Set([...Object.keys(plans), ...Object.keys(logs)]);
  return Array.from(dates).sort();
}

// Migration Helper
export async function runMigration(): Promise<void> {
  const today = toDateKey(new Date());

  // Migrate lastPlan
  const legacyPlan = await readJson<{ date: string; meals: Meal[] } | Meal[]>(keys.legacyLastPlan);
  if (legacyPlan) {
    const meals = Array.isArray(legacyPlan) ? legacyPlan : (legacyPlan.meals || []);
    if (meals.length > 0) {
      await savePlanForDate(today, meals);
    }
    await AsyncStorage.removeItem(keys.legacyLastPlan);
  }

  // Migrate foodLog
  const legacyFood = await readJson<{ date: string; items: FoodLogItem[] } | FoodLogItem[]>(keys.legacyFoodLog);
  if (legacyFood) {
    const items = Array.isArray(legacyFood) ? legacyFood : (legacyFood.items || []);
    if (items.length > 0) {
      await saveFoodLogForDate(today, items);
    }
    await AsyncStorage.removeItem(keys.legacyFoodLog);
  }

  // Migrate todaySession
  const legacySession = await readJson<{ date: string; session: TrainingSession } | TrainingSession>(keys.legacyTodaySession);
  if (legacySession) {
    const session = legacySession && typeof legacySession === 'object' && 'session' in legacySession
      ? (legacySession.session as TrainingSession)
      : (legacySession as TrainingSession);
    if (session) {
      await saveSessionForDate(today, session);
    }
    await AsyncStorage.removeItem(keys.legacyTodaySession);
  }

  // Bound storage growth: drop date-bound records older than RETENTION_DAYS.
  // Cheap on each startup; AsyncStorage size stays linear in retention window, not lifetime.
  await pruneDateBoundedStores();
}

// ── Weekly check-ins ─────────────────────────────────────────────────────────
import type { WeeklyCheckIn } from '../types/checkin';

export async function loadCheckIns(): Promise<WeeklyCheckIn[]> {
  return (await readJson<WeeklyCheckIn[]>(keys.checkIns)) || [];
}

export async function saveCheckIn(checkIn: WeeklyCheckIn): Promise<WeeklyCheckIn[]> {
  const all = await loadCheckIns();
  // De-dup by weekStartISO — re-submitting overwrites
  const next = all.filter(c => c.weekStartISO !== checkIn.weekStartISO).concat(checkIn);
  next.sort((a, b) => a.weekStartISO.localeCompare(b.weekStartISO));
  await AsyncStorage.setItem(keys.checkIns, JSON.stringify(next));
  return next;
}

/** Cumulative kcal delta applied to baseline from accepted weekly adjustments.
 *  Persisted so the next macro calculation can reflect last week's coaching. */
export async function loadBaselineKcalDelta(): Promise<number> {
  const raw = await readJson<{ value: number }>(keys.baselineKcalDelta);
  return raw?.value ?? 0;
}

export async function saveBaselineKcalDelta(value: number): Promise<void> {
  await AsyncStorage.setItem(keys.baselineKcalDelta, JSON.stringify({ value }));
}

// ── Onboarding draft ────────────────────────────────────────────────────────

export type OnboardingDraft = {
  step: number;
  draft: UserProfile;
  updatedAt: string;
};

export async function loadOnboardingDraft(): Promise<OnboardingDraft | null> {
  return readJson<OnboardingDraft>(keys.onboardingDraft);
}

export async function saveOnboardingDraft(value: OnboardingDraft): Promise<void> {
  await AsyncStorage.setItem(keys.onboardingDraft, JSON.stringify(value));
}

export async function clearOnboardingDraft(): Promise<void> {
  await AsyncStorage.removeItem(keys.onboardingDraft);
}

// Weight logs helpers
export async function loadWeights(): Promise<Record<DateKey, number>> {
  const data = await readJson<Record<DateKey, number>>(keys.weightsByDate);
  return data || {};
}

export async function saveWeightForDate(date: DateKey, weight: number): Promise<void> {
  const all = await loadWeights();
  all[date] = weight;
  await AsyncStorage.setItem(keys.weightsByDate, JSON.stringify(all));
}

// Private JSON Reader helper
async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
