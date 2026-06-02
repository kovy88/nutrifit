import { describe, expect, it, vi } from 'vitest';
import { adjustForDay, assessProfileSafety, buildShoppingList, buildTrainingSessionForDate, calculateMacros, mealToFoodEstimate, migrateProfile, normalizeFoodEstimate, primaryGoalToNutritionKind, remainingMacros, sumFoodLog, validateMealPlan, validateProfile, toDateKey, isToday, formatDateLabel, activityFactorForSessions, estimateSessionKcal } from '../utils/nutrition';
import { DEFAULT_PROFILE } from '../utils/nutrition';
import { normalizeConsent } from '../services/storage';
import type { Meal } from '../types';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

describe('nutrition utilities', () => {
  it('calculates daily macros with sane totals', () => {
    const macros = calculateMacros(DEFAULT_PROFILE);
    expect(macros.kcal).toBeGreaterThan(1200);
    expect(macros.protein).toBe(165);
    expect(macros.carbs).toBeGreaterThanOrEqual(0);
    expect(macros.tdee).toBeGreaterThan(macros.bmr);
  });

  it('hard-blocks unsafe age and BMI cases', () => {
    expect(assessProfileSafety({ ...DEFAULT_PROFILE, age: 15 }, { kind: 'maintenance' }).allowed).toBe(false);
    expect(assessProfileSafety({ ...DEFAULT_PROFILE, height: 180, weight: 50 }, { kind: 'maintenance' }).allowed).toBe(false);
    expect(assessProfileSafety({ ...DEFAULT_PROFILE, height: 170, weight: 120 }, { kind: 'maintenance' }).allowed).toBe(false);
    expect(validateProfile({ ...DEFAULT_PROFILE, age: 15 }).join(' ')).toContain('pod 16');
  });

  it('switches underweight fat-loss to maintenance path', () => {
    const safety = assessProfileSafety({ ...DEFAULT_PROFILE, height: 180, weight: 58 }, { kind: 'fat_loss' });
    expect(safety.allowed).toBe(true);
    expect(safety.adjustedGoalKind).toBe('maintenance');
    expect(calculateMacros({ ...DEFAULT_PROFILE, height: 180, weight: 58 }).goal).toBe('maintenance');
  });

  it('sums and subtracts food log items', () => {
    const macros = calculateMacros(DEFAULT_PROFILE);
    const items = [{
      id: '1',
      createdAt: new Date().toISOString(),
      source: 'manual' as const,
      foodName: 'Jogurt',
      kcal: 200,
      protein: 20,
      carbs: 15,
      fat: 6,
    }];
    expect(sumFoodLog(items).kcal).toBe(200);
    expect(remainingMacros(macros, items).protein).toBe(macros.protein - 20);
  });

  it('normalizes AI food estimates', () => {
    const estimate = normalizeFoodEstimate({ foodName: '', kcal: 9999, confidence: 'maybe' });
    expect(estimate.foodName).toBe('Neznámé jídlo');
    expect(estimate.kcal).toBe(3000);
    expect(estimate.confidence).toBe('střední');
  });

  it('adjusts rest and long-run days', () => {
    const baseline = calculateMacros({ ...DEFAULT_PROFILE, primaryGoal: 'improve_running', trainingGoal: 'run_10k' } as any);
    const rest = adjustForDay(baseline, { date: '2026-05-27', kind: 'rest', title: 'Volno', durationMinutes: 0, intensity: 'rest' }, DEFAULT_PROFILE);
    expect(rest.macros.kcal).toBe(baseline.kcal);
    expect(rest.macros.carbs).toBeLessThan(baseline.carbs);

    const longRun = adjustForDay(baseline, { date: '2026-05-30', kind: 'long_run', title: 'Long run', durationMinutes: 90, intensity: 'moderate' }, DEFAULT_PROFILE);
    expect(longRun.macros.kcal).toBeGreaterThan(baseline.kcal);
    expect(longRun.macros.carbs).toBeGreaterThan(baseline.carbs);
  });

  it('builds a default training session from profile goal', () => {
    const saturday = new Date('2026-05-30T12:00:00');
    const session = buildTrainingSessionForDate({ ...DEFAULT_PROFILE, primaryGoal: 'improve_running', trainingGoal: 'run_10k', sessionsPerWeek: 4 } as any, saturday);
    expect(session.kind).toBe('long_run');
  });

  it('migrates v1 profile defaults to v2 mobile profile', () => {
    const migrated = migrateProfile({ goal: 'hubnutí', age: 36, height: 181, weight: 88, activityFactor: 1.55 });
    expect(migrated?.primaryGoal).toBe('lose_fat');
    expect(migrated?.trainingGoal).toBe('general_fitness');
    expect(migrated?.sessionsPerWeek).toBe(4);
  });

  it('maps new primary goals to deterministic nutrition kinds', () => {
    expect(primaryGoalToNutritionKind('lose_fat')).toBe('fat_loss');
    expect(primaryGoalToNutritionKind('improve_running')).toBe('endurance');
    expect(primaryGoalToNutritionKind('improve_fitness')).toBe('general_fitness');
    expect(primaryGoalToNutritionKind('improve_recovery')).toBe('maintenance');
    expect(primaryGoalToNutritionKind('build_consistency')).toBe('maintenance');
    expect(primaryGoalToNutritionKind('lose_weight')).toBe('fat_loss');
  });

  it('supports fat-loss and muscle-gain friendly nutrition modes', () => {
    const fatLoss = calculateMacros({ ...DEFAULT_PROFILE, nutritionMode: 'fat_loss_friendly' });
    const muscleGain = calculateMacros({ ...DEFAULT_PROFILE, primaryGoal: 'gain_muscle', nutritionMode: 'muscle_gain_friendly' });
    expect(fatLoss.protein).toBeGreaterThanOrEqual(calculateMacros(DEFAULT_PROFILE).protein);
    expect(muscleGain.goal).toBe('muscle_gain');
    expect(muscleGain.kcal).toBeGreaterThan(calculateMacros(DEFAULT_PROFILE).kcal);
  });

  it('validates complete meal plans', () => {
    const macros = { ...calculateMacros(DEFAULT_PROFILE), kcal: 1000 };
    const result = validateMealPlan(validMeals(), macros, 2);
    expect(result.valid).toBe(true);
    expect(result.totals.kcal).toBe(1020);
  });

  it('rejects missing meals and incomplete meal content', () => {
    const macros = calculateMacros(DEFAULT_PROFILE);
    const result = validateMealPlan([{ ...validMeals()[0], ingredients: [], steps: [] }], macros, 2);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('místo 2');
    expect(result.errors.join(' ')).toContain('chybí suroviny');
    expect(result.errors.join(' ')).toContain('chybí postup');
  });

  it('rejects non-positive macro values and extreme kcal mismatch', () => {
    const macros = { ...calculateMacros(DEFAULT_PROFILE), kcal: 2200 };
    const brokenMacros = validateMealPlan([{ ...validMeals()[0], kcal: 0, protein: 0 }], macros, 1);
    expect(brokenMacros.valid).toBe(false);
    expect(brokenMacros.errors.join(' ')).toContain('makra nejsou kompletní');

    const mismatch = validateMealPlan(validMeals().map(meal => ({ ...meal, kcal: 100 })), macros, 2);
    expect(mismatch.valid).toBe(false);
    expect(mismatch.errors.join(' ')).toContain('Denní kalorie nesedí');
  });

  it('converts planned meals to food estimates', () => {
    const estimate = mealToFoodEstimate(validMeals()[0]);
    expect(estimate.foodName).toBe('Jogurt s banánem');
    expect(estimate.kcal).toBe(480);
    expect(estimate.protein).toBe(34);
    expect(estimate.plannedMealKey).toContain('snídaně');
  });

  it('builds a grouped shopping list from meal ingredients', () => {
    const list = buildShoppingList(validMeals());
    expect(list.find(group => group.category === 'Mléčné a vejce')?.items.join(' ')).toContain('řecký jogurt');
    expect(list.find(group => group.category === 'Ovoce a zelenina')?.items.join(' ')).toContain('banán');
    expect(list.find(group => group.category === 'Přílohy a obiloviny')?.items.join(' ')).toContain('rýže');
  });

  it('defaults AI consent to false unless explicitly accepted', () => {
    expect(normalizeConsent(null)).toBe(false);
    expect(normalizeConsent({ accepted: false })).toBe(false);
    expect(normalizeConsent({ accepted: true })).toBe(true);
  });

  it('correctly identifies today', () => {
    const todayStr = toDateKey(new Date());
    expect(isToday(todayStr)).toBe(true);
    expect(isToday('2000-01-01')).toBe(false);
  });

  it('formats date labels correctly', () => {
    const todayStr = toDateKey(new Date());
    expect(formatDateLabel(todayStr)).toBe('Dnes');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatDateLabel(toDateKey(yesterday))).toBe('Včera');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(formatDateLabel(toDateKey(tomorrow))).toBe('Zítra');

    expect(formatDateLabel('2026-05-15')).toBe('15. 5. 2026');
  });

  it('correctly maps training session frequency to activity factors', () => {
    expect(activityFactorForSessions(0)).toBe(1.2);
    expect(activityFactorForSessions(1)).toBe(1.2);
    expect(activityFactorForSessions(2)).toBe(1.375);
    expect(activityFactorForSessions(3)).toBe(1.375);
    expect(activityFactorForSessions(4)).toBe(1.55);
    expect(activityFactorForSessions(5)).toBe(1.55);
    expect(activityFactorForSessions(6)).toBe(1.725);
    expect(activityFactorForSessions(7)).toBe(1.725);
  });

  it('estimates training session calories dynamically based on user weight', () => {
    const session = {
      date: '2026-05-27',
      kind: 'long_run' as const,
      title: 'Long Run',
      durationMinutes: 60,
      intensity: 'moderate' as const,
    };
    expect(estimateSessionKcal(session, 70)).toBe(630);
    expect(estimateSessionKcal(session, 100)).toBe(900);
    expect(estimateSessionKcal(session, 50)).toBe(450);

    const strengthSession = {
      date: '2026-05-27',
      kind: 'strength' as const,
      title: 'Strength Training',
      durationMinutes: 45,
      intensity: 'hard' as const,
    };
    expect(estimateSessionKcal(strengthSession, 80)).toBe(300);
  });
});

function validMeals(): Meal[] {
  return [
    {
      mealType: 'Snídaně',
      name: 'Jogurt s banánem',
      kcal: 480,
      protein: 34,
      carbs: 58,
      fat: 12,
      fiber: 9,
      prepTime: 8,
      difficulty: 'Jednoduchá',
      ingredients: ['250 g řecký jogurt', '1 banán', '40 g ovesné vločky'],
      steps: ['Vše dej do misky.', 'Promíchej a podávej.'],
    },
    {
      mealType: 'Oběd',
      name: 'Kuře s rýží',
      kcal: 540,
      protein: 42,
      carbs: 64,
      fat: 13,
      fiber: 6,
      prepTime: 25,
      difficulty: 'Střední',
      ingredients: ['150 g kuřecí prsa', '80 g rýže', '100 g rajčata'],
      steps: ['Uvař rýži.', 'Opeč kuře a podávej se zeleninou.'],
    },
  ];
}
