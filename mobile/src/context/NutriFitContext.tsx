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
} from '../types';
import { adjustForDay, buildTrainingSessionForDate, calculateMacros, DEFAULT_PROFILE, makeFoodLogItem, toDateKey } from '../utils/nutrition';
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
} from '../services/storage';
import { supabase } from '../services/supabase';

type AuthUser = {
  id: string;
  email?: string;
};

type NutriFitContextValue = {
  isReady: boolean;
  profile: UserProfile | null;
  macros: Macros | null;
  baselineMacros: Macros | null;
  todayMacros: Macros | null;
  todaySession: TrainingSession | null;
  dailyAdjustment: DailyAdjustment | null;
  foodLog: FoodLogItem[];
  meals: Meal[];
  user: AuthUser | null;
  hasAiConsent: boolean;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  currentMeals: Meal[];
  currentFoodLog: FoodLogItem[];
  currentSession: TrainingSession | null;
  weights: Record<string, number>;
  logWeight: (weight: number, date?: string) => Promise<void>;
  ensureAiConsent: () => Promise<boolean>;
  setProfile: (profile: UserProfile) => Promise<void>;
  setTodaySession: (session: TrainingSession) => Promise<void>;
  resetLocalProfile: () => Promise<void>;
  purgeAllUserData: () => Promise<void>;
  addFood: (estimate: FoodEstimate, source: FoodLogItem['source']) => Promise<void>;
  removeFood: (id: string) => Promise<void>;
  clearFood: () => Promise<void>;
  setMeals: (meals: Meal[]) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Context = createContext<NutriFitContextValue | null>(null);

export function NutriFitProvider({ children }: PropsWithChildren) {
  const [isReady, setIsReady] = useState(false);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  
  // Date based states
  const [selectedDate, setSelectedDate] = useState<string>(toDateKey(new Date()));
  const [plansByDate, setPlansByDate] = useState<DailyPlanRecord>({});
  const [foodLogsByDate, setFoodLogsByDate] = useState<DailyFoodLogRecord>({});
  const [sessionsByDate, setSessionsByDate] = useState<DailySessionRecord>({});
  const [weightsByDate, setWeightsByDate] = useState<Record<string, number>>({});
  
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hasAiConsent, setHasAiConsent] = useState(false);

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
      ]);
    }).then(([storedProfile, storedPlans, storedLogs, storedSessions, storedConsent, auth, storedWeights]) => {
      if (!active) return;
      setProfileState(storedProfile);
      setPlansByDate(storedPlans || {});
      setFoodLogsByDate(storedLogs || {});
      setSessionsByDate(storedSessions || {});
      setHasAiConsent(storedConsent);
      setUser(auth.data.user ? { id: auth.data.user.id, email: auth.data.user.email } : null);
      setWeightsByDate(storedWeights || {});
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

  const baselineMacros = useMemo(() => profile ? calculateMacros(profile) : null, [profile]);

  // Derived current states for the selectedDate
  const currentMeals = useMemo(() => plansByDate[selectedDate] || [], [plansByDate, selectedDate]);
  const currentFoodLog = useMemo(() => foodLogsByDate[selectedDate] || [], [foodLogsByDate, selectedDate]);
  
  const currentSession = useMemo(() => {
    if (!profile) return null;
    return sessionsByDate[selectedDate] || buildTrainingSessionForDate(profile, new Date(selectedDate));
  }, [sessionsByDate, selectedDate, profile]);

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

  const selectedDateMacros = daily.macros;
  
  // Public Aliases for backward compatibility
  const meals = currentMeals;
  const foodLog = currentFoodLog;
  const todaySession = currentSession;
  const todayMacros = selectedDateMacros;
  const macros = selectedDateMacros;
  const dailyAdjustment = daily.adjustment;

  async function persistProfile(next: UserProfile) {
    await saveProfile(next);
    setProfileState(next);
  }

  async function resetLocalProfile() {
    await clearProfile();
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
    setHasAiConsent(false);
  }

  async function addFood(estimate: FoodEstimate, source: FoodLogItem['source']) {
    const currentList = foodLogsByDate[selectedDate] || [];
    const next = [makeFoodLogItem(estimate, source), ...currentList];
    const nextFoodLogs = { ...foodLogsByDate, [selectedDate]: next };
    setFoodLogsByDate(nextFoodLogs);
    await saveFoodLogForDate(selectedDate, next);
  }

  async function removeFood(id: string) {
    const currentList = foodLogsByDate[selectedDate] || [];
    const next = currentList.filter(item => item.id !== id);
    const nextFoodLogs = { ...foodLogsByDate, [selectedDate]: next };
    setFoodLogsByDate(nextFoodLogs);
    await saveFoodLogForDate(selectedDate, next);
  }

  async function clearFood() {
    const nextFoodLogs = { ...foodLogsByDate, [selectedDate]: [] };
    setFoodLogsByDate(nextFoodLogs);
    await saveFoodLogForDate(selectedDate, []);
  }

  async function persistMeals(next: Meal[]) {
    const nextPlans = { ...plansByDate, [selectedDate]: next };
    setPlansByDate(nextPlans);
    await savePlanForDate(selectedDate, next);
  }

  async function persistTodaySession(session: TrainingSession) {
    const nextSessions = { ...sessionsByDate, [selectedDate]: session };
    setSessionsByDate(nextSessions);
    await saveSessionForDate(selectedDate, session);
  }

  async function logWeight(weight: number, date = selectedDate) {
    const next = { ...weightsByDate, [date]: weight };
    setWeightsByDate(next);
    await saveWeightForDate(date, weight);
    if (profile && date === selectedDate) {
      await persistProfile({ ...profile, weight });
    }
  }

  async function ensureAiConsent() {
    if (hasAiConsent) return true;
    const accepted = await new Promise<boolean>(resolve => {
      Alert.alert(
        'Než použiješ AI',
        'NutriFit dává orientační doporučení, nenahrazuje lékařskou péči. Plány a fotky se kvůli AI zpracování posílají na server. Nepoužívej appku pro diagnózu ani léčbu.',
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
      macros,
      baselineMacros,
      todayMacros,
      todaySession,
      dailyAdjustment,
      foodLog,
      meals,
      user,
      hasAiConsent,
      selectedDate,
      setSelectedDate,
      currentMeals,
      currentFoodLog,
      currentSession,
      weights: weightsByDate,
      logWeight,
      ensureAiConsent,
      setProfile: persistProfile,
      setTodaySession: persistTodaySession,
      resetLocalProfile,
      purgeAllUserData,
      addFood,
      removeFood,
      clearFood,
      setMeals: persistMeals,
      signIn,
      signUp,
      signOut,
    }}>
      {children}
    </Context.Provider>
  );
}

export function useNutriFit() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useNutriFit must be used inside NutriFitProvider');
  return ctx;
}

export function useDefaultProfile() {
  return DEFAULT_PROFILE;
}
