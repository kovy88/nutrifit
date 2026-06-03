import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../utils/nutrition';
import { buildOnboardingSteps, validateOnboardingStep } from '../lib/onboarding/validation';

describe('onboarding step validation', () => {
  it('requires explicit user choices for default-backed steps', () => {
    expect(validateOnboardingStep('focus', DEFAULT_PROFILE, 'both', {}).valid).toBe(false);
    expect(validateOnboardingStep('focus', DEFAULT_PROFILE, 'both', { coachScope: true }).valid).toBe(true);

    expect(validateOnboardingStep('goal', DEFAULT_PROFILE, 'both', {}).valid).toBe(false);
    expect(validateOnboardingStep('goal', DEFAULT_PROFILE, 'both', { primaryGoal: true }).valid).toBe(true);
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

  it('builds scope-specific step lists', () => {
    expect(buildOnboardingSteps('nutrition', 'general_fitness')).not.toContain('weeklyKm');
    expect(buildOnboardingSteps('training', 'half_marathon')).toContain('raceFeasibility');
    expect(buildOnboardingSteps('both', 'general_fitness')).toContain('body');
  });
});
