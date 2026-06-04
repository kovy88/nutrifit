import type { UserProfile, Macros, TrainingSession, DailyAdjustment, NutritionGoalKind } from '../../types';
import type { CalculateMacrosOptions } from '../../utils/nutrition';
import {
  calculateMacros,
  adjustForDay,
  primaryGoalToNutritionKind
} from '../../utils/nutrition';
import { planWeeklyAdjustment, type WeeklyAdjustmentInput } from '../coaching/weeklyAdjustment';
import type { PlanAdjustment } from '../../types/checkin';
import { validateNutritionSafety as runSafetyCheck } from '../coaching/coach-safety-rules';
import type { Locale } from '../i18n';

// 1) calculateBmr()
export function calculateBmr(profile: UserProfile): number {
  const base = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age;
  return profile.gender === 'muz' ? base + 5 : base - 161;
}

// 2) calculateTdee()
export function calculateTdee(profile: UserProfile): number {
  const bmr = calculateBmr(profile);
  return Math.round(bmr * (profile.activityFactor ?? 1.375));
}

// 3) calculateCalorieTarget()
export function calculateCalorieTarget(profile: UserProfile, goal: NutritionGoalKind, tdee: number): number {
  const intensity = profile.planIntensity ?? 'moderate';
  const maxDeficitPct = intensity === 'easy' ? 0.15 : intensity === 'moderate' ? 0.2 : 0.25;
  let kcal = tdee;
  
  if (goal === 'fat_loss') {
    const safeWeeklyKg = profile.weight * 0.01;
    const intensityMultiplier = intensity === 'easy' ? 0.45 : intensity === 'moderate' ? 0.6 : 0.7;
    const dailyDeficit = Math.round((safeWeeklyKg * intensityMultiplier * 7700) / 7);
    kcal = Math.max(tdee - dailyDeficit, Math.round(tdee * (1 - maxDeficitPct)));
  } else if (goal === 'muscle_gain') {
    kcal = Math.round(tdee * (intensity === 'easy' ? 1.06 : intensity === 'moderate' ? 1.1 : 1.12));
  } else if (goal === 'endurance') {
    kcal = Math.round(tdee * (intensity === 'easy' ? 1.03 : intensity === 'moderate' ? 1.05 : 1.08));
  }

  const floor = profile.gender === 'muz' ? 1500 : 1200;
  return Math.max(kcal, floor);
}

// 4) calculateMacroTargets()
export function calculateMacroTargets(profile: UserProfile, options?: CalculateMacrosOptions): Macros {
  return calculateMacros(profile, options);
}

// 5) adjustMacrosForTrainingDay()
export function adjustMacrosForTrainingDay(
  baseline: Macros,
  session: TrainingSession,
  weight: number
): { macros: Macros; adjustment: DailyAdjustment } {
  // Enforce training day logic (non-rest)
  const nonRestSession = { ...session };
  if (nonRestSession.kind === 'rest') {
    nonRestSession.kind = 'easy_run'; // fallback to simple training category for math safety
  }
  return adjustForDay(baseline, nonRestSession, { weight });
}

// 6) adjustMacrosForRestDay()
export function adjustMacrosForRestDay(baseline: Macros): { macros: Macros; adjustment: DailyAdjustment } {
  return adjustForDay(baseline, null, { weight: 70 }); // weight doesn't affect rest day calculations
}

// 7) adjustForLongRunDay()
export function adjustForLongRunDay(
  baseline: Macros,
  session: TrainingSession,
  weight: number
): { macros: Macros; adjustment: DailyAdjustment } {
  const longRunSession: TrainingSession = {
    ...session,
    kind: 'long_run',
  };
  return adjustForDay(baseline, longRunSession, { weight });
}

// 8) adjustPlanFromWeeklyCheckIn()
export function adjustPlanFromWeeklyCheckIn(input: WeeklyAdjustmentInput): PlanAdjustment {
  return planWeeklyAdjustment(input);
}

// 9) validateNutritionSafety()
export function validateNutritionSafety(
  profile: UserProfile,
  goalKind: NutritionGoalKind,
  targetKcal: number,
  protein?: number,
  fat?: number,
  locale: Locale = 'cs'
): string[] {
  // If macro numbers aren't provided, compute them using the target kcal
  const testProtein = protein ?? Math.round(profile.weight * 1.6);
  const testFat = fat ?? Math.round(profile.weight * 0.8);
  return runSafetyCheck(profile, goalKind, targetKcal, testProtein, testFat, locale);
}
