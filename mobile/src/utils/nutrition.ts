import type { FoodEstimate, FoodLogItem, Gender, Goal, Macros, Meal, UserProfile } from '../types';

export const DEFAULT_PROFILE: UserProfile = {
  gender: 'muz',
  goal: 'hubnutí',
  age: 30,
  height: 175,
  weight: 75,
  activityFactor: 1.375,
  likes: '',
  dislikes: '',
  diet: 'standardní',
  mealCount: 5,
};

export function calculateMacros(profile: Pick<UserProfile, 'gender' | 'goal' | 'age' | 'height' | 'weight' | 'activityFactor'>): Macros {
  const bmr = profile.gender === 'muz'
    ? 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5
    : 10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161;
  const tdee = Math.round(bmr * profile.activityFactor);
  const bmi = profile.weight / ((profile.height / 100) ** 2);
  const goal: Goal = bmi < 18.5 && profile.goal === 'hubnutí' ? 'udržení' : profile.goal;
  const kcal = goal === 'hubnutí' ? Math.round(tdee * 0.82) : goal === 'nabírání' ? Math.round(tdee * 1.12) : tdee;
  const protein = Math.round(profile.weight * 2);
  const fat = Math.round(kcal * 0.27 / 9);
  const carbs = Math.max(Math.round((kcal - protein * 4 - fat * 9) / 4), 0);
  const fiber = goal === 'hubnutí' ? Math.round(profile.weight * 0.42) : Math.round(profile.weight * 0.35);

  return { kcal, protein, carbs, fat, fiber, bmr: Math.round(bmr), tdee, bmi: Number(bmi.toFixed(1)) };
}

export function validateProfile(profile: UserProfile): string[] {
  const errors: string[] = [];
  if (profile.age < 18) errors.push('NutriFit je v mobilní verzi určený pro dospělé uživatele 18+.');
  if (profile.age > 100) errors.push('Zkontroluj věk.');
  if (profile.height < 100 || profile.height > 250) errors.push('Výška musí být mezi 100 a 250 cm.');
  if (profile.weight < 30 || profile.weight > 300) errors.push('Váha musí být mezi 30 a 300 kg.');
  return errors;
}

export function emptyTotals() {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
}

export function sumFoodLog(items: FoodLogItem[]) {
  return items.reduce((sum, item) => ({
    kcal: sum.kcal + safeNumber(item.kcal),
    protein: sum.protein + safeNumber(item.protein),
    carbs: sum.carbs + safeNumber(item.carbs),
    fat: sum.fat + safeNumber(item.fat),
  }), emptyTotals());
}

export function remainingMacros(macros: Macros, items: FoodLogItem[]) {
  const used = sumFoodLog(items);
  return {
    kcal: Math.max(macros.kcal - used.kcal, 0),
    protein: Math.max(macros.protein - used.protein, 0),
    carbs: Math.max(macros.carbs - used.carbs, 0),
    fat: Math.max(macros.fat - used.fat, 0),
  };
}

export function normalizeFoodEstimate(raw: Partial<FoodEstimate>): FoodEstimate {
  return {
    foodName: String(raw.foodName || 'Neznámé jídlo').slice(0, 80),
    portionGuess: String(raw.portionGuess || 'Orientační porce').slice(0, 120),
    kcal: clampInt(raw.kcal, 0, 3000),
    protein: clampInt(raw.protein, 0, 250),
    carbs: clampInt(raw.carbs, 0, 500),
    fat: clampInt(raw.fat, 0, 250),
    confidence: ['nízká', 'střední', 'vysoká'].includes(String(raw.confidence)) ? String(raw.confidence) : 'střední',
    note: String(raw.note || 'Jde o orientační odhad. Uprav hodnoty podle skutečné porce.').slice(0, 180),
  };
}

export function normalizeMeal(raw: Partial<Meal>, fallbackType: string): Meal {
  const protein = clampInt(raw.protein, 0, 250);
  const carbs = clampInt(raw.carbs, 0, 500);
  const fat = clampInt(raw.fat, 0, 250);
  return {
    mealType: String(raw.mealType || fallbackType),
    name: String(raw.name || 'Jídlo bez názvu'),
    kcal: clampInt(raw.kcal || protein * 4 + carbs * 4 + fat * 9, 0, 3000),
    protein,
    carbs,
    fat,
    fiber: clampInt(raw.fiber, 0, 80),
    prepTime: clampInt(raw.prepTime || 15, 1, 180),
    difficulty: String(raw.difficulty || 'Jednoduchá'),
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients.map(String) : [],
    steps: Array.isArray(raw.steps) ? raw.steps.map(String) : [],
  };
}

export function makeFoodLogItem(estimate: FoodEstimate, source: FoodLogItem['source']): FoodLogItem {
  return {
    id: `${source}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    source,
    ...estimate,
  };
}

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampInt(value: unknown, min: number, max: number) {
  const n = Math.round(safeNumber(value));
  return Math.max(min, Math.min(max, n));
}
