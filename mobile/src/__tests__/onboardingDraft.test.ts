// Smoke tests for the onboarding-draft storage layer. The hook-level effect
// (hydrate on mount / save on change / clear on finish) is exercised here at
// the storage API level — full React rendering is covered by manual QA until
// we add @testing-library/react-native to the deps.

import { afterEach, describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
} from '../services/storage';
import { DEFAULT_PROFILE } from '../utils/nutrition';

afterEach(async () => {
  await AsyncStorage.clear();
});

describe('onboarding draft storage', () => {
  it('returns null when nothing stored', async () => {
    expect(await loadOnboardingDraft()).toBeNull();
  });

  it('roundtrips a draft with step + profile + timestamp', async () => {
    const now = new Date('2026-05-28T10:00:00Z').toISOString();
    await saveOnboardingDraft({
      step: 2,
      draft: { ...DEFAULT_PROFILE, age: 31, height: 180, weight: 78, primaryGoal: 'run_race' },
      updatedAt: now,
    });
    const got = await loadOnboardingDraft();
    expect(got?.step).toBe(2);
    expect(got?.draft.age).toBe(31);
    expect(got?.draft.primaryGoal).toBe('run_race');
    expect(got?.updatedAt).toBe(now);
  });

  it('overwrites on re-save (last write wins)', async () => {
    await saveOnboardingDraft({
      step: 0,
      draft: { ...DEFAULT_PROFILE, age: 25 },
      updatedAt: '2026-05-28T08:00:00Z',
    });
    await saveOnboardingDraft({
      step: 3,
      draft: { ...DEFAULT_PROFILE, age: 40 },
      updatedAt: '2026-05-28T09:00:00Z',
    });
    const got = await loadOnboardingDraft();
    expect(got?.step).toBe(3);
    expect(got?.draft.age).toBe(40);
  });

  it('clearOnboardingDraft removes it', async () => {
    await saveOnboardingDraft({
      step: 1,
      draft: { ...DEFAULT_PROFILE },
      updatedAt: new Date().toISOString(),
    });
    await clearOnboardingDraft();
    expect(await loadOnboardingDraft()).toBeNull();
  });

  it('survives malformed JSON (corrupt storage) without throwing', async () => {
    await AsyncStorage.setItem('nutrifit.onboardingDraft.v1', '{ not json');
    expect(await loadOnboardingDraft()).toBeNull();
  });
});
