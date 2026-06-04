import type { GoalProfile, NutritionMode as OnboardingNutritionMode, RaceGoal } from '../../types/goal-types';
import type { NutritionMode, PrimaryGoal, TrainingGoalKind, UserProfile } from '../../types';
import { activityFactorForSessions } from '../../utils/nutrition';

export function applyGoalProfileToUserProfile(profile: UserProfile, goalProfile: GoalProfile): UserProfile {
  const sessions = goalProfile.availableTrainingDays ?? profile.sessionsPerWeek;
  const next: UserProfile = {
    ...profile,
    goalProfile,
    primaryGoal: mapPrimaryGoal(goalProfile),
    trainingGoal: mapTrainingGoal(goalProfile.raceGoal, goalProfile.primaryGoal),
    nutritionMode: mapNutritionMode(goalProfile.nutritionMode),
    planIntensity: goalProfile.planIntensity,
    experience: goalProfile.experienceLevel,
    sessionsPerWeek: sessions,
    activityFactor: activityFactorForSessions(sessions),
  };

  if (goalProfile.raceDateISO) next.raceDateISO = goalProfile.raceDateISO;
  if (goalProfile.currentWeeklyKm) next.currentWeeklyKm = goalProfile.currentWeeklyKm;
  if (goalProfile.longestRecentRunKm) next.longestRecentRunKm = goalProfile.longestRecentRunKm;
  if (goalProfile.availableTrainingDays) next.availableTrainingDays = goalProfile.availableTrainingDays;
  if (goalProfile.runsPerWeek) next.runsPerWeek = goalProfile.runsPerWeek;
  if (goalProfile.currentWeightKg) next.weight = goalProfile.currentWeightKg;
  if (goalProfile.dietPreferences) next.likes = mergePreference(next.likes, goalProfile.dietPreferences);
  if (goalProfile.targetTimeSeconds) next.targetTimeSeconds = goalProfile.targetTimeSeconds;
  if (goalProfile.preferredRestDays) next.preferredRestDays = goalProfile.preferredRestDays;
  if (goalProfile.injuryFlag !== undefined) next.injuryFlag = goalProfile.injuryFlag;
  if (goalProfile.runWalkPreferred !== undefined) next.runWalkPreferred = goalProfile.runWalkPreferred;

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
