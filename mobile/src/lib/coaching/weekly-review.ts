import type { WeeklyCheckIn, PlanAdjustment } from '../../types/checkin';
import type { Locale } from '../i18n';
import type { TranslationKey } from '../i18n';
import type { NutritionGoalKind } from '../../types';
import { planWeeklyAdjustment, type WeeklyAdjustmentInput } from './weeklyAdjustment';

function L(locale: Locale, cs: string, en: string): string {
  return locale === 'en' ? en : cs;
}

export type WeeklyReviewInput = {
  completedSessions: number;
  plannedSessions: number;
  weights: number[]; // weights chronologically
  recentCheckIns: WeeklyCheckIn[];
  goalKind: NutritionGoalKind;
  locale?: Locale;
};

export type WeeklyReview = {
  trainingCompleted: string;
  weightTrend: string;
  hungerEnergy: string;
  adherence: string;
  recommendedChanges: string;
  kcalDelta: number;
  warnings: string[];
  adjustedGoalKind?: NutritionGoalKind;
};

export type WeeklyMiniReviewInput = {
  completedSessions: number;
  plannedSessions: number;
  readinessScores: number[];
  nutritionTargetDays: number;
  nutritionLoggedDays: number;
};

export type WeeklyMiniReview = {
  completedSessions: number;
  plannedSessions: number;
  trainingAdherencePct: number | null;
  averageReadiness: number | null;
  nutritionTargetDays: number;
  nutritionLoggedDays: number;
  nutritionAdherencePct: number | null;
  recommendationKey: TranslationKey;
};

export function generateWeeklyReview(input: WeeklyReviewInput): WeeklyReview {
  const loc = input.locale ?? 'en';
  const checkins = input.recentCheckIns ?? [];
  const latestCheckin = checkins[checkins.length - 1];

  // 1) Training completed message
  let trainingCompleted = '';
  if (input.plannedSessions > 0) {
    trainingCompleted = L(
      loc,
      `Dokončeno ${input.completedSessions} z ${input.plannedSessions} naplánovaných tréninků.`,
      `Completed ${input.completedSessions} out of ${input.plannedSessions} planned sessions.`
    );
  } else {
    trainingCompleted = L(
      loc,
      'Žádné tréninky nebyly naplánovány.',
      'No workouts were planned.'
    );
  }

  // 2) Weight trend message
  let weightTrend = '';
  let trendVal: number | null = null;
  if (input.weights.length >= 2) {
    const first = input.weights[0];
    const last = input.weights[input.weights.length - 1];
    const weeksSpanned = Math.max(1, input.weights.length - 1);
    trendVal = (last - first) / weeksSpanned;
    
    if (trendVal > 0.05) {
      weightTrend = L(
        loc,
        `Váha roste v průměru o ${trendVal.toFixed(2)} kg za týden.`,
        `Weight is increasing by an average of ${trendVal.toFixed(2)} kg/week.`
      );
    } else if (trendVal < -0.05) {
      weightTrend = L(
        loc,
        `Váha klesá v průměru o ${Math.abs(trendVal).toFixed(2)} kg za týden.`,
        `Weight is decreasing by an average of ${Math.abs(trendVal).toFixed(2)} kg/week.`
      );
    } else {
      weightTrend = L(
        loc,
        'Váha je stabilní (změna do 0.05 kg za týden).',
        'Weight is stable (change within 0.05 kg/week).'
      );
    }
  } else {
    weightTrend = L(
      loc,
      'Nemáme dostatek váhových vzorků pro výpočet trendu.',
      'Not enough weight logs to determine trend.'
    );
  }

  // 3) Hunger / Energy message
  let hungerEnergy = '';
  if (latestCheckin) {
    const energy = latestCheckin.energyLevel ?? 3;
    const hunger = latestCheckin.hungerLevel ?? 3;
    hungerEnergy = L(
      loc,
      `Energie: ${energy}/5, Hlad: ${hunger}/5.`,
      `Energy level: ${energy}/5, Hunger level: ${hunger}/5.`
    );
  } else {
    hungerEnergy = L(
      loc,
      'Chybí subjektivní údaje o energii a hladu.',
      'Missing subjective energy and hunger data.'
    );
  }

  // 4) Adherence message
  let adherence = '';
  if (latestCheckin && latestCheckin.adherence != null) {
    const pct = Math.round(latestCheckin.adherence * 100);
    adherence = L(
      loc,
      `Dodržování jídelníčku: ${pct} %.`,
      `Nutrition plan adherence: ${pct}%.`
    );
  } else {
    adherence = L(
      loc,
      'Chybí údaje o dodržování jídelníčku.',
      'Missing plan adherence data.'
    );
  }

  // Calculate deterministic adjustments
  const adjustment = planWeeklyAdjustment({
    goalKind: input.goalKind,
    recentCheckIns: checkins,
  });

  return {
    trainingCompleted,
    weightTrend,
    hungerEnergy,
    adherence,
    recommendedChanges: adjustment.reason,
    kcalDelta: adjustment.kcalDelta,
    warnings: adjustment.warnings,
    adjustedGoalKind: adjustment.adjustedGoalKind,
  };
}

export function adjustPlanFromCheckIn(input: WeeklyAdjustmentInput): PlanAdjustment {
  return planWeeklyAdjustment(input);
}

export function generateWeeklyMiniReview(input: WeeklyMiniReviewInput): WeeklyMiniReview {
  const trainingAdherencePct = input.plannedSessions > 0
    ? Math.round((input.completedSessions / input.plannedSessions) * 100)
    : null;
  const averageReadiness = input.readinessScores.length
    ? Math.round(input.readinessScores.reduce((sum, score) => sum + score, 0) / input.readinessScores.length)
    : null;
  const nutritionAdherencePct = input.nutritionLoggedDays > 0
    ? Math.round((input.nutritionTargetDays / input.nutritionLoggedDays) * 100)
    : null;

  let recommendationKey: TranslationKey = 'history.weeklyRecommendationHold';
  if (averageReadiness != null && averageReadiness < 55) {
    recommendationKey = 'history.weeklyRecommendationRecover';
  } else if (trainingAdherencePct != null && trainingAdherencePct < 70) {
    recommendationKey = 'history.weeklyRecommendationConsistency';
  } else if (nutritionAdherencePct != null && nutritionAdherencePct < 70) {
    recommendationKey = 'history.weeklyRecommendationNutrition';
  }

  return {
    completedSessions: input.completedSessions,
    plannedSessions: input.plannedSessions,
    trainingAdherencePct,
    averageReadiness,
    nutritionTargetDays: input.nutritionTargetDays,
    nutritionLoggedDays: input.nutritionLoggedDays,
    nutritionAdherencePct,
    recommendationKey,
  };
}
