import { describe, expect, it } from 'vitest';
import { applyGoalProfileToUserProfile, mapNutritionMode, mapPrimaryGoal, mapTrainingGoal } from '../lib/onboarding/goal-profile-adapter';
import { parseGoalText, updateGoalProfile } from '../lib/onboarding/goal-parser';
import { DEFAULT_PROFILE } from '../utils/nutrition';

describe('goal profile compatibility adapter', () => {
  it('maps new onboarding primary goals to existing engine goals', () => {
    expect(mapPrimaryGoal({ primaryGoal: 'build_muscle' })).toBe('gain_muscle');
    expect(mapPrimaryGoal({ primaryGoal: 'run_race' })).toBe('improve_running');
    expect(mapPrimaryGoal({ primaryGoal: 'recover_better' })).toBe('improve_recovery');
    expect(mapPrimaryGoal({ primaryGoal: 'eat_healthier' })).toBe('improve_fitness');
  });

  it('maps race and nutrition fields to existing profile fields', () => {
    expect(mapTrainingGoal('half_marathon', 'run_race')).toBe('half_marathon');
    expect(mapTrainingGoal('none', 'build_muscle')).toBe('strength_basics');
    expect(mapNutritionMode('performance_fueling')).toBe('endurance_fueling');
    expect(mapNutritionMode('fat_loss')).toBe('fat_loss_friendly');
  });

  it('applies a combined goal without losing the structured source', () => {
    const parsed = parseGoalText('I want to lose fat and run a half marathon').goalProfile!;
    const goalProfile = updateGoalProfile(parsed, {
      raceDateISO: '2026-09-20',
      currentWeeklyKm: 20,
      longestRecentRunKm: 12,
      availableTrainingDays: 4,
    });
    const profile = applyGoalProfileToUserProfile(DEFAULT_PROFILE, goalProfile);

    expect(profile.primaryGoal).toBe('lose_fat');
    expect(profile.trainingGoal).toBe('half_marathon');
    expect(profile.nutritionMode).toBe('endurance_fueling');
    expect(profile.sessionsPerWeek).toBe(4);
    expect(profile.currentWeeklyKm).toBe(20);
    expect(profile.goalProfile).toMatchObject({ primaryGoal: 'lose_fat', raceGoal: 'half_marathon' });
  });
});
