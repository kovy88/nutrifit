import type { DietStyle, TrainingGoalKind, UserProfile } from '../../types';
import type {
  CanonicalNutritionMode,
  GoalProfile,
  PrimaryGoal,
  RaceDistance,
  RaceGoal,
  RaceGoalDetails,
  TopLevelGoal,
  TrainingFocus,
  UserConstraints,
} from '../../types/goal-types';

export function topLevelGoalFromPrimary(goal: PrimaryGoal): TopLevelGoal {
  switch (goal) {
    case 'build_muscle': return 'build_strength';
    case 'eat_healthier': return 'eat_better';
    case 'recover_better': return 'recover_better';
    case 'run_race': return 'run_race';
    case 'build_consistency': return 'build_consistency';
    case 'improve_fitness': return 'improve_fitness';
    case 'lose_fat': return 'lose_fat';
  }
}

export function raceDistanceFromLegacy(goal: RaceGoal | TrainingGoalKind | undefined): RaceDistance {
  switch (goal) {
    case 'run_5k': return '5k';
    case 'run_10k': return '10k';
    case 'half_marathon': return 'half_marathon';
    case 'marathon': return 'marathon';
    default: return 'none';
  }
}

export function legacyRaceGoalFromDistance(distance: RaceDistance): RaceGoal {
  switch (distance) {
    case '5k': return 'run_5k';
    case '10k': return 'run_10k';
    case 'half_marathon': return 'half_marathon';
    case 'marathon': return 'marathon';
    case 'none': return 'none';
  }
}

export function canonicalNutritionMode(goal: Pick<GoalProfile, 'nutritionMode' | 'primaryGoal'>): CanonicalNutritionMode {
  switch (goal.nutritionMode) {
    case 'fat_loss': return 'fat_loss';
    case 'muscle_gain': return 'muscle_gain';
    case 'performance_fueling': return 'performance';
    case 'maintenance': return 'maintenance';
    case 'healthy_eating':
    case 'simple_meal_prep':
      return 'simple_healthy';
  }
}

export function trainingFocusFromGoal(goal: Pick<GoalProfile, 'primaryGoal' | 'raceGoal'>): TrainingFocus {
  if (goal.raceGoal !== 'none' || goal.primaryGoal === 'run_race') return 'running';
  if (goal.primaryGoal === 'build_muscle') return 'strength';
  if (goal.primaryGoal === 'eat_healthier') return 'walking';
  if (goal.primaryGoal === 'recover_better') return 'none';
  return 'general_fitness';
}

export function constraintsFromProfile(profile: Pick<UserProfile, 'sessionsPerWeek' | 'experience' | 'currentWeeklyKm' | 'longestRecentRunKm' | 'injuryFlag' | 'preferredRestDays' | 'diet' | 'likes' | 'dislikes'>): UserConstraints {
  const sessions = Math.min(6, Math.max(1, profile.sessionsPerWeek || 3)) as UserConstraints['sessionsPerWeek'];
  const foodPreferences = [profile.likes, profile.dislikes ? `Avoid: ${profile.dislikes}` : ''].filter(Boolean).join(' · ') || undefined;
  return {
    sessionsPerWeek: sessions,
    experience: profile.experience,
    currentWeeklyKm: profile.currentWeeklyKm,
    longestRecentRunKm: profile.longestRecentRunKm,
    injuryFlag: profile.injuryFlag,
    preferredRestDays: profile.preferredRestDays,
    dietStyle: profile.diet as DietStyle,
    foodPreferences,
  };
}

export function normalizeGoalProfile(goal: GoalProfile, profile?: UserProfile): GoalProfile {
  const sessions = Math.min(6, Math.max(1, goal.availableTrainingDays ?? profile?.sessionsPerWeek ?? 3)) as UserConstraints['sessionsPerWeek'];
  const race: RaceGoalDetails = {
    distance: goal.race?.distance ?? raceDistanceFromLegacy(goal.raceGoal),
    dateISO: goal.raceDateISO ?? goal.race?.dateISO,
    targetTimeSeconds: goal.targetTimeSeconds ?? goal.race?.targetTimeSeconds,
  };
  const constraints: UserConstraints = {
    ...(profile ? constraintsFromProfile(profile) : {}),
    ...(goal.constraints ?? {}),
    sessionsPerWeek: sessions,
    experience: goal.experienceLevel,
    currentWeeklyKm: goal.currentWeeklyKm ?? goal.constraints?.currentWeeklyKm ?? profile?.currentWeeklyKm,
    longestRecentRunKm: goal.longestRecentRunKm ?? goal.constraints?.longestRecentRunKm ?? profile?.longestRecentRunKm,
    injuryFlag: goal.injuryFlag ?? goal.constraints?.injuryFlag ?? profile?.injuryFlag,
    preferredRestDays: goal.preferredRestDays ?? goal.constraints?.preferredRestDays ?? profile?.preferredRestDays,
  };
  return {
    ...goal,
    topLevelGoal: goal.topLevelGoal ?? topLevelGoalFromPrimary(goal.primaryGoal),
    race,
    trainingFocus: goal.trainingFocus ?? trainingFocusFromGoal(goal),
    canonicalNutritionMode: goal.canonicalNutritionMode ?? canonicalNutritionMode(goal),
    constraints,
  };
}
