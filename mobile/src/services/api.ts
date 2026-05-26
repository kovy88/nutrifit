import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { buildMealPlanRequest } from '../utils/mealPrompts';
import { normalizeFoodEstimate, normalizeMeal } from '../utils/nutrition';
import type { FoodEstimate, Macros, Meal, UserProfile } from '../types';

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

export async function generateMealPlan(profile: UserProfile, macros: Macros): Promise<Meal[]> {
  const request = buildMealPlanRequest(profile, macros);
  const data = await postJson<any>('/api/generate', request);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = parseJson(text);
  const rawMeals = Array.isArray(parsed?.meals) ? parsed.meals : [];
  return request.mealNames.map((mealType, index) => normalizeMeal(rawMeals[index], mealType));
}

export async function analyzeFoodPhoto(uri: string, mimeType = 'image/jpeg'): Promise<FoodEstimate> {
  const imageBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const data = await postJson<any>('/api/analyze-food-photo', { imageBase64, mimeType });
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
