import { describe, expect, it } from 'vitest';
import { canCompleteChatOnboarding, prepareChatOnboardingProfile } from '../lib/onboarding/chatCompletion';
import type { TouchedOnboardingFields } from '../lib/onboarding/validation';
import { DEFAULT_PROFILE } from '../utils/nutrition';
import type { UserProfile } from '../types';

describe('chat onboarding completion', () => {
  it('allows training-only completion without body metrics', () => {
    const draft: UserProfile = {
      ...DEFAULT_PROFILE,
      coachScope: 'training',
      primaryGoal: 'improve_running',
      trainingGoal: 'run_10k',
      sessionsPerWeek: 3,
      experience: 'beginner',
      raceDateISO: '2099-09-20',
      age: 0,
      height: 0,
      weight: 0,
    };
    const touched: TouchedOnboardingFields = {
      coachScope: true,
      primaryGoal: true,
      trainingGoal: true,
      sessionsPerWeek: true,
      experience: true,
      raceDateISO: true,
    };

    const result = canCompleteChatOnboarding(draft, touched);
    const profile = prepareChatOnboardingProfile(draft);

    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
    expect(profile.age).toBe(DEFAULT_PROFILE.age);
    expect(profile.height).toBe(DEFAULT_PROFILE.height);
    expect(profile.weight).toBe(DEFAULT_PROFILE.weight);
  });

  it('allows nutrition-only completion when body metrics are present', () => {
    const draft: UserProfile = {
      ...DEFAULT_PROFILE,
      coachScope: 'nutrition',
      primaryGoal: 'lose_fat',
      trainingGoal: 'general_fitness',
      gender: 'muz',
      age: 32,
      height: 181,
      weight: 82,
    };
    const touched: TouchedOnboardingFields = {
      coachScope: true,
      primaryGoal: true,
      gender: true,
      age: true,
      height: true,
      weight: true,
    };

    const result = canCompleteChatOnboarding(draft, touched);

    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('allows both flow only after training and nutrition basics are collected', () => {
    const draft: UserProfile = {
      ...DEFAULT_PROFILE,
      coachScope: 'both',
      primaryGoal: 'gain_muscle',
      trainingGoal: 'strength_basics',
      sessionsPerWeek: 4,
      experience: 'intermediate',
      gender: 'zena',
      age: 29,
      height: 168,
      weight: 64,
    };
    const touched: TouchedOnboardingFields = {
      coachScope: true,
      primaryGoal: true,
      trainingGoal: true,
      sessionsPerWeek: true,
      experience: true,
      gender: true,
      age: true,
      height: true,
      weight: true,
    };

    const result = canCompleteChatOnboarding(draft, touched);

    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
