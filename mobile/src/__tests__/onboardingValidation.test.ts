import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../utils/nutrition';
import { buildOnboardingSteps, isAutoAdvanceStep, profileSetupCompleteness, validateOnboardingStep } from '../lib/onboarding/validation';
import { parseGoalText, updateGoalProfile } from '../lib/onboarding/goal-parser';

describe('onboarding step validation', () => {
  it('requires explicit user choices for default-backed steps', () => {
    expect(validateOnboardingStep('focus', DEFAULT_PROFILE, 'both', {}).valid).toBe(false);
    expect(validateOnboardingStep('focus', DEFAULT_PROFILE, 'both', { coachScope: true }).valid).toBe(true);

    expect(validateOnboardingStep('goal', DEFAULT_PROFILE, 'both', {}).valid).toBe(false);
    expect(validateOnboardingStep('goal', { ...DEFAULT_PROFILE, goalProfile: parseGoalText('I want to eat healthier').goalProfile! }, 'both', { goalProfile: true }).valid).toBe(true);
    expect(isAutoAdvanceStep('goal')).toBe(false);
    expect(isAutoAdvanceStep('body')).toBe(false);
  });

  it('requires body metrics only when nutrition is in scope', () => {
    const blankBody = { ...DEFAULT_PROFILE, age: 0, height: 0, weight: 0 };

    expect(validateOnboardingStep('body', blankBody, 'training', {}).valid).toBe(true);
    expect(validateOnboardingStep('body', blankBody, 'nutrition', {}).valid).toBe(false);
    expect(validateOnboardingStep('body', DEFAULT_PROFILE, 'nutrition', {
      gender: true,
      age: true,
      height: true,
      weight: true,
    }).valid).toBe(true);
  });

  it('requires running history for running goals', () => {
    const runner = { ...DEFAULT_PROFILE, primaryGoal: 'improve_running' as const, trainingGoal: 'half_marathon' as const };

    expect(validateOnboardingStep('weeklyKm', runner, 'both', { currentWeeklyKm: true }).valid).toBe(false);
    expect(validateOnboardingStep('weeklyKm', { ...runner, currentWeeklyKm: 24 }, 'both', { currentWeeklyKm: true }).valid).toBe(true);
    expect(validateOnboardingStep('longestRun', { ...runner, longestRecentRunKm: 12 }, 'both', { longestRecentRunKm: true }).valid).toBe(true);
    expect(validateOnboardingStep('runFrequency', { ...runner, runsPerWeek: 3 }, 'both', { runsPerWeek: true }).valid).toBe(true);
    expect(validateOnboardingStep('runLimits', runner, 'both', { injuryFlag: true }).valid).toBe(false);
    expect(validateOnboardingStep('runLimits', runner, 'both', { injuryFlag: true, runWalkPreferred: true }).valid).toBe(true);
  });

  it('requires race date and available days, but not target time or pace', () => {
    const race = { ...DEFAULT_PROFILE, trainingGoal: 'half_marathon' as const };

    expect(validateOnboardingStep('raceDate', race, 'both', {}).valid).toBe(false);
    expect(validateOnboardingStep('raceDate', { ...race, raceDateISO: '2099-05-01' }, 'both', { raceDateISO: true }).valid).toBe(true);
    expect(validateOnboardingStep('raceTarget', race, 'both', {}).valid).toBe(true);
    expect(validateOnboardingStep('raceSchedule', race, 'both', {}).valid).toBe(false);
    expect(validateOnboardingStep('raceSchedule', { ...race, availableTrainingDays: 4 }, 'both', { availableTrainingDays: true }).valid).toBe(true);
  });

  it('blocks unrealistic race feasibility until the user adjusts the goal or date', () => {
    expect(validateOnboardingStep('raceFeasibility', DEFAULT_PROFILE, 'both', {}, 'unrealistic').valid).toBe(false);
    expect(validateOnboardingStep('raceFeasibility', DEFAULT_PROFILE, 'both', {}, 'tight').valid).toBe(true);
  });

  it('builds quick-start step lists by scope and selected goal', () => {
    const completeRaceGoal = updateGoalProfile(parseGoalText('I want to run a half marathon').goalProfile!, {
      raceDateISO: '2099-05-01',
      currentWeeklyKm: 24,
      longestRecentRunKm: 12,
      availableTrainingDays: 4,
    });

    expect(buildOnboardingSteps('both', 'general_fitness', 'build_consistency')).toEqual([
      'focus',
      'goal',
      'sessions',
      'experience',
      'body',
      'nutritionMode',
      'planIntensity',
      'diet',
    ]);
    expect(buildOnboardingSteps('nutrition', 'general_fitness', 'lose_fat')).toContain('goal');
    expect(buildOnboardingSteps('nutrition', 'general_fitness', 'lose_fat')).not.toContain('nutritionGoal');
    expect(buildOnboardingSteps('training', 'general_fitness', 'build_consistency')).not.toContain('body');
    expect(buildOnboardingSteps('training', 'half_marathon', 'improve_running')).toContain('raceFeasibility');
    expect(buildOnboardingSteps('training', 'half_marathon', 'improve_running')).not.toContain('raceTarget');
    expect(buildOnboardingSteps('training', 'couch_to_5k', 'improve_running')).not.toContain('raceDate');
    expect(buildOnboardingSteps('training', 'half_marathon', 'improve_running', completeRaceGoal)).not.toContain('raceDate');
    expect(buildOnboardingSteps('training', 'half_marathon', 'improve_running', completeRaceGoal)).not.toContain('raceSchedule');
  });

  it('summarizes optional setup items for later completion', () => {
    const quickProfile = { ...DEFAULT_PROFILE, likes: '', dislikes: '', preferredRestDays: undefined };

    expect(profileSetupCompleteness(quickProfile).complete).toBe(false);
    expect(profileSetupCompleteness({ ...quickProfile, likes: 'vejce', preferredRestDays: [0] }).complete).toBe(true);
  });
});
