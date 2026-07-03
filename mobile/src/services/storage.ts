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
  TrainingCompletionRecord,
  TrainingCompletionRecordMap,
  NutritionGoalKind,
} from '../types';
import type { TouchedOnboardingFields } from '../lib/onboarding/validation';
import type { CoachMessage, CoachMemory, CoachThreadRecord, CoachThreadRecordMap, DailyCoachHistoryMap, DailyCoachRecommendation } from '../types/coach';
import type { HealthDataSummary } from '../types/health';
import { migrateProfile, toDateKey } from '../utils/nutrition';
import { ManualHealthDataProvider, AsyncStorageTokenStore, SecureOAuthTokenStore } from '../lib/health';
import { NoopNotificationScheduler } from '../lib/notifications';
import type { WeeklyCheckIn } from '../types/checkin';

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
  trainingCompletionsByDate: 'nutrifit.trainingCompletionsByDate.v1',
  dailyCoachHistory: 'nutrifit.dailyCoachHistory.v1',
  dailyHealthSummaries: 'nutrifit.dailyHealthSummaries.v1',
  coachThreadsByDate: 'nutrifit.coachThreadsByDate.v1',
  /** Aktuálně aplikované kcal úpravy z weekly adjustment. */
  baselineKcalDelta: 'nutrifit.baselineKcalDelta.v1',
  /** Nutrition goal override z accepted weekly adjustment (přepíše profile.primaryGoal pro macro calc). */
  overrideGoalKind: 'nutrifit.overrideGoalKind.v1',
  /** Rozpracovaný onboarding (step + draft profile + last-touched). */
  onboardingDraft: 'nutrifit.onboardingDraft.v1',
  /** Marker so the one-time legacy migration runs once, not on every boot. */
  schemaVersion: 'nutrifit.schemaVersion.v1',
  isSubscribed: 'nutrifit.isSubscribed.v1',
  /** Free Coach teaser usage counter (lifetime) before the paywall kicks in. */
  coachTeaserUsed: 'nutrifit.coachTeaserUsed.v1',
};

/** Bump when a NEW one-time migration step is added to runMigration(). */
const CURRENT_SCHEMA_VERSION = 3;

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
    AsyncStorage.removeItem('nutrifit.preWorkoutReminder.settings.v1'),
    AsyncStorage.removeItem('nutrifit.postWorkoutReminder.settings.v1'),
    AsyncStorage.removeItem('nutrifit.weeklySummary.v1'),
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

  const [plans, logs, sessions, weights, completions, coachHistory, coachThreads, healthSummaries] = await Promise.all([
    loadPlansByDate(),
    loadFoodLogsByDate(),
    loadSessionsByDate(),
    loadWeights(),
    loadTrainingCompletionsByDate(),
    loadDailyCoachHistory(),
    loadCoachThreadsByDate(),
    loadDailyHealthSummaries(),
  ]);

  await Promise.all([
    AsyncStorage.setItem(keys.plansByDate, JSON.stringify(filter(plans))),
    AsyncStorage.setItem(keys.foodLogsByDate, JSON.stringify(filter(logs))),
    AsyncStorage.setItem(keys.sessionsByDate, JSON.stringify(filter(sessions))),
    AsyncStorage.setItem(keys.weightsByDate, JSON.stringify(filter(weights))),
    AsyncStorage.setItem(keys.trainingCompletionsByDate, JSON.stringify(filter(completions))),
    AsyncStorage.setItem(keys.dailyCoachHistory, JSON.stringify(filter(coachHistory))),
    AsyncStorage.setItem(keys.coachThreadsByDate, JSON.stringify(filter(coachThreads))),
    AsyncStorage.setItem(keys.dailyHealthSummaries, JSON.stringify(filter(healthSummaries))),
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

// Free Coach teaser — how many free coach replies have been used before the paywall.
export async function loadCoachTeaserUsed(): Promise<number> {
  const raw = await readJson<{ count?: unknown }>(keys.coachTeaserUsed);
  const n = Math.floor(Number(raw?.count));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function incrementCoachTeaserUsed(): Promise<number> {
  const next = (await loadCoachTeaserUsed()) + 1;
  await AsyncStorage.setItem(keys.coachTeaserUsed, JSON.stringify({ count: next }));
  return next;
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

export async function loadTrainingCompletionsByDate(): Promise<TrainingCompletionRecordMap> {
  const data = await readJson<TrainingCompletionRecordMap>(keys.trainingCompletionsByDate);
  return data || {};
}

export async function saveTrainingCompletionForDate(date: DateKey, record: TrainingCompletionRecord): Promise<void> {
  const all = await loadTrainingCompletionsByDate();
  all[date] = record;
  await AsyncStorage.setItem(keys.trainingCompletionsByDate, JSON.stringify(all));
}

export async function saveTrainingCompletionsByDate(records: TrainingCompletionRecordMap): Promise<void> {
  await AsyncStorage.setItem(keys.trainingCompletionsByDate, JSON.stringify(records));
}

export async function loadDailyCoachHistory(): Promise<DailyCoachHistoryMap> {
  const data = await readJson<DailyCoachHistoryMap>(keys.dailyCoachHistory);
  return data || {};
}

export async function saveDailyCoachRecommendationForDate(
  date: DateKey,
  recommendation: DailyCoachRecommendation,
  memory: CoachMemory,
): Promise<void> {
  const all = await loadDailyCoachHistory();
  const now = new Date().toISOString();
  const existing = all[date];
  all[date] = {
    date,
    recommendation,
    memory,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await AsyncStorage.setItem(keys.dailyCoachHistory, JSON.stringify(all));
}

export async function saveDailyCoachHistory(history: DailyCoachHistoryMap): Promise<void> {
  await AsyncStorage.setItem(keys.dailyCoachHistory, JSON.stringify(history));
}

export async function loadDailyHealthSummaries(): Promise<Record<DateKey, HealthDataSummary>> {
  const data = await readJson<Record<DateKey, HealthDataSummary>>(keys.dailyHealthSummaries);
  return data || {};
}

export async function saveDailyHealthSummaryForDate(date: DateKey, summary: HealthDataSummary): Promise<void> {
  const all = await loadDailyHealthSummaries();
  all[date] = summary;
  await AsyncStorage.setItem(keys.dailyHealthSummaries, JSON.stringify(all));
}

export async function saveDailyHealthSummaries(summaries: Record<DateKey, HealthDataSummary>): Promise<void> {
  await AsyncStorage.setItem(keys.dailyHealthSummaries, JSON.stringify(summaries));
}

export async function loadCoachThreadsByDate(): Promise<CoachThreadRecordMap> {
  const data = await readJson<CoachThreadRecordMap>(keys.coachThreadsByDate);
  return data || {};
}

export async function saveCoachThreadForDate(
  date: DateKey,
  messages: CoachMessage[],
  memory: CoachMemory,
): Promise<CoachThreadRecord> {
  const all = await loadCoachThreadsByDate();
  const now = new Date().toISOString();
  const existing = all[date];
  const bounded = messages.slice(-40);
  const next: CoachThreadRecord = {
    date,
    messages: bounded,
    memory,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  all[date] = next;
  await AsyncStorage.setItem(keys.coachThreadsByDate, JSON.stringify(all));
  return next;
}

export async function saveCoachThreadsByDate(threads: CoachThreadRecordMap): Promise<void> {
  await AsyncStorage.setItem(keys.coachThreadsByDate, JSON.stringify(threads));
}

export async function listStoredDates(): Promise<DateKey[]> {
  const [plans, logs] = await Promise.all([
    loadPlansByDate(),
    loadFoodLogsByDate(),
  ]);
  const [completions, coachHistory, coachThreads, healthSummaries] = await Promise.all([
    loadTrainingCompletionsByDate(),
    loadDailyCoachHistory(),
    loadCoachThreadsByDate(),
    loadDailyHealthSummaries(),
  ]);
  const dates = new Set([
    ...Object.keys(plans),
    ...Object.keys(logs),
    ...Object.keys(completions),
    ...Object.keys(coachHistory),
    ...Object.keys(coachThreads),
    ...Object.keys(healthSummaries),
  ]);
  return Array.from(dates).sort();
}

// Migration Helper
export async function runMigration(): Promise<void> {
  // The legacy-key migration (v1 single-plan/foodLog/session → date-keyed maps)
  // only needs to run ONCE. After it has run we record the schema version and
  // skip the three legacy readJson + removeItem round-trips on every cold start.
  const stored = await readJson<{ version?: number }>(keys.schemaVersion);
  if (!stored || (stored.version ?? 0) < CURRENT_SCHEMA_VERSION) {
    await migrateLegacyKeys();
    await migrateStoredProfileTaxonomy();
    await AsyncStorage.setItem(
      keys.schemaVersion,
      JSON.stringify({ version: CURRENT_SCHEMA_VERSION, migratedAt: new Date().toISOString() }),
    );
  }

  // Bound storage growth: drop date-bound records older than RETENTION_DAYS.
  // This is NOT a one-time migration — it runs every startup so AsyncStorage
  // size stays linear in the retention window, not lifetime.
  await pruneDateBoundedStores();
}

async function migrateStoredProfileTaxonomy(): Promise<void> {
  const currentRaw = await readJson<Partial<UserProfile> & { primaryGoal?: string; goal?: string }>(keys.profile);
  const current = migrateProfile(currentRaw);
  if (current) {
    await saveProfile(current);
  }

  const legacyRaw = await readJson<Partial<UserProfile> & { primaryGoal?: string; goal?: string }>(keys.legacyProfile);
  const legacy = migrateProfile(legacyRaw);
  if (!current && legacy) {
    await saveProfile(legacy);
    await AsyncStorage.removeItem(keys.legacyProfile);
  }
}

/** One-time migration from the v1 single-record keys to date-keyed maps. */
async function migrateLegacyKeys(): Promise<void> {
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
}

// ── Weekly check-ins ─────────────────────────────────────────────────────────
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

/** Nutrition goal override from an accepted weekly adjustment. Persisted so
 *  the override survives an app restart, same as baselineKcalDelta. */
export async function loadOverrideGoalKind(): Promise<NutritionGoalKind | null> {
  const raw = await readJson<{ value: NutritionGoalKind | null }>(keys.overrideGoalKind);
  return raw?.value ?? null;
}

export async function saveOverrideGoalKind(value: NutritionGoalKind | null): Promise<void> {
  await AsyncStorage.setItem(keys.overrideGoalKind, JSON.stringify({ value }));
}

// ── Onboarding draft ────────────────────────────────────────────────────────

export type OnboardingDraft = {
  step: number;
  draft: UserProfile;
  updatedAt: string;
  touchedFields?: TouchedOnboardingFields;
};

export async function loadOnboardingDraft(): Promise<OnboardingDraft | null> {
  const raw = await readJson<OnboardingDraft & { draft?: Partial<UserProfile> & { primaryGoal?: string; goal?: string } }>(keys.onboardingDraft);
  if (!raw?.draft) return null;
  const draft = migrateProfile(raw.draft);
  if (!draft) return null;
  return { ...raw, draft };
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

// Subscription Status helpers
export async function loadSubscriptionStatus(): Promise<boolean> {
  const raw = await readJson<{ value: boolean }>(keys.isSubscribed);
  return raw?.value === true;
}

export async function saveSubscriptionStatus(status: boolean): Promise<void> {
  await AsyncStorage.setItem(keys.isSubscribed, JSON.stringify({ value: status }));
}
