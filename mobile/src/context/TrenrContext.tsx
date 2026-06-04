import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import type {
  DailyAdjustment,
  FoodEstimate,
  FoodLogItem,
  Macros,
  Meal,
  TrainingSession,
  UserProfile,
  DailyPlanRecord,
  DailyFoodLogRecord,
  DailySessionRecord,
  TrainingCompletionRecord,
  TrainingCompletionRecordMap,
  TrainingCompletionStatus,
} from '../types';
import { adjustForDay, calculateMacros, DEFAULT_PROFILE, makeFoodLogItem, primaryGoalToNutritionKind, toDateKey } from '../utils/nutrition';
import { adjustedPlanSessionForDate } from '../lib/training';
import { getSubscriptionProvider, FALLBACK_PACKAGES, type SubscriptionPackage, type SubscriptionPlanId } from '../lib/subscription';
import { planWeeklyAdjustment } from '../lib/coaching/weeklyAdjustment';
import {
  clearProfile,
  loadConsent,
  loadProfile,
  saveConsent,
  saveProfile,
  loadPlansByDate,
  loadFoodLogsByDate,
  loadSessionsByDate,
  savePlanForDate,
  saveFoodLogForDate,
  saveSessionForDate,
  runMigration,
  loadWeights,
  saveWeightForDate,
  purgeAllLocalData,
  loadCheckIns,
  saveCheckIn,
  loadBaselineKcalDelta,
  saveBaselineKcalDelta,
  clearOnboardingDraft,
  loadTrainingCompletionsByDate,
  loadCoachThreadsByDate,
  loadDailyCoachHistory,
  loadDailyHealthSummaries,
  saveTrainingCompletionForDate,
  saveTrainingCompletionsByDate,
  saveCoachThreadsByDate,
  saveDailyCoachHistory,
  saveDailyHealthSummaries,
  loadSubscriptionStatus,
  saveSubscriptionStatus,
} from '../services/storage';
import type { PlanAdjustment, WeeklyCheckIn } from '../types/checkin';
import type { NutritionGoalKind } from '../types';
import { supabase } from '../services/supabase';
import { loadPendingSyncWrites, pullRemoteSnapshotFromSupabase, pushLocalSnapshotToSupabase, queuePendingSyncWrite } from '../services/sync';
import { syncStore } from '../stores/syncStore';

type AuthUser = {
  id: string;
  email?: string;
};

type TrenrContextValue = {
  isReady: boolean;
  profile: UserProfile | null;
  /** Profile-derived macros WITHOUT the selected day's training adjustment. */
  baselineMacros: Macros | null;
  /** baselineMacros adjusted for the selected day's session (the number the UI shows). */
  currentMacros: Macros | null;
  dailyAdjustment: DailyAdjustment | null;
  user: AuthUser | null;
  hasAiConsent: boolean;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  currentMeals: Meal[];
  currentFoodLog: FoodLogItem[];
  currentSession: TrainingSession | null;
  trainingCompletions: TrainingCompletionRecordMap;
  currentTrainingCompletion: TrainingCompletionRecord | null;
  weights: Record<string, number>;
  logWeight: (weight: number, date?: string) => Promise<void>;
  ensureAiConsent: () => Promise<boolean>;
  setProfile: (profile: UserProfile) => Promise<void>;
  setTodaySession: (session: TrainingSession) => Promise<void>;
  markTrainingCompletion: (
    status: TrainingCompletionStatus,
    details?: Partial<Pick<TrainingCompletionRecord, 'actualDurationMinutes' | 'actualDistanceKm' | 'rpe' | 'note' | 'pairedWorkoutId' | 'source'>>,
  ) => Promise<TrainingCompletionRecord>;
  resetLocalProfile: () => Promise<void>;
  purgeAllUserData: () => Promise<void>;
  // Weekly check-in history (chronological, oldest first)
  checkIns: WeeklyCheckIn[];
  /** Cumulative kcal delta from accepted weekly adjustments. */
  baselineKcalDelta: number;
  /** Override goal kind applied after a weekly check-in (e.g. fat_loss → maintenance). */
  overrideGoalKind: NutritionGoalKind | null;
  /** Submit a new check-in. Returns the computed adjustment so UI can prompt the user. */
  recordCheckIn: (checkIn: WeeklyCheckIn) => Promise<PlanAdjustment>;
  /** Apply an adjustment (updates baselineKcalDelta + overrideGoalKind, triggers macro re-calc). */
  applyAdjustment: (adjustment: PlanAdjustment) => Promise<void>;
  addFood: (estimate: FoodEstimate, source: FoodLogItem['source']) => Promise<void>;
  removeFood: (id: string) => Promise<void>;
  clearFood: () => Promise<void>;
  setMeals: (meals: Meal[]) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isSubscribed: boolean;
  setIsSubscribed: (status: boolean) => Promise<void>;
  purchaseSubscription: (planId: SubscriptionPlanId) => Promise<boolean>;
  restoreSubscription: () => Promise<boolean>;
  subscriptionPackages: SubscriptionPackage[];
};

const Context = createContext<TrenrContextValue | null>(null);

export function TrenrProvider({ children }: PropsWithChildren) {
  const [isReady, setIsReady] = useState(false);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  
  // Date based states
  const [selectedDate, setSelectedDate] = useState<string>(toDateKey(new Date()));
  const [plansByDate, setPlansByDate] = useState<DailyPlanRecord>({});
  const [foodLogsByDate, setFoodLogsByDate] = useState<DailyFoodLogRecord>({});
  const [sessionsByDate, setSessionsByDate] = useState<DailySessionRecord>({});
  const [trainingCompletionsByDate, setTrainingCompletionsByDate] = useState<TrainingCompletionRecordMap>({});
  const [weightsByDate, setWeightsByDate] = useState<Record<string, number>>({});
  
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hasAiConsent, setHasAiConsent] = useState(false);
  const [checkIns, setCheckIns] = useState<WeeklyCheckIn[]>([]);
  const [baselineKcalDelta, setBaselineKcalDelta] = useState(0);
  const [overrideGoalKind, setOverrideGoalKind] = useState<NutritionGoalKind | null>(null);
  const [isSubscribed, setIsSubscribedState] = useState(false);
  const [subscriptionPackages, setSubscriptionPackages] = useState<SubscriptionPackage[]>(FALLBACK_PACKAGES);

  useEffect(() => {
    let active = true;
    
    // Run storage migration on startup
    runMigration().then(() => {
      return Promise.all([
        loadProfile(),
        loadPlansByDate(),
        loadFoodLogsByDate(),
        loadSessionsByDate(),
        loadConsent(),
        supabase.auth.getUser(),
        loadWeights(),
        loadCheckIns(),
        loadBaselineKcalDelta(),
        loadTrainingCompletionsByDate(),
        loadSubscriptionStatus(),
      ]);
    }).then(([storedProfile, storedPlans, storedLogs, storedSessions, storedConsent, auth, storedWeights, storedCheckIns, storedDelta, storedCompletions, storedSubscription]) => {
      if (!active) return;
      setProfileState(storedProfile);
      setPlansByDate(storedPlans || {});
      setFoodLogsByDate(storedLogs || {});
      setSessionsByDate(storedSessions || {});
      setHasAiConsent(storedConsent);
      setUser(auth.data.user ? { id: auth.data.user.id, email: auth.data.user.email } : null);
      setWeightsByDate(storedWeights || {});
      setCheckIns(storedCheckIns || []);
      setBaselineKcalDelta(storedDelta || 0);
      setTrainingCompletionsByDate(storedCompletions || {});
      setIsSubscribedState(storedSubscription || false);
      setIsReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Configure billing + reconcile the real entitlement once auth resolves. The
  // Mock provider just reflects the stored flag; RevenueCat returns the live
  // store entitlement (and we cache it locally for offline).
  useEffect(() => {
    const provider = getSubscriptionProvider();
    void (async () => {
      try {
        await provider.configure(user?.id ?? null);
        const [status, packages] = await Promise.all([provider.getStatus(), provider.getOfferings()]);
        setIsSubscribedState(status.isActive);
        await saveSubscriptionStatus(status.isActive);
        if (packages.length) setSubscriptionPackages(packages);
      } catch {
        // keep the locally stored flag on any billing/offline error
      }
    })();
  }, [user?.id]);

  const baselineMacros = useMemo(
    () =>
      profile
        ? calculateMacros(profile, {
            baselineKcalDelta,
            overrideGoalKind: overrideGoalKind ?? undefined,
          })
        : null,
    [profile, baselineKcalDelta, overrideGoalKind],
  );

  // Derived current states for the selectedDate
  const currentMeals = useMemo(() => plansByDate[selectedDate] || [], [plansByDate, selectedDate]);
  const currentFoodLog = useMemo(() => foodLogsByDate[selectedDate] || [], [foodLogsByDate, selectedDate]);
  const currentTrainingCompletion = useMemo(
    () => trainingCompletionsByDate[selectedDate] || null,
    [trainingCompletionsByDate, selectedDate],
  );
  
  const currentSession = useMemo(() => {
    if (!profile) return null;
    return sessionsByDate[selectedDate] || adjustedPlanSessionForDate(profile, new Date(selectedDate), trainingCompletionsByDate);
  }, [sessionsByDate, selectedDate, profile, trainingCompletionsByDate]);

  const daily = useMemo(() => {
    if (!profile || !baselineMacros) return { macros: null, adjustment: null };
    const result = adjustForDay(baselineMacros, currentSession, profile);
    const isManual = !!sessionsByDate[selectedDate];
    return {
      macros: result.macros,
      adjustment: {
        ...result.adjustment,
        source: isManual ? 'manual_today_session' as const : 'profile_training_goal' as const,
      },
    };
  }, [baselineMacros, currentSession, profile, sessionsByDate, selectedDate]);

  const currentMacros = daily.macros;
  const dailyAdjustment = daily.adjustment;

  async function syncNow(overrides: Partial<{
    profile: UserProfile | null;
    plansByDate: DailyPlanRecord;
    foodLogsByDate: DailyFoodLogRecord;
    sessionsByDate: DailySessionRecord;
    weightsByDate: Record<string, number>;
    checkIns: WeeklyCheckIn[];
    trainingCompletionsByDate: TrainingCompletionRecordMap;
  }> = {}) {
    if (!user?.id) return;
    syncStore.setSyncing();
    try {
      const [storedCoachThreadsByDate, storedDailyCoachHistory, storedDailyHealthSummaries] = await Promise.all([
        loadCoachThreadsByDate(),
        loadDailyCoachHistory(),
        loadDailyHealthSummaries(),
      ]);
      await pushLocalSnapshotToSupabase({
        profile: overrides.profile ?? profile,
        plansByDate: overrides.plansByDate ?? plansByDate,
        foodLogsByDate: overrides.foodLogsByDate ?? foodLogsByDate,
        sessionsByDate: overrides.sessionsByDate ?? sessionsByDate,
        weightsByDate: overrides.weightsByDate ?? weightsByDate,
        checkIns: overrides.checkIns ?? checkIns,
        trainingCompletionsByDate: overrides.trainingCompletionsByDate ?? trainingCompletionsByDate,
        coachThreadsByDate: storedCoachThreadsByDate,
        dailyCoachHistory: storedDailyCoachHistory,
        dailyHealthSummaries: storedDailyHealthSummaries,
        baselineTargetsByDate: currentMacros ? { [selectedDate]: currentMacros } : {},
      }, user.id);
      syncStore.setPendingWrites(0);
      syncStore.setIdle(new Date().toISOString());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      syncStore.setError(message);
      await queuePendingSyncWrite({ entity: 'profile', payload: { reason: message } });
      syncStore.setPendingWrites((await loadPendingSyncWrites()).length);
    }
  }

  async function hydrateFromRemote() {
    if (!user?.id) return;
    const remote = await pullRemoteSnapshotFromSupabase(user.id);
    if (remote.profile && !profile) {
      await saveProfile(remote.profile);
      setProfileState(remote.profile);
    }
    if (remote.plansByDate) {
      const merged = { ...remote.plansByDate, ...plansByDate };
      setPlansByDate(merged);
      await Promise.all(Object.entries(merged).map(([date, meals]) => savePlanForDate(date, meals)));
    }
    if (remote.foodLogsByDate) {
      const merged = { ...remote.foodLogsByDate, ...foodLogsByDate };
      setFoodLogsByDate(merged);
      await Promise.all(Object.entries(merged).map(([date, items]) => saveFoodLogForDate(date, items)));
    }
    if (remote.weightsByDate) {
      const merged = { ...remote.weightsByDate, ...weightsByDate };
      setWeightsByDate(merged);
      await Promise.all(Object.entries(merged).map(([date, weight]) => saveWeightForDate(date, weight)));
    }
    if (remote.checkIns?.length) {
      const byWeek = new Map(remote.checkIns.map(checkIn => [checkIn.weekStartISO, checkIn]));
      checkIns.forEach(checkIn => byWeek.set(checkIn.weekStartISO, checkIn));
      const merged = Array.from(byWeek.values()).sort((a, b) => a.weekStartISO.localeCompare(b.weekStartISO));
      setCheckIns(merged);
      for (const checkIn of merged) await saveCheckIn(checkIn);
    }
    if (remote.trainingCompletionsByDate) {
      const merged = { ...remote.trainingCompletionsByDate, ...trainingCompletionsByDate };
      setTrainingCompletionsByDate(merged);
      await saveTrainingCompletionsByDate(merged);
    }
    if (remote.coachThreadsByDate) await saveCoachThreadsByDate(remote.coachThreadsByDate);
    if (remote.dailyCoachHistory) await saveDailyCoachHistory(remote.dailyCoachHistory);
    if (remote.dailyHealthSummaries) await saveDailyHealthSummaries(remote.dailyHealthSummaries);
  }

  useEffect(() => {
    if (!isReady || !user?.id) return;
    void hydrateFromRemote().finally(() => syncNow());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, user?.id]);

  async function persistProfile(next: UserProfile) {
    const normalized = {
      ...next,
      programStartISO: profile && profile.trainingGoal !== next.trainingGoal
        ? selectedDate
        : (next.programStartISO || profile?.programStartISO || selectedDate),
    };
    await saveProfile(normalized);
    setProfileState(normalized);
    void syncNow({ profile: normalized });
  }

  async function resetLocalProfile() {
    // Clear both the saved profile AND the onboarding draft so the next entry
    // starts on a clean step 0. Without this, "Spustit onboarding znovu"
    // hydrated the OLD draft and felt like nothing happened.
    await Promise.all([clearProfile(), clearOnboardingDraft()]);
    setProfileState(null);
  }

  /** Hard purge: clear all local data (profile, plans, logs, sessions, weights, consent)
   *  AND reset in-memory state. Used after server-side account deletion so the device
   *  doesn't keep stale data. */
  async function purgeAllUserData() {
    await purgeAllLocalData();
    setProfileState(null);
    setPlansByDate({});
    setFoodLogsByDate({});
    setSessionsByDate({});
    setWeightsByDate({});
    setTrainingCompletionsByDate({});
    setHasAiConsent(false);
    setCheckIns([]);
    setBaselineKcalDelta(0);
    setOverrideGoalKind(null);
    setIsSubscribedState(false);
  }

  async function updateSubscriptionStatus(status: boolean) {
    await saveSubscriptionStatus(status);
    setIsSubscribedState(status);
  }

  async function purchaseSubscription(planId: SubscriptionPlanId): Promise<boolean> {
    const status = await getSubscriptionProvider().purchase(planId);
    await saveSubscriptionStatus(status.isActive);
    setIsSubscribedState(status.isActive);
    return status.isActive;
  }

  async function restoreSubscription(): Promise<boolean> {
    const status = await getSubscriptionProvider().restore();
    await saveSubscriptionStatus(status.isActive);
    setIsSubscribedState(status.isActive);
    return status.isActive;
  }

  /** Persist a new weekly check-in and compute the suggested PlanAdjustment.
   *  Doesn't apply the adjustment automatically — UI shows it to user for review. */
  async function recordCheckIn(checkIn: WeeklyCheckIn): Promise<PlanAdjustment> {
    const next = await saveCheckIn(checkIn);
    setCheckIns(next);
    void syncNow({ checkIns: next });
    const goalKind = profile ? primaryGoalToNutritionKind(profile.primaryGoal) : 'maintenance';
    return planWeeklyAdjustment({ goalKind, recentCheckIns: next.slice(-4) });
  }

  /** Apply a PlanAdjustment: bump baseline kcal delta, set override goal if any.
   *  Triggers baselineMacros recalculation via state change. */
  async function applyAdjustment(adjustment: PlanAdjustment) {
    const nextDelta = baselineKcalDelta + adjustment.kcalDelta;
    setBaselineKcalDelta(nextDelta);
    await saveBaselineKcalDelta(nextDelta);
    if (adjustment.adjustedGoalKind) {
      setOverrideGoalKind(adjustment.adjustedGoalKind);
    }
  }

  async function addFood(estimate: FoodEstimate, source: FoodLogItem['source']) {
    const currentList = foodLogsByDate[selectedDate] || [];
    const next = [makeFoodLogItem(estimate, source), ...currentList];
    const nextFoodLogs = { ...foodLogsByDate, [selectedDate]: next };
    setFoodLogsByDate(nextFoodLogs);
    await saveFoodLogForDate(selectedDate, next);
    void syncNow({ foodLogsByDate: nextFoodLogs });
  }

  async function removeFood(id: string) {
    const currentList = foodLogsByDate[selectedDate] || [];
    const next = currentList.filter(item => item.id !== id);
    const nextFoodLogs = { ...foodLogsByDate, [selectedDate]: next };
    setFoodLogsByDate(nextFoodLogs);
    await saveFoodLogForDate(selectedDate, next);
    void syncNow({ foodLogsByDate: nextFoodLogs });
  }

  async function clearFood() {
    const nextFoodLogs = { ...foodLogsByDate, [selectedDate]: [] };
    setFoodLogsByDate(nextFoodLogs);
    await saveFoodLogForDate(selectedDate, []);
    void syncNow({ foodLogsByDate: nextFoodLogs });
  }

  async function persistMeals(next: Meal[]) {
    const nextPlans = { ...plansByDate, [selectedDate]: next };
    setPlansByDate(nextPlans);
    await savePlanForDate(selectedDate, next);
    void syncNow({ plansByDate: nextPlans });
  }

  async function persistTodaySession(session: TrainingSession) {
    const nextSessions = { ...sessionsByDate, [selectedDate]: session };
    setSessionsByDate(nextSessions);
    await saveSessionForDate(selectedDate, session);
    void syncNow({ sessionsByDate: nextSessions });
  }

  async function markTrainingCompletion(
    status: TrainingCompletionStatus,
    details: Partial<Pick<TrainingCompletionRecord, 'actualDurationMinutes' | 'actualDistanceKm' | 'rpe' | 'note' | 'pairedWorkoutId' | 'source'>> = {},
  ): Promise<TrainingCompletionRecord> {
    const now = new Date().toISOString();
    const existing = trainingCompletionsByDate[selectedDate];
    const record: TrainingCompletionRecord = {
      date: selectedDate,
      status,
      plannedSession: currentSession,
      actualDurationMinutes: details.actualDurationMinutes ?? currentSession?.durationMinutes ?? null,
      actualDistanceKm: details.actualDistanceKm ?? currentSession?.distanceKm ?? null,
      rpe: details.rpe ?? null,
      note: details.note,
      source: details.source ?? 'manual',
      pairedWorkoutId: details.pairedWorkoutId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = { ...trainingCompletionsByDate, [selectedDate]: record };
    setTrainingCompletionsByDate(next);
    await saveTrainingCompletionForDate(selectedDate, record);
    void syncNow({ trainingCompletionsByDate: next });
    return record;
  }

  async function logWeight(weight: number, date = selectedDate) {
    const next = { ...weightsByDate, [date]: weight };
    setWeightsByDate(next);
    await saveWeightForDate(date, weight);
    void syncNow({ weightsByDate: next });
    if (profile && date === selectedDate) {
      await persistProfile({ ...profile, weight });
    }
  }

  async function ensureAiConsent() {
    if (hasAiConsent) return true;
    const accepted = await new Promise<boolean>(resolve => {
      Alert.alert(
        'Než použiješ AI',
        'Trenr dává orientační doporučení, nenahrazuje lékařskou péči. Plány a fotky se kvůli AI zpracování posílají na server. Nepoužívej appku pro diagnózu ani léčbu.',
        [
          { text: 'Zrušit', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Rozumím', onPress: () => resolve(true) },
        ],
      );
    });
    if (!accepted) return false;
    await saveConsent();
    setHasAiConsent(true);
    return true;
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async function signUp(name: string, email: string, password: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) throw new Error(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <Context.Provider value={{
      isReady,
      profile: profile || null,
      baselineMacros,
      currentMacros,
      dailyAdjustment,
      user,
      hasAiConsent,
      selectedDate,
      setSelectedDate,
      currentMeals,
      currentFoodLog,
      currentSession,
      trainingCompletions: trainingCompletionsByDate,
      currentTrainingCompletion,
      weights: weightsByDate,
      logWeight,
      ensureAiConsent,
      setProfile: persistProfile,
      setTodaySession: persistTodaySession,
      markTrainingCompletion,
      resetLocalProfile,
      purgeAllUserData,
      checkIns,
      baselineKcalDelta,
      overrideGoalKind,
      recordCheckIn,
      applyAdjustment,
      addFood,
      removeFood,
      clearFood,
      setMeals: persistMeals,
      signIn,
      signUp,
      signOut,
      isSubscribed,
      setIsSubscribed: updateSubscriptionStatus,
      purchaseSubscription,
      restoreSubscription,
      subscriptionPackages,
    }}>
      {children}
    </Context.Provider>
  );
}

export function useTrenr() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useTrenr must be used inside TrenrProvider');
  return ctx;
}

export function useDefaultProfile() {
  return DEFAULT_PROFILE;
}
