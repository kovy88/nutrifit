import type { GoalProfile, NutritionMode as OnboardingNutritionMode, RaceGoal } from '../../types/goal-types';
import type { NutritionMode, PrimaryGoal, TrainingGoalKind, UserProfile } from '../../types';
import { activityFactorForSessions } from '../../utils/nutrition';
import { normalizeGoalProfile } from '../goals/goal-model';

export function applyGoalProfileToUserProfile(profile: UserProfile, goalProfile: GoalProfile): UserProfile {
  const normalizedGoal = normalizeGoalProfile(goalProfile, profile);
  const sessions = normalizedGoal.availableTrainingDays ?? profile.sessionsPerWeek;
  const next: UserProfile = {
    ...profile,
    goalProfile: normalizedGoal,
    primaryGoal: mapPrimaryGoal(normalizedGoal),
    trainingGoal: mapTrainingGoal(normalizedGoal.raceGoal, normalizedGoal.primaryGoal),
    nutritionMode: mapNutritionMode(normalizedGoal.nutritionMode),
    planIntensity: normalizedGoal.planIntensity,
    experience: normalizedGoal.experienceLevel,
    sessionsPerWeek: sessions,
    activityFactor: activityFactorForSessions(sessions),
  };

  if (normalizedGoal.raceDateISO) next.raceDateISO = normalizedGoal.raceDateISO;
  if (normalizedGoal.currentWeeklyKm) next.currentWeeklyKm = normalizedGoal.currentWeeklyKm;
  if (normalizedGoal.longestRecentRunKm) next.longestRecentRunKm = normalizedGoal.longestRecentRunKm;
  if (normalizedGoal.availableTrainingDays) next.availableTrainingDays = normalizedGoal.availableTrainingDays;
  if (normalizedGoal.runsPerWeek) next.runsPerWeek = normalizedGoal.runsPerWeek;
  if (normalizedGoal.currentWeightKg) next.weight = normalizedGoal.currentWeightKg;
  if (normalizedGoal.dietPreferences) next.likes = mergePreference(next.likes, normalizedGoal.dietPreferences);
  if (normalizedGoal.targetTimeSeconds) next.targetTimeSeconds = normalizedGoal.targetTimeSeconds;
  if (normalizedGoal.preferredRestDays) next.preferredRestDays = normalizedGoal.preferredRestDays;
  if (normalizedGoal.injuryFlag !== undefined) next.injuryFlag = normalizedGoal.injuryFlag;
  if (normalizedGoal.runWalkPreferred !== undefined) next.runWalkPreferred = normalizedGoal.runWalkPreferred;

  return next;
}

export function mapPrimaryGoal(goalProfile: Pick<GoalProfile, 'primaryGoal'>): PrimaryGoal {
  switch (goalProfile.primaryGoal) {
    case 'lose_fat': return 'lose_fat';
    case 'build_muscle': return 'gain_muscle';
    case 'run_race': return 'improve_running';
    case 'recover_better': return 'improve_recovery';
    case 'build_consistency': return 'build_consistency';
    case 'eat_healthier':
    case 'improve_fitness':
      return 'improve_fitness';
  }
}

export function mapTrainingGoal(raceGoal: RaceGoal, primaryGoal: GoalProfile['primaryGoal']): TrainingGoalKind {
  if (raceGoal !== 'none') return raceGoal;
  if (primaryGoal === 'build_muscle') return 'strength_basics';
  if (primaryGoal === 'run_race') return 'couch_to_5k';
  if (primaryGoal === 'eat_healthier') return 'walking_more';
  return 'general_fitness';
}

export function mapNutritionMode(mode: OnboardingNutritionMode): NutritionMode {
  switch (mode) {
    case 'fat_loss': return 'fat_loss_friendly';
    case 'maintenance': return 'balanced';
    case 'muscle_gain': return 'muscle_gain_friendly';
    case 'performance_fueling': return 'endurance_fueling';
    case 'healthy_eating': return 'balanced';
    case 'simple_meal_prep': return 'simple_meal_prep';
  }
}

function mergePreference(current: string, addition: string): string {
  const trimmed = addition.trim();
  if (!trimmed) return current;
  if (!current.trim()) return trimmed;
  if (current.includes(trimmed)) return current;
  return `${current.trim()}, ${trimmed}`;
}
