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
      draft: { ...DEFAULT_PROFILE, age: 31, height: 180, weight: 78, primaryGoal: 'improve_running' },
      touchedFields: { coachScope: true, primaryGoal: true },
      updatedAt: now,
    });
    const got = await loadOnboardingDraft();
    expect(got?.step).toBe(2);
    expect(got?.draft.age).toBe(31);
    expect(got?.draft.primaryGoal).toBe('improve_running');
    expect(got?.touchedFields?.primaryGoal).toBe(true);
    expect(got?.updatedAt).toBe(now);
  });

  it('migrates legacy primary goal names when loading a draft', async () => {
    const now = new Date('2026-05-28T10:00:00Z').toISOString();
    await AsyncStorage.setItem('nutrifit.onboardingDraft.v1', JSON.stringify({
      step: 2,
      draft: { ...DEFAULT_PROFILE, primaryGoal: 'run_race', trainingGoal: 'half_marathon' },
      updatedAt: now,
    }));

    const got = await loadOnboardingDraft();
    expect(got?.draft.primaryGoal).toBe('improve_running');
    expect(got?.draft.trainingGoal).toBe('half_marathon');
    expect(got?.messages).toBeUndefined();
  });

  it('roundtrips optional chat metadata without requiring a migration', async () => {
    const now = new Date('2026-05-28T10:00:00Z').toISOString();
    await saveOnboardingDraft({
      step: 0,
      draft: { ...DEFAULT_PROFILE, coachScope: 'training' },
      touchedFields: { coachScope: true },
      messages: [{
        id: 'm1',
        role: 'coach',
        text: 'Ahoj, jsem Trenr.',
        createdAt: now,
      }],
      missingFields: ['goal'],
      confidence: 'medium',
      updatedAt: now,
    });

    const got = await loadOnboardingDraft();
    expect(got?.messages?.[0].text).toBe('Ahoj, jsem Trenr.');
    expect(got?.missingFields).toEqual(['goal']);
    expect(got?.confidence).toBe('medium');
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
