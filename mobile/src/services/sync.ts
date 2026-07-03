import { supabase } from './supabase';
import type {
  DailyFoodLogRecord,
  DailyPlanRecord,
  DailySessionRecord,
  FoodLogItem,
  Macros,
  Meal,
  NutritionGoalKind,
  SyncConflict,
  TrainingCompletionRecordMap,
  UserProfile,
} from '../types';
import type { WeeklyCheckIn } from '../types/checkin';
import type { CoachThreadRecordMap, DailyCoachHistoryMap } from '../types/coach';
import type { HealthDataSummary } from '../types/health';

export type LocalSyncSnapshot = {
  profile: UserProfile | null;
  plansByDate: DailyPlanRecord;
  foodLogsByDate: DailyFoodLogRecord;
  sessionsByDate: DailySessionRecord;
  weightsByDate: Record<string, number>;
  checkIns: WeeklyCheckIn[];
  baselineTargetsByDate?: Record<string, Macros>;
  trainingCompletionsByDate?: TrainingCompletionRecordMap;
  coachThreadsByDate?: CoachThreadRecordMap;
  dailyCoachHistory?: DailyCoachHistoryMap;
  dailyHealthSummaries?: Record<string, HealthDataSummary>;
  /** Cumulative kcal delta from accepted weekly adjustments. Piggybacks on
   *  the `profiles` row (as extra JSON keys, not dedicated columns) since
   *  that table's schema isn't tracked in supabase/migrations/ here. */
  baselineKcalDelta?: number;
  overrideGoalKind?: NutritionGoalKind | null;
};

export type SyncRows = ReturnType<typeof buildSyncRows>;
export type RemoteSyncSnapshot = Partial<LocalSyncSnapshot>;

function nowISO() {
  return new Date().toISOString();
}

export function resolveByUpdatedAt<T extends { updatedAt?: string | null }>(
  entity: SyncConflict['entity'],
  key: string,
  local: T | null,
  remote: T | null,
): { value: T | null; conflict: SyncConflict<T> | null } {
  if (!local) return { value: remote, conflict: null };
  if (!remote) return { value: local, conflict: null };
  const localTime = local.updatedAt ? Date.parse(local.updatedAt) : 0;
  const remoteTime = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;
  const resolvedBy = localTime >= remoteTime ? 'local' : 'remote';
  return {
    value: resolvedBy === 'local' ? local : remote,
    conflict: {
      entity,
      key,
      localUpdatedAt: local.updatedAt ?? null,
      remoteUpdatedAt: remote.updatedAt ?? null,
      resolvedBy,
      local,
      remote,
    },
  };
}

export function buildSyncRows(snapshot: LocalSyncSnapshot, userId: string, timestamp = nowISO()) {
  const dailyMealPlans = Object.entries(snapshot.plansByDate).map(([date, meals]) => ({
    user_id: userId,
    plan_date: date,
    meals,
    total_kcal: sumMealKcal(meals),
    updated_at: timestamp,
  }));

  const dailyFoodLogs = Object.entries(snapshot.foodLogsByDate).flatMap(([date, items]) =>
    items.map(item => foodLogRow(userId, date, item, timestamp)),
  );

  const weightEntries = Object.entries(snapshot.weightsByDate).map(([date, weight]) => ({
    user_id: userId,
    entry_date: date,
    weight_kg: weight,
    source: 'manual',
    updated_at: timestamp,
  }));

  const weeklyCheckins = snapshot.checkIns.map(checkIn => ({
    user_id: userId,
    week_start_date: checkIn.weekStartISO,
    weight_kg: checkIn.weightKg ?? null,
    adherence: checkIn.adherence,
    energy_level: checkIn.energyLevel,
    hunger_level: checkIn.hungerLevel,
    soreness_level: checkIn.sorenessLevel,
    completed_sessions: checkIn.completedSessions ?? null,
    planned_sessions: checkIn.plannedSessions ?? null,
    notes: checkIn.notes ?? null,
    updated_at: timestamp,
  }));

  const trainingCompletions = Object.values(snapshot.trainingCompletionsByDate ?? {}).map(record => ({
    user_id: userId,
    completion_date: record.date,
    status: record.status,
    planned_session: record.plannedSession,
    actual_duration_minutes: record.actualDurationMinutes ?? null,
    actual_distance_km: record.actualDistanceKm ?? null,
    rpe: record.rpe ?? null,
    note: record.note ?? null,
    source: record.source,
    paired_workout_id: record.pairedWorkoutId ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }));

  const coachThreads = Object.values(snapshot.coachThreadsByDate ?? {}).map(thread => ({
    user_id: userId,
    thread_date: thread.date,
    messages: thread.messages,
    memory: thread.memory,
    created_at: thread.createdAt,
    updated_at: thread.updatedAt,
  }));

  const dailyCoachRecommendations = Object.values(snapshot.dailyCoachHistory ?? {}).map(day => ({
    user_id: userId,
    recommendation_date: day.date,
    recommendation: day.recommendation,
    memory: day.memory,
    created_at: day.createdAt,
    updated_at: day.updatedAt,
  }));

  const dailyHealthSummaries = Object.values(snapshot.dailyHealthSummaries ?? {}).map(day => ({
    user_id: userId,
    summary_date: day.date,
    activity: day.activity,
    sleep: day.sleep,
    resting_heart_rate: day.restingHeartRate,
    hrv: day.hrv,
    latest_weight: day.latestWeight,
    workouts: day.workouts,
    sources: day.sources,
    completeness: day.completeness,
    confidence: day.confidence,
    created_at: day.createdAt,
    updated_at: day.updatedAt,
  }));

  const profile = snapshot.profile
    ? [{
        user_id: userId,
        // `profile` is a jsonb blob — piggyback the weekly-adjustment state on
        // it under a `_sync` sub-key so it travels with the profile row
        // without needing dedicated columns on an untracked table schema.
        profile: {
          ...snapshot.profile,
          _sync: { baselineKcalDelta: snapshot.baselineKcalDelta ?? 0, overrideGoalKind: snapshot.overrideGoalKind ?? null },
        },
        updated_at: timestamp,
      }]
    : [];

  const dailyTargets = Object.entries(snapshot.baselineTargetsByDate ?? {}).map(([date, macros]) => ({
    user_id: userId,
    target_date: date,
    kcal: macros.kcal,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    fiber: macros.fiber,
    bmr: macros.bmr,
    tdee: macros.tdee,
    water_goal_ml: macros.waterMl,
    weight_kg: snapshot.profile?.weight ?? null,
    goal: macros.goal,
    updated_at: timestamp,
  }));

  return {
    profile,
    dailyMealPlans,
    dailyFoodLogs,
    dailyTargets,
    weightEntries,
    weeklyCheckins,
    trainingCompletions,
    coachThreads,
    dailyCoachRecommendations,
    dailyHealthSummaries,
  };
}

export async function pushLocalSnapshotToSupabase(snapshot: LocalSyncSnapshot, userId: string): Promise<void> {
  const rows = buildSyncRows(snapshot, userId);
  await upsertRows('profiles', rows.profile, 'user_id');
  await upsertRows('daily_meal_plans', rows.dailyMealPlans, 'user_id,plan_date');
  await upsertRows('daily_food_logs', rows.dailyFoodLogs, 'user_id,client_id');
  await upsertRows('daily_targets', rows.dailyTargets, 'user_id,target_date');
  await upsertRows('weight_entries', rows.weightEntries, 'user_id,entry_date');
  await upsertRows('weekly_checkins', rows.weeklyCheckins, 'user_id,week_start_date');
  await upsertRows('training_completions', rows.trainingCompletions, 'user_id,completion_date');
  await upsertRows('coach_threads', rows.coachThreads, 'user_id,thread_date');
  await upsertRows('daily_coach_recommendations', rows.dailyCoachRecommendations, 'user_id,recommendation_date');
  await upsertRows('daily_health_summaries', rows.dailyHealthSummaries, 'user_id,summary_date');
}

export async function pullRemoteSnapshotFromSupabase(userId: string): Promise<RemoteSyncSnapshot> {
  const [
    profileRes,
    plansRes,
    logsRes,
    weightsRes,
    checkInsRes,
    completionsRes,
    coachThreadsRes,
    coachHistoryRes,
    healthSummariesRes,
  ] = await Promise.all([
    supabase.from('profiles').select('profile').eq('user_id', userId).maybeSingle(),
    supabase.from('daily_meal_plans').select('plan_date,meals').eq('user_id', userId),
    supabase.from('daily_food_logs').select('client_id,log_date,source,food_name,planned_meal_id,portion_guess,kcal,protein,carbs,fat,confidence,note,eaten_at').eq('user_id', userId),
    supabase.from('weight_entries').select('entry_date,weight_kg').eq('user_id', userId),
    supabase.from('weekly_checkins').select('week_start_date,weight_kg,adherence,energy_level,hunger_level,soreness_level,completed_sessions,planned_sessions,notes,created_at').eq('user_id', userId),
    supabase.from('training_completions').select('completion_date,status,planned_session,actual_duration_minutes,actual_distance_km,rpe,note,source,paired_workout_id,created_at,updated_at').eq('user_id', userId),
    supabase.from('coach_threads').select('thread_date,messages,memory,created_at,updated_at').eq('user_id', userId),
    supabase.from('daily_coach_recommendations').select('recommendation_date,recommendation,memory,created_at,updated_at').eq('user_id', userId),
    supabase.from('daily_health_summaries').select('summary_date,activity,sleep,resting_heart_rate,hrv,latest_weight,workouts,sources,completeness,confidence,created_at,updated_at').eq('user_id', userId),
  ]);

  const firstError = [profileRes, plansRes, logsRes, weightsRes, checkInsRes, completionsRes, coachThreadsRes, coachHistoryRes, healthSummariesRes]
    .find(res => res.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const remoteProfileRaw = (profileRes.data as any)?.profile ?? null;
  const { _sync, ...remoteProfile } = remoteProfileRaw ?? { _sync: undefined };

  return {
    profile: remoteProfileRaw ? (remoteProfile as UserProfile) : null,
    baselineKcalDelta: _sync?.baselineKcalDelta,
    overrideGoalKind: _sync?.overrideGoalKind,
    plansByDate: Object.fromEntries(((plansRes.data as any[]) ?? []).map(row => [row.plan_date, row.meals ?? []])),
    foodLogsByDate: groupFoodLogs((logsRes.data as any[]) ?? []),
    weightsByDate: Object.fromEntries(((weightsRes.data as any[]) ?? []).map(row => [row.entry_date, Number(row.weight_kg)])),
    checkIns: ((checkInsRes.data as any[]) ?? []).map(row => ({
      weekStartISO: row.week_start_date,
      weightKg: row.weight_kg == null ? undefined : Number(row.weight_kg),
      adherence: Number(row.adherence ?? 0),
      energyLevel: row.energy_level ?? undefined,
      hungerLevel: row.hunger_level ?? undefined,
      sorenessLevel: row.soreness_level ?? undefined,
      completedSessions: row.completed_sessions ?? undefined,
      plannedSessions: row.planned_sessions ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at ?? nowISO(),
    })),
    trainingCompletionsByDate: Object.fromEntries(((completionsRes.data as any[]) ?? []).map(row => [row.completion_date, {
      date: row.completion_date,
      status: row.status,
      plannedSession: row.planned_session ?? null,
      actualDurationMinutes: row.actual_duration_minutes ?? null,
      actualDistanceKm: row.actual_distance_km == null ? null : Number(row.actual_distance_km),
      rpe: row.rpe ?? null,
      note: row.note ?? undefined,
      source: row.source ?? 'manual',
      pairedWorkoutId: row.paired_workout_id ?? null,
      createdAt: row.created_at ?? nowISO(),
      updatedAt: row.updated_at ?? nowISO(),
    }])),
    coachThreadsByDate: Object.fromEntries(((coachThreadsRes.data as any[]) ?? []).map(row => [row.thread_date, {
      date: row.thread_date,
      messages: row.messages ?? [],
      memory: row.memory ?? { goalSummary: 'general_fitness', updatedAt: nowISO() },
      createdAt: row.created_at ?? nowISO(),
      updatedAt: row.updated_at ?? nowISO(),
    }])),
    dailyCoachHistory: Object.fromEntries(((coachHistoryRes.data as any[]) ?? []).map(row => [row.recommendation_date, {
      date: row.recommendation_date,
      recommendation: row.recommendation,
      memory: row.memory ?? { goalSummary: 'general_fitness', updatedAt: nowISO() },
      createdAt: row.created_at ?? nowISO(),
      updatedAt: row.updated_at ?? nowISO(),
    }])),
    dailyHealthSummaries: Object.fromEntries(((healthSummariesRes.data as any[]) ?? []).map(row => [row.summary_date, {
      date: row.summary_date,
      activity: row.activity ?? null,
      sleep: row.sleep ?? null,
      restingHeartRate: row.resting_heart_rate ?? null,
      hrv: row.hrv ?? null,
      latestWeight: row.latest_weight ?? null,
      workouts: row.workouts ?? [],
      sources: row.sources ?? [],
      completeness: row.completeness ?? {
        activity: false,
        workouts: false,
        sleep: false,
        restingHeartRate: false,
        hrv: false,
        bodyWeight: false,
      },
      confidence: row.confidence ?? 'low',
      createdAt: row.created_at ?? nowISO(),
      updatedAt: row.updated_at ?? nowISO(),
    }])),
  };
}

async function upsertRows(table: string, rows: unknown[], onConflict: string): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(error.message);
}

function sumMealKcal(meals: Meal[]): number {
  return meals.reduce((sum, meal) => sum + (Number(meal.kcal) || 0), 0);
}

function foodLogRow(userId: string, date: string, item: FoodLogItem, updatedAt: string) {
  return {
    user_id: userId,
    client_id: item.id,
    log_date: date,
    source: item.source,
    food_name: item.foodName,
    planned_meal_id: item.plannedMealKey ?? null,
    portion_guess: item.portionGuess ?? null,
    kcal: item.kcal,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    confidence: item.confidence ?? null,
    note: item.note ?? null,
    eaten_at: item.createdAt,
    updated_at: updatedAt,
  };
}

function groupFoodLogs(rows: any[]): DailyFoodLogRecord {
  const out: DailyFoodLogRecord = {};
  for (const row of rows) {
    const date = row.log_date;
    if (!date) continue;
    const item: FoodLogItem = {
      id: row.client_id ?? `${date}-${row.eaten_at ?? Math.random()}`,
      createdAt: row.eaten_at ?? nowISO(),
      source: row.source ?? 'manual',
      foodName: row.food_name ?? 'Food',
      portionGuess: row.portion_guess ?? undefined,
      kcal: Number(row.kcal ?? 0),
      protein: Number(row.protein ?? 0),
      carbs: Number(row.carbs ?? 0),
      fat: Number(row.fat ?? 0),
      confidence: row.confidence ?? undefined,
      note: row.note ?? undefined,
      plannedMealKey: row.planned_meal_id ?? undefined,
    };
    out[date] = [...(out[date] ?? []), item];
  }
  return out;
}
