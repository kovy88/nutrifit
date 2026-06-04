import { z } from 'zod';
import type { GoalProfile } from '../../types/goal-types';

export const onboardingPrimaryGoalSchema = z.enum([
  'lose_fat',
  'build_muscle',
  'run_race',
  'improve_fitness',
  'eat_healthier',
  'recover_better',
  'build_consistency',
]);

export const onboardingRaceGoalSchema = z.enum(['none', 'run_5k', 'run_10k', 'half_marathon', 'marathon']);
export const onboardingNutritionModeSchema = z.enum(['fat_loss', 'maintenance', 'muscle_gain', 'performance_fueling', 'healthy_eating', 'simple_meal_prep']);
export const onboardingPlanIntensitySchema = z.enum(['easy', 'moderate', 'ambitious_but_safe']);
export const onboardingExperienceLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

export const goalProfileSchema = z.object({
  primaryGoal: onboardingPrimaryGoalSchema,
  raceGoal: onboardingRaceGoalSchema.default('none'),
  nutritionMode: onboardingNutritionModeSchema.default('healthy_eating'),
  planIntensity: onboardingPlanIntensitySchema.default('moderate'),
  experienceLevel: onboardingExperienceLevelSchema.default('beginner'),
  needsFollowUp: z.boolean().default(true),
  rawText: z.string().optional(),
  summary: z.string().default(''),
  confidence: z.enum(['low', 'medium', 'high']).default('medium'),
  raceDateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currentWeeklyKm: z.number().positive().optional(),
  longestRecentRunKm: z.number().positive().optional(),
  availableTrainingDays: z.number().int().min(1).max(7).optional(),
  runsPerWeek: z.number().int().min(1).max(7).optional(),
  currentWeightKg: z.number().positive().optional(),
  targetWeightKg: z.number().positive().optional(),
  desiredWeightChangeKg: z.number().positive().optional(),
  timelineWeeks: z.number().int().positive().optional(),
  dietPreferences: z.string().optional(),
  trainingEnvironment: z.enum(['gym', 'home', 'mixed']).optional(),
  mainWellbeingBlocker: z.enum(['energy', 'fitness', 'food', 'sleep', 'consistency']).optional(),
  targetTimeSeconds: z.number().int().positive().optional(),
  preferredRestDays: z.array(z.number().int().min(0).max(6)).optional(),
  injuryFlag: z.boolean().optional(),
  gymStrengthAvailable: z.boolean().optional(),
  runWalkPreferred: z.boolean().optional(),
});

export function parseGoalProfile(value: unknown): GoalProfile | null {
  const parsed = goalProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function withGoalProfileDefaults(value: Omit<GoalProfile, 'needsFollowUp'> & Partial<Pick<GoalProfile, 'needsFollowUp'>>): GoalProfile {
  return goalProfileSchema.parse(value);
}
