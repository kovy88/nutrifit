import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { buildMealPlanRequest, buildSingleMealRequest } from '../utils/mealPrompts';
import { normalizeFoodEstimate, normalizeMeal, validateMealPlan } from '../utils/nutrition';
import type { FoodEstimate, Macros, Meal, UserProfile, TrainingSession } from '../types';

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://nutri-fit-omega.vercel.app';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || data.error || `Chyba serveru (${response.status})`);
  }
  return data as T;
}

// Retry wrapper with exponential backoff
async function postJsonWithRetry<T>(path: string, body: unknown, retries = 1, delay = 1000): Promise<T> {
  try {
    return await postJson<T>(path, body);
  } catch (err) {
    if (retries > 0) {
      console.warn(`NutriFit API: Request to ${path} failed. Retrying in ${delay}ms... Error:`, err);
      await new Promise<void>(resolve => { setTimeout(() => resolve(), delay); });
      return await postJsonWithRetry<T>(path, body, retries - 1, delay * 2);
    }
    throw err;
  }
}

export async function generateMealPlan(profile: UserProfile, macros: Macros, session?: TrainingSession | null): Promise<Meal[]> {
  const request = buildMealPlanRequest(profile, macros, session);
  const data = await postJsonWithRetry<any>('/api/generate', request);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = parseJson(text);
  const rawMeals = Array.isArray(parsed?.meals) ? parsed.meals : [];
  const meals = request.mealNames.map((mealType, index) => normalizeMeal(rawMeals[index] || {}, mealType));
  const validation = validateMealPlan(meals, macros, request.mealNames.length);
  if (!validation.valid) {
    throw new Error(`AI vrátila neúplný jídelníček. ${validation.errors.slice(0, 2).join(' ')}`);
  }
  return meals;
}

/**
 * Regenerate a single meal slot. AI returns ONE meal hitting the target macros
 * within ±10 % so daily totals don't drift. Throws if the response is out of
 * tolerance — caller should let user retry or keep the original.
 */
export async function regenerateMeal(opts: {
  profile: UserProfile;
  session?: TrainingSession | null;
  current: Meal;
  otherMeals?: Meal[];
}): Promise<Meal> {
  const request = buildSingleMealRequest(opts);
  const data = await postJsonWithRetry<any>('/api/generate', request);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = parseJson(text);
  // Some AI runs wrap the object in {"meals":[…]} or {"meal":{…}}; handle both.
  const rawMeal = Array.isArray(parsed?.meals) ? parsed.meals[0] : parsed?.meal ?? parsed;
  const meal = normalizeMeal(rawMeal || {}, opts.current.mealType);

  // Don't accept a near-duplicate of the rejected one.
  if (meal.name.trim().toLowerCase() === opts.current.name.trim().toLowerCase()) {
    throw new Error('AI vrátila stejné jídlo. Zkus to znovu nebo uprav preference.');
  }
  // Macro tolerance ±10 % per macro (or ±5 g floor for tiny values)
  const within = (actual: number, target: number) =>
    Math.abs(actual - target) <= Math.max(5, target * 0.1);
  if (!within(meal.kcal, opts.current.kcal)) {
    throw new Error(`AI vrátila ${meal.kcal} kcal místo ${opts.current.kcal} (mimo toleranci).`);
  }
  return meal;
}

export async function analyzeFoodPhoto(uri: string, mimeType = 'image/jpeg'): Promise<FoodEstimate> {
  const imageBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const data = await postJsonWithRetry<any>('/api/analyze-food-photo', { imageBase64, mimeType });
  if (data.estimate) return normalizeFoodEstimate(data.estimate);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return normalizeFoodEstimate(parseJson(text));
}

export async function exportAccountData() {
  const response = await fetch(`${apiBaseUrl}/api/export-data`, {
    headers: await authHeaders(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || 'Export dat se nepodařil.');
  return data;
}

export async function deleteAccount() {
  const response = await fetch(`${apiBaseUrl}/api/delete-account`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || 'Smazání účtu se nepodařilo.');
}

function parseJson(text: string) {
  if (!text) throw new Error('AI nevrátila odpověď.');
  const cleaned = String(text).replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(cleaned);
}
