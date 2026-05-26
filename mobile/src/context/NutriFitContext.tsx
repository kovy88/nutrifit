import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import type { FoodEstimate, FoodLogItem, Macros, Meal, UserProfile } from '../types';
import { calculateMacros, DEFAULT_PROFILE, makeFoodLogItem } from '../utils/nutrition';
import { clearProfile, loadFoodLog, loadLastPlan, loadProfile, saveFoodLog, saveLastPlan, saveProfile } from '../services/storage';
import { supabase } from '../services/supabase';

type AuthUser = {
  id: string;
  email?: string;
};

type NutriFitContextValue = {
  isReady: boolean;
  profile: UserProfile | null;
  macros: Macros | null;
  foodLog: FoodLogItem[];
  meals: Meal[];
  user: AuthUser | null;
  setProfile: (profile: UserProfile) => Promise<void>;
  resetLocalProfile: () => Promise<void>;
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
  const [foodLog, setFoodLog] = useState<FoodLogItem[]>([]);
  const [meals, setMealsState] = useState<Meal[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadProfile(),
      loadFoodLog(),
      loadLastPlan(),
      supabase.auth.getUser(),
    ]).then(([storedProfile, storedFood, storedMeals, auth]) => {
      if (!active) return;
      setProfileState(storedProfile);
      setFoodLog(storedFood || []);
      setMealsState(storedMeals || []);
      setUser(auth.data.user ? { id: auth.data.user.id, email: auth.data.user.email } : null);
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

  const macros = useMemo(() => profile ? calculateMacros(profile) : null, [profile]);

  async function persistProfile(next: UserProfile) {
    await saveProfile(next);
    setProfileState(next);
  }

  async function resetLocalProfile() {
    await clearProfile();
    setProfileState(null);
  }

  async function addFood(estimate: FoodEstimate, source: FoodLogItem['source']) {
    const next = [makeFoodLogItem(estimate, source), ...foodLog];
    setFoodLog(next);
    await saveFoodLog(next);
  }

  async function removeFood(id: string) {
    const next = foodLog.filter(item => item.id !== id);
    setFoodLog(next);
    await saveFoodLog(next);
  }

  async function clearFood() {
    setFoodLog([]);
    await saveFoodLog([]);
  }

  async function persistMeals(next: Meal[]) {
    setMealsState(next);
    await saveLastPlan(next);
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
      foodLog,
      meals,
      user,
      setProfile: persistProfile,
      resetLocalProfile,
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
