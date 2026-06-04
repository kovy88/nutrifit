import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { buildAllergenRepairRequest, buildMealPlanRequest, buildSingleMealRequest, namesForMealCount } from '../utils/mealPrompts';
import { normalizeFoodEstimate, normalizeMeal, validateMealPlan } from '../utils/nutrition';
import { parseAllergensFromFreeText, validateMealsAgainstAllergens } from '../lib/nutrition/allergens';
import { buildWeeklySummaryRequest, parseWeeklySummary, type WeeklySummary, type WeeklySummaryInput } from '../lib/ai/weeklySummary';
import { parseMealPlanResponse, parseWeeklySummarySafe, parseStructuredCoachReply } from '../lib/ai/schemas';
import { buildCoachChatRequest, type CoachChatContext } from '../lib/ai/coachChat';
import type { FoodEstimate, Macros, Meal, UserProfile, TrainingSession } from '../types';
import type { CoachMessage } from '../types/coach';
import type { CoachProposedAction } from '../types/coach';
import type { Locale } from '../lib/i18n';

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
      console.warn(`Trenr API: Request to ${path} failed. Retrying in ${delay}ms... Error:`, err);
      await new Promise<void>(resolve => { setTimeout(() => resolve(), delay); });
      return await postJsonWithRetry<T>(path, body, retries - 1, delay * 2);
    }
    throw err;
  }
}

export async function generateMealPlan(profile: UserProfile, macros: Macros, session?: TrainingSession | null): Promise<Meal[]> {
  // First attempt. If the result fails validation, we re-prompt ONCE with the
  // concrete errors fed back (self-correction) before surfacing a hard error —
  // a single bad generation no longer breaks the core flow.
  try {
    let meals = await requestAndNormalizeMealPlan(profile, macros, session);
    let validation = validateMealPlan(meals, macros, namesForMealCount(profile.mealCount).length);
    if (!validation.valid) {
      meals = await requestAndNormalizeMealPlan(profile, macros, session, validation.errors);
      validation = validateMealPlan(meals, macros, namesForMealCount(profile.mealCount).length);
    }
    if (validation.valid) {
      return await repairAllergenViolations(meals, profile, session);
    }
    console.warn('Trenr API: falling back to deterministic meal plan after invalid AI output:', validation.errors);
  } catch (err) {
    console.warn('Trenr API: falling back to deterministic meal plan after AI failure:', err);
  }
  return buildFallbackMealPlan(profile, macros);
}

/** One round-trip: build request (optionally with repair feedback), call the
 *  proxy, parse and normalize into the expected meal slots. */
async function requestAndNormalizeMealPlan(
  profile: UserProfile,
  macros: Macros,
  session?: TrainingSession | null,
  repairErrors?: string[],
): Promise<Meal[]> {
  const request = buildMealPlanRequest(profile, macros, session, repairErrors);
  const data = await postJsonWithRetry<any>('/api/generate', request);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = parseJson(text);
  // Zod structural validation first; fall back to the lenient extraction so a
  // slightly-off shape still gets normalized rather than hard-failing.
  const rawMeals = parseMealPlanResponse(parsed) ?? (Array.isArray(parsed?.meals) ? parsed.meals : []);
  return request.mealNames.map((mealType, index) => normalizeMeal(rawMeals[index] || {}, mealType));
}

/**
 * Post-validation safety net: if the AI returned a meal containing any of the
 * user's declared allergens (parsed from profile.dislikes), call Gemini once
 * per offending meal with an explicit denylist. If repair still trips the
 * detector, we throw — the user sees an error instead of an unsafe plan.
 */
async function repairAllergenViolations(
  meals: Meal[],
  profile: UserProfile,
  session?: TrainingSession | null,
): Promise<Meal[]> {
  const allergens = parseAllergensFromFreeText(profile.dislikes);
  if (!allergens.length) return meals;

  const initial = validateMealsAgainstAllergens(meals, allergens);
  if (initial.ok) return meals;

  const repaired = [...meals];
  for (const hit of initial.hits) {
    const otherMeals = repaired.filter((_, i) => i !== hit.mealIndex);
    const request = buildAllergenRepairRequest({
      profile,
      session,
      current: hit.meal,
      forbidden: hit.matched,
      otherMeals,
    });
    const data = await postJsonWithRetry<any>('/api/generate', request);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = parseJson(text);
    const raw = Array.isArray(parsed?.meals) ? parsed.meals[0] : parsed?.meal ?? parsed;
    repaired[hit.mealIndex] = normalizeMeal(raw || {}, hit.meal.mealType);
  }

  const post = validateMealsAgainstAllergens(repaired, allergens);
  if (!post.ok) {
    const stuckList = post.hits
      .map(h => `${h.meal.mealType}: ${h.matched.join(', ')}`)
      .join(' | ');
    throw new Error(
      `AI nedokázala vyhnout se tvým alergenům (${stuckList}). Zkus to znovu nebo uprav preference v profilu.`,
    );
  }
  return repaired;
}

function buildFallbackMealPlan(profile: UserProfile, macros: Macros): Meal[] {
  const names = namesForMealCount(profile.mealCount);
  const weights = mealWeights(names.length);
  const protein = splitMacro(macros.protein, weights);
  const carbs = splitMacro(macros.carbs, weights);
  const fat = splitMacro(macros.fat, weights);
  const fiber = splitMacro(macros.fiber, weights);

  return names.map((mealType, index) => {
    const kcal = protein[index] * 4 + carbs[index] * 4 + fat[index] * 9;
    return {
      mealType,
      name: `${mealType} - jednoduchý záložní talíř`,
      kcal,
      protein: protein[index],
      carbs: carbs[index],
      fat: fat[index],
      fiber: fiber[index],
      prepTime: 15,
      difficulty: 'Jednoduchá',
      ingredients: [
        `${protein[index]} g bílkovin z tolerovaného zdroje`,
        `${carbs[index]} g sacharidů z běžné přílohy`,
        `${fat[index]} g tuků z tolerovaného zdroje`,
      ],
      steps: [
        'Zvol suroviny, které máš ověřené a snášíš.',
        'Slož porci podle uvedených makro cílů a uprav gramáž v aplikaci podle reality.',
      ],
    };
  });
}

function mealWeights(count: number): number[] {
  if (count === 2) return [0.45, 0.55];
  if (count === 3) return [0.3, 0.4, 0.3];
  if (count === 4) return [0.25, 0.35, 0.15, 0.25];
  if (count === 6) return [0.2, 0.12, 0.28, 0.12, 0.2, 0.08];
  return [0.22, 0.12, 0.32, 0.12, 0.22];
}

function splitMacro(total: number, weights: number[]): number[] {
  let used = 0;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return Math.max(total - used, 0);
    const value = Math.max(Math.round(total * weight), 0);
    used += value;
    return value;
  });
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

/**
 * Generuje týdenní AI shrnutí. Vstup = pre-computed metrics (váha trend,
 * adherence, readiness counts, ACWR, strain, sleep, HRV, check-in). AI je
 * jen INTERPRETUJE — žádné counting/computing, tím eliminujeme halucinace.
 *
 * Returns null pokud AI vrátí non-parseable nebo invalid JSON.
 */
export async function generateWeeklySummary(input: WeeklySummaryInput): Promise<WeeklySummary> {
  const request = buildWeeklySummaryRequest(input);
  const data = await postJsonWithRetry<any>('/api/generate', request);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('AI nevrátila žádný text.');
  const parsed = parseJson(text);
  const summary = parseWeeklySummary(parsed) ?? parseWeeklySummarySafe(parsed);
  if (!summary) throw new Error('AI vrátila neplatný JSON pro týdenní shrnutí.');
  return summary;
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

/**
 * Coach chat / explainer. Posts the deterministic daily plan context + the user's
 * question to the AI proxy and validates the JSON reply with coachReplySchema.
 * Never throws — on any failure returns a deterministic, safe fallback reply.
 */
export async function askCoach(opts: {
  context: CoachChatContext;
  history: CoachMessage[];
  question: string;
  locale: Locale;
}): Promise<{ reply: string; followups: string[]; actions: CoachProposedAction[] }> {
  const request = buildCoachChatRequest(opts);
  try {
    const data = await postJsonWithRetry<any>('/api/generate', request);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = text ? parseStructuredCoachReply(parseJson(text)) : null;
    if (parsed) return parsed;
  } catch {
    // fall through to deterministic fallback
  }
  const fallback = opts.locale === 'en'
    ? "I couldn't reach the coach right now. Stick to today's plan: keep the recommended intensity and hit your protein target."
    : 'Kouče se teď nepodařilo spojit. Drž dnešní plán: dodrž doporučenou intenzitu a trefa cíl bílkovin.';
  return { reply: fallback, followups: [], actions: [] };
}

export async function callAiCoachProxy(request: { systemPrompt: string; prompt: string; maxTokens: number }): Promise<string> {
  const data = await postJsonWithRetry<any>('/api/generate', request);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('AI nevrátila žádný text.');
  return text;
}

function parseJson(text: string) {
  if (!text) throw new Error('AI nevrátila odpověď.');
  const cleaned = String(text).replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(cleaned);
}

