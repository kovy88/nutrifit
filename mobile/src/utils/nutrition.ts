import type {
  DailyAdjustment,
  ExperienceLevel,
  FoodEstimate,
  FoodLogItem,
  Gender,
  Macros,
  Meal,
  MealPlanValidationResult,
  LegacyPrimaryGoal,
  NutritionGoalKind,
  NutritionMode,
  PrimaryGoal,
  TrainingGoalKind,
  TrainingSession,
  UserProfile,
  ShoppingListGroup,
} from '../types';
import { resolveCoachScope, scopeHasNutrition } from '../types';

const SAFETY = {
  MIN_KCAL_FEMALE: 1200,
  MIN_KCAL_MALE: 1500,
  MAX_DEFICIT_PCT: 0.25,
  MAX_WEEKLY_LOSS_KG_PER_KG: 0.01,
};

export const DEFAULT_PROFILE: UserProfile = {
  gender: 'muz',
  primaryGoal: 'lose_fat',
  trainingGoal: 'general_fitness',
  sessionsPerWeek: 3,
  experience: 'beginner',
  age: 30,
  height: 175,
  weight: 75,
  activityFactor: 1.375,
  likes: '',
  dislikes: '',
  diet: 'standardní',
  mealCount: 5,
  nutritionMode: 'balanced',
  planIntensity: 'moderate',
  coachScope: 'both',
};

/** Human-readable Czech label for a primary goal, used for UI display. */
export function primaryGoalLabel(goal: PrimaryGoal): string {
  switch (goal) {
    case 'lose_fat':           return 'Hubnutí tuku';
    case 'maintain_weight':    return 'Udržení váhy';
    case 'gain_muscle':        return 'Nabírání svalů';
    case 'improve_fitness':    return 'Zlepšit kondici';
    case 'improve_running':    return 'Zlepšit běh';
    case 'improve_recovery':   return 'Zlepšit regeneraci';
    case 'build_consistency':  return 'Budovat konzistenci';
  }
}

export type CalculateMacrosOptions = {
  /** Cumulative kcal delta from weekly check-ins (e.g. -150 if hubnutí stagnates).
   *  Applied AFTER safety floors so we never drop below MIN_KCAL_*. */
  baselineKcalDelta?: number;
  /** Override the goal kind derived from primaryGoal — used when weekly check-in
   *  auto-switched fat_loss → maintenance due to chronic low energy. */
  overrideGoalKind?: NutritionGoalKind;
};

export function calculateMacros(
  profile: Pick<UserProfile, 'gender' | 'primaryGoal' | 'age' | 'height' | 'weight' | 'activityFactor' | 'nutritionMode' | 'planIntensity'>,
  options: CalculateMacrosOptions = {},
): Macros {
  const bmr = calcBMR(profile);
  const tdee = Math.round(bmr * profile.activityFactor);
  const bmi = profile.weight / ((profile.height / 100) ** 2);
  const intendedGoal = options.overrideGoalKind ?? primaryGoalToNutritionKind(profile.primaryGoal);
  const safety = assessProfileSafety(profile, { kind: intendedGoal });
  const goal = safety.adjustedGoalKind || intendedGoal;
  // Apply weekly-adjustment delta to the calorie target. Safety floor is re-applied
  // so cumulative negative deltas can't push below 1200/1500 kcal.
  const targetWithDelta = calcCalorieTarget(profile, goal, tdee) + (options.baselineKcalDelta ?? 0);
  const floor = profile.gender === 'muz' ? 1500 : 1200;
  const kcal = Math.max(targetWithDelta, floor);
  const protein = Math.round(profile.weight * proteinPerKg(goal, profile.nutritionMode));
  const fatPct = fatPctForMode(profile.nutritionMode, goal);
  const fat = Math.round(Math.max((kcal * fatPct) / 9, profile.weight * 0.6));
  const carbs = Math.max(Math.round((kcal - protein * 4 - fat * 9) / 4), 0);
  const fiber = Math.round((kcal / 1000) * 14);
  const waterMl = calcWaterMl(profile.weight, profile.activityFactor);

  return { kcal, protein, carbs, fat, fiber, waterMl, bmr: Math.round(bmr), tdee, bmi: Number(bmi.toFixed(1)), goal };
}

export function assessProfileSafety(profile: Pick<UserProfile, 'age' | 'height' | 'weight'>, goal: { kind: NutritionGoalKind }) {
  const bmi = profile.weight / ((profile.height / 100) ** 2);
  if (profile.age < 16) {
    return { allowed: false, level: 'blocked' as const, bmi, code: 'age_under_16', message: 'Trenr není určený pro děti a dospívající pod 16 let.' };
  }
  if (bmi < 16) {
    return { allowed: false, level: 'blocked' as const, bmi, code: 'bmi_under_16', message: 'Při BMI pod 16 automatický jídelníček nevygenerujeme. Doporučujeme odbornou konzultaci.' };
  }
  if (bmi > 40) {
    return { allowed: false, level: 'blocked' as const, bmi, code: 'bmi_over_40', message: 'Při BMI nad 40 je bezpečnější postupovat s odborníkem.' };
  }
  if (bmi < 18.5 && goal.kind === 'fat_loss') {
    return { allowed: true, level: 'warning' as const, bmi, code: 'underweight_fat_loss', adjustedGoalKind: 'maintenance' as const, message: 'Cíl jsme přepnuli na udržení váhy, protože hubnutí při podváze nedoporučujeme.' };
  }
  return { allowed: true, level: 'ok' as const, bmi };
}

export function adjustForDay(baseline: Macros, session: TrainingSession | null, profile: Pick<UserProfile, 'weight'>): { macros: Macros; adjustment: DailyAdjustment } {
  if (!session || session.kind === 'rest' || session.intensity === 'rest') {
    const carbs = Math.max(0, Math.round(baseline.carbs * 0.9));
    const movedKcal = (baseline.carbs - carbs) * 4;
    const fat = Math.round(baseline.fat + movedKcal / 9);
    return {
      macros: { ...baseline, carbs, fat },
      adjustment: {
        note: 'Volný den — méně sacharidů, více tuků.',
        kcalDelta: 0,
        carbsDelta: carbs - baseline.carbs,
        fatDelta: fat - baseline.fat,
        proteinDelta: 0,
        source: session ? 'manual_today_session' : 'profile_training_goal',
      },
    };
  }

  const burn = estimateSessionKcal(session, profile.weight);
  const isHardDay = session.intensity === 'hard' || ['long_run', 'tempo', 'intervals', 'race'].includes(session.kind);
  const preFuel = isHardDay ? Math.round(profile.weight) : 0;
  const refuel = Math.round((burn * 0.6) / 4);
  const addCarbs = preFuel + refuel;
  const macros = { ...baseline, kcal: baseline.kcal + addCarbs * 4, carbs: baseline.carbs + addCarbs };
  return {
    macros,
    adjustment: {
      note: session.kind === 'long_run'
        ? `Long run — pre-fuel +${preFuel} g a refuel +${refuel} g sacharidů.`
        : isHardDay
          ? `Náročný trénink (${session.title}) — předtréninkové sacharidy +${preFuel} g a doplnění +${refuel} g.`
          : `Tréninkový den (${session.title}) — přidáno ${addCarbs} g sacharidů.`,
      kcalDelta: macros.kcal - baseline.kcal,
      carbsDelta: macros.carbs - baseline.carbs,
      fatDelta: 0,
      proteinDelta: 0,
      source: 'manual_today_session',
    },
  };
}

/**
 * @deprecated Static day-of-week planner. The app now uses the progressive,
 * safety-aware planner in `lib/training` (`planSessionForDate`). Kept only so
 * the legacy unit tests in `__tests__/nutrition.test.ts` keep passing during
 * the transition; remove once those are migrated.
 */
export function buildTrainingSessionForDate(profile: Pick<UserProfile, 'trainingGoal' | 'sessionsPerWeek'>, date = new Date()): TrainingSession {
  const dateISO = toDateKey(date);
  const day = date.getDay() || 7;
  const running = ['run_5k', 'run_10k', 'half_marathon', 'marathon'].includes(profile.trainingGoal);
  if (running) {
    if (day === 2) return session(dateISO, 'intervals', 'Intervaly / tempo', 45, 'hard');
    if (day === 4) return session(dateISO, 'easy_run', 'Lehký běh', 40, 'easy');
    if (day === 6) return session(dateISO, 'long_run', 'Long run', 90, 'moderate');
    if (profile.sessionsPerWeek >= 4 && day === 1) return session(dateISO, 'easy_run', 'Lehký běh', 35, 'easy');
    return session(dateISO, 'rest', 'Volno', 0, 'rest');
  }
  if (profile.trainingGoal === 'strength_basics') {
    if ([1, 3, 5].includes(day)) return session(dateISO, 'strength', 'Silový trénink', 45, 'moderate');
    return session(dateISO, 'rest', 'Volno', 0, 'rest');
  }
  if (profile.trainingGoal === 'hyrox' || profile.trainingGoal === 'ocr') {
    if ([2, 5].includes(day)) return session(dateISO, 'functional', 'Funkční trénink', 50, 'hard');
    if (day === 6) return session(dateISO, 'long_run', 'Vytrvalostní běh', 75, 'moderate');
    return session(dateISO, 'rest', 'Volno', 0, 'rest');
  }
  return [1, 3, 5].includes(day)
    ? session(dateISO, 'strength', 'Kondiční trénink', 40, 'moderate')
    : session(dateISO, 'rest', 'Volno', 0, 'rest');
}

export function migrateProfile(raw: (Partial<Omit<UserProfile, 'primaryGoal'>> & { primaryGoal?: PrimaryGoal | LegacyPrimaryGoal | string; goal?: string }) | null | undefined): UserProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  // legacy v1 profiles carried `goal: 'hubnutí'|'udržení'|'nabírání'`; map to primaryGoal
  const legacyPrimary = raw.goal ? legacyGoalStringToPrimary(raw.goal) : undefined;
  const { goal: _legacy, ...rest } = raw;
  const primaryGoal = normalizePrimaryGoal(raw.primaryGoal) || legacyPrimary || DEFAULT_PROFILE.primaryGoal;
  return {
    ...DEFAULT_PROFILE,
    ...rest,
    primaryGoal,
    trainingGoal: raw.trainingGoal || 'general_fitness',
    sessionsPerWeek: raw.sessionsPerWeek || sessionsFromActivityFactor(raw.activityFactor || DEFAULT_PROFILE.activityFactor),
    experience: raw.experience || 'beginner',
  };
}

export function validateProfile(profile: UserProfile): string[] {
  const errors: string[] = [];
  // Body metrics + the calorie-safety gate are only required when nutrition is in
  // scope (BMR/macros need them). A training-only coach skips these entirely.
  if (scopeHasNutrition(resolveCoachScope(profile))) {
    const safety = assessProfileSafety(profile, { kind: primaryGoalToNutritionKind(profile.primaryGoal) });
    if (!safety.allowed && safety.message) errors.push(safety.message);
    if (profile.age > 100) errors.push('Zkontroluj věk.');
    if (profile.height < 100 || profile.height > 250) errors.push('Výška musí být mezi 100 a 250 cm.');
    if (profile.weight < 30 || profile.weight > 300) errors.push('Váha musí být mezi 30 a 300 kg.');
  }
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
    plannedMealKey: raw.plannedMealKey ? String(raw.plannedMealKey).slice(0, 160) : undefined,
  };
}

export function normalizeMeal(raw: Partial<Meal> = {}, fallbackType: string): Meal {
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

export function validateMealPlan(meals: Meal[], macros: Macros, expectedMealCount: number): MealPlanValidationResult {
  const errors: string[] = [];
  const totals = meals.reduce((sum, meal) => ({
    kcal: sum.kcal + safeNumber(meal.kcal),
    protein: sum.protein + safeNumber(meal.protein),
    carbs: sum.carbs + safeNumber(meal.carbs),
    fat: sum.fat + safeNumber(meal.fat),
  }), emptyTotals());

  if (!Array.isArray(meals) || meals.length !== expectedMealCount) {
    errors.push(`AI vrátila ${meals.length} jídel místo ${expectedMealCount}.`);
  }

  meals.forEach((meal, index) => {
    const label = meal.mealType || `Jídlo ${index + 1}`;
    if (!meal.name || meal.name === 'Jídlo bez názvu') errors.push(`${label}: chybí název.`);
    if (!isPositiveFinite(meal.kcal) || !isPositiveFinite(meal.protein) || !isPositiveFinite(meal.carbs) || !isPositiveFinite(meal.fat)) {
      errors.push(`${label}: makra nejsou kompletní.`);
    }
    if (!Array.isArray(meal.ingredients) || meal.ingredients.filter(Boolean).length === 0) {
      errors.push(`${label}: chybí suroviny.`);
    }
    if (!Array.isArray(meal.steps) || meal.steps.filter(Boolean).length === 0) {
      errors.push(`${label}: chybí postup.`);
    }
    // Per-meal internal macro consistency: kcal ≈ p*4 + c*4 + f*9 (±15 kcal)
    const expectedKcal = safeNumber(meal.protein) * 4 + safeNumber(meal.carbs) * 4 + safeNumber(meal.fat) * 9;
    if (isPositiveFinite(meal.kcal) && Math.abs(safeNumber(meal.kcal) - expectedKcal) > 15) {
      errors.push(`${label}: kcal ${meal.kcal} neodpovídá makrům (${Math.round(expectedKcal)} z B/S/T).`);
    }
  });

  // Daily kcal tolerance: 7% (was 30% — AI was free to invent ±600 kcal)
  const tolerance = Math.max(100, Math.round(macros.kcal * 0.07));
  if (Math.abs(totals.kcal - macros.kcal) > tolerance) {
    errors.push(`Denní kalorie nesedí na cíl (${totals.kcal} vs. ${macros.kcal} kcal, povolená odchylka ±${tolerance}).`);
  }

  return { valid: errors.length === 0, errors, totals };
}

export function mealToFoodEstimate(meal: Meal): FoodEstimate {
  return normalizeFoodEstimate({
    foodName: meal.name,
    portionGuess: meal.mealType,
    kcal: meal.kcal,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    confidence: 'vysoká',
    note: 'Zapsáno z vygenerovaného jídelníčku.',
    plannedMealKey: plannedMealKey(meal),
  });
}

export function plannedMealKey(meal: Pick<Meal, 'mealType' | 'name'>) {
  return `${meal.mealType.trim().toLowerCase()}::${meal.name.trim().toLowerCase()}`;
}

export function buildShoppingList(meals: Meal[]): ShoppingListGroup[] {
  const groups = new Map<string, Map<string, string>>();
  meals.flatMap(meal => meal.ingredients || []).forEach(ingredient => {
    const item = String(ingredient).trim();
    if (!item) return;
    const category = categorizeIngredient(item);
    const key = item.toLocaleLowerCase('cs-CZ');
    if (!groups.has(category)) groups.set(category, new Map());
    groups.get(category)?.set(key, item);
  });

  return SHOPPING_CATEGORIES
    .map(category => ({
      category,
      items: Array.from(groups.get(category)?.values() || []).sort((a, b) => a.localeCompare(b, 'cs-CZ')),
    }))
    .filter(group => group.items.length > 0);
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

function isPositiveFinite(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

const SHOPPING_CATEGORIES = [
  'Ovoce a zelenina',
  'Mléčné a vejce',
  'Maso a ryby',
  'Přílohy a obiloviny',
  'Luštěniny',
  'Tuky, ořechy a semínka',
  'Ostatní',
];

function categorizeIngredient(ingredient: string) {
  const text = ingredient.toLocaleLowerCase('cs-CZ');
  if (/(jabl|banán|banan|avok|rajč|rajc|paprik|okurk|salát|salat|špenát|spenat|brokolic|mrkev|cibul|česnek|cesnek|ovoce|zelenin|brambor)/.test(text)) return 'Ovoce a zelenina';
  if (/(jogurt|tvaroh|mlék|mlek|sýr|syr|vejce|kefír|kefir|skyr|mozzarella|cottage)/.test(text)) return 'Mléčné a vejce';
  if (/(kuř|kur|hověz|hovez|krůt|krut|losos|tuňák|tunak|tresk|šunka|sunka|maso|ryb|tofu|tempeh)/.test(text)) return 'Maso a ryby';
  if (/(rýž|ryz|těst|test|oves|vločky|vlocky|pečiv|peciv|chléb|chleb|tortill|kuskus|bulgur|quinoa|mouka)/.test(text)) return 'Přílohy a obiloviny';
  if (/(čočk|cock|fazole|cizr|hrách|hrach|luštěn)/.test(text)) return 'Luštěniny';
  if (/(olej|ořech|orech|mandl|kešu|kesu|semín|semin|máslo|maslo|tahini|arašíd|arasid)/.test(text)) return 'Tuky, ořechy a semínka';
  return 'Ostatní';
}

function clampInt(value: unknown, min: number, max: number) {
  const n = Math.round(safeNumber(value));
  return Math.max(min, Math.min(max, n));
}

function calcBMR(profile: Pick<UserProfile, 'gender' | 'age' | 'height' | 'weight'>) {
  const base = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age;
  return profile.gender === 'muz' ? base + 5 : base - 161;
}

function calcCalorieTarget(profile: Pick<UserProfile, 'gender' | 'weight' | 'planIntensity'>, goal: NutritionGoalKind, tdee: number) {
  const intensity = profile.planIntensity ?? 'moderate';
  const maxDeficitPct = intensity === 'easy' ? 0.15 : intensity === 'moderate' ? 0.2 : SAFETY.MAX_DEFICIT_PCT;
  let kcal = tdee;
  if (goal === 'fat_loss') {
    const safeWeeklyKg = profile.weight * SAFETY.MAX_WEEKLY_LOSS_KG_PER_KG;
    const intensityMultiplier = intensity === 'easy' ? 0.45 : intensity === 'moderate' ? 0.6 : 0.7;
    const dailyDeficit = Math.round((safeWeeklyKg * intensityMultiplier * 7700) / 7);
    kcal = Math.max(tdee - dailyDeficit, Math.round(tdee * (1 - maxDeficitPct)));
  } else if (goal === 'muscle_gain') {
    kcal = Math.round(tdee * (intensity === 'easy' ? 1.06 : intensity === 'moderate' ? 1.1 : 1.12));
  } else if (goal === 'endurance') {
    kcal = Math.round(tdee * (intensity === 'easy' ? 1.03 : intensity === 'moderate' ? 1.05 : 1.08));
  }
  const floor = profile.gender === 'muz' ? SAFETY.MIN_KCAL_MALE : SAFETY.MIN_KCAL_FEMALE;
  return Math.max(kcal, floor);
}

function proteinPerKg(goal: NutritionGoalKind, mode: UserProfile['nutritionMode'] = 'balanced') {
  const base = ({ fat_loss: 2.2, muscle_gain: 2.0, maintenance: 1.6, endurance: 1.6, general_fitness: 1.4 }[goal]);
  if (mode === 'fat_loss_friendly') return Math.min(Math.max(base, 2.2), 2.4);
  if (mode === 'muscle_gain_friendly') return Math.min(Math.max(base, 2.0) + 0.1, 2.4);
  if (mode === 'high_protein') return Math.min(base + 0.25, 2.4);
  if (mode === 'endurance_fueling' && goal === 'endurance') return 1.7;
  return base;
}

function fatPctForMode(mode: NutritionMode | undefined, goal: NutritionGoalKind): number {
  if (mode === 'endurance_fueling') return 0.23;
  if (mode === 'high_protein' || mode === 'fat_loss_friendly') return 0.25;
  if (mode === 'muscle_gain_friendly' && goal === 'muscle_gain') return 0.26;
  return 0.27;
}

function calcWaterMl(weight: number, activityFactor: number) {
  const bonus = activityFactor >= 1.725 ? 1000 : activityFactor >= 1.55 ? 500 : 0;
  return Math.round(weight * 35 + bonus);
}

/** Migrates legacy v1 Czech goal strings to PrimaryGoal. */
function legacyGoalStringToPrimary(goal: string): PrimaryGoal {
  return (
    ({ hubnutí: 'lose_fat', udržení: 'maintain_weight', nabírání: 'gain_muscle' } as Record<string, PrimaryGoal>)[goal] ||
    'maintain_weight'
  );
}

export function normalizePrimaryGoal(goal: PrimaryGoal | LegacyPrimaryGoal | string | null | undefined): PrimaryGoal | undefined {
  if (!goal) return undefined;
  const map: Record<string, PrimaryGoal> = {
    lose_fat: 'lose_fat',
    maintain_weight: 'maintain_weight',
    gain_muscle: 'gain_muscle',
    improve_fitness: 'improve_fitness',
    improve_running: 'improve_running',
    improve_recovery: 'build_consistency',
    build_consistency: 'build_consistency',
    lose_weight: 'lose_fat',
    get_fit: 'improve_fitness',
    run_race: 'improve_running',
    triathlon: 'improve_fitness',
    hyrox_ocr: 'improve_fitness',
    sport_conditioning: 'improve_fitness',
  };
  return map[String(goal)];
}

export function primaryGoalToNutritionKind(goal: PrimaryGoal | LegacyPrimaryGoal | string): NutritionGoalKind {
  const normalized = normalizePrimaryGoal(goal) ?? 'maintain_weight';
  if (normalized === 'lose_fat') return 'fat_loss';
  if (normalized === 'gain_muscle') return 'muscle_gain';
  if (normalized === 'improve_running') return 'endurance';
  if (normalized === 'improve_fitness') return 'general_fitness';
  return 'maintenance';
}

function sessionsFromActivityFactor(factor: number) {
  if (factor >= 1.725) return 6;
  if (factor >= 1.55) return 4;
  if (factor >= 1.375) return 3;
  return 1;
}

export function activityFactorForSessions(count: number): number {
  if (count >= 6) return 1.725;
  if (count >= 4) return 1.55;
  if (count >= 2) return 1.375;
  return 1.2;
}

export function estimateSessionKcal(session: TrainingSession, weight: number) {
  const met = {
    easy_run: 8, recovery_run: 6, recovery_walk: 3, tempo: 11, intervals: 12, long_run: 9,
    strength: 5, cross_training: 7, mobility: 3, rest: 0, race: 12,
    swim: 7, bike: 7, brick: 8, functional: 8,
  }[session.kind] || 6;
  return Math.round((met * weight * session.durationMinutes) / 60);
}

function session(date: string, kind: TrainingSession['kind'], title: string, durationMinutes: number, intensity: TrainingSession['intensity']): TrainingSession {
  return { date, kind, title, durationMinutes, intensity };
}

export function toDateKey(date: Date | string | number): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isToday(dateKey: string): boolean {
  return dateKey === toDateKey(new Date());
}

export function formatDateLabel(dateKey: string, locale: string = 'cs'): string {
  const today = toDateKey(new Date());
  
  const dToday = new Date();
  const dYesterday = new Date(dToday);
  dYesterday.setDate(dToday.getDate() - 1);
  const yesterday = toDateKey(dYesterday);
  
  const dTomorrow = new Date(dToday);
  dTomorrow.setDate(dToday.getDate() + 1);
  const tomorrow = toDateKey(dTomorrow);

  const en = locale === 'en';
  if (dateKey === today) return en ? 'Today' : 'Dnes';
  if (dateKey === yesterday) return en ? 'Yesterday' : 'Včera';
  if (dateKey === tomorrow) return en ? 'Tomorrow' : 'Zítra';

  const [year, month, day] = dateKey.split('-');
  return `${parseInt(day, 10)}. ${parseInt(month, 10)}. ${year}`;
}
