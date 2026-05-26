import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FoodLogItem, Meal, UserProfile } from '../types';

const keys = {
  profile: 'nutrifit.profile.v1',
  foodLog: 'nutrifit.foodLog.v1',
  lastPlan: 'nutrifit.lastPlan.v1',
};

export async function loadProfile() {
  return readJson<UserProfile>(keys.profile);
}

export async function saveProfile(profile: UserProfile) {
  await AsyncStorage.setItem(keys.profile, JSON.stringify(profile));
}

export async function clearProfile() {
  await AsyncStorage.removeItem(keys.profile);
}

export async function loadFoodLog() {
  const value = await readJson<{ date: string; items: FoodLogItem[] }>(keys.foodLog);
  const today = new Date().toISOString().slice(0, 10);
  return value?.date === today ? value.items : [];
}

export async function saveFoodLog(items: FoodLogItem[]) {
  await AsyncStorage.setItem(keys.foodLog, JSON.stringify({ date: new Date().toISOString().slice(0, 10), items }));
}

export async function loadLastPlan() {
  return readJson<Meal[]>(keys.lastPlan);
}

export async function saveLastPlan(meals: Meal[]) {
  await AsyncStorage.setItem(keys.lastPlan, JSON.stringify(meals));
}

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
