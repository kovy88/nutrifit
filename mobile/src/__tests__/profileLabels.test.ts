import { describe, expect, it } from 'vitest';
import { createTranslator } from '../lib/i18n';
import {
  formatProfileValue,
  getExperienceLabel,
  getGoalLabel,
  getHealthProviderLabel,
  getHealthProviderStatus,
  getProfileGoalSummary,
  getNutritionModeLabel,
  getRaceGoalLabel,
  summarizeLikesDislikes,
} from '../lib/profile/profile-labels';
import { parseGoalText } from '../lib/onboarding/goal-parser';

const t = createTranslator('en');

describe('profile label helpers', () => {
  it('maps profile goal fields to user-facing labels', () => {
    expect(getGoalLabel({ primaryGoal: 'lose_fat' }, t)).toBe('Fat loss');
    expect(getRaceGoalLabel('run_10k', t)).toBe('10 km');
    expect(getNutritionModeLabel('fat_loss_friendly', t)).toBe('Fat-loss friendly');
    expect(getExperienceLabel('intermediate', t)).toBe('Intermediate');
  });

  it('maps advanced and legacy training goals without leaking raw keys', () => {
    const cs = createTranslator('cs');

    expect(getRaceGoalLabel('marathon', t)).toBe('Marathon');
    expect(getRaceGoalLabel('sport_conditioning', t)).toBe('Sport conditioning');
    expect(getRaceGoalLabel('play_sport', t)).toBe('I play a sport / my own rhythm');
    expect(getRaceGoalLabel('sprint_triathlon', t)).toBe('Sprint triathlon');
    expect(getRaceGoalLabel('ocr', cs)).toBe('OCR závod');
    expect(getRaceGoalLabel('basic_strength', cs)).toBe('Síla');
  });

  it('formats profile goal summaries for user-facing and AI context', () => {
    const cs = createTranslator('cs');
    const goalProfile = parseGoalText('I want to lose fat and run a half marathon').goalProfile!;

    expect(getProfileGoalSummary({ primaryGoal: 'lose_fat', trainingGoal: 'run_10k' }, t)).toBe('Fat loss + 10 km');
    expect(getProfileGoalSummary({ primaryGoal: 'improve_fitness', trainingGoal: 'play_sport' }, t)).toBe('Improve fitness + I play a sport / my own rhythm');
    expect(getProfileGoalSummary({ primaryGoal: 'lose_fat', trainingGoal: 'run_10k', goalProfile }, cs)).toBe('Hubnutí tuku + Půlmaraton');
  });

  it('summarizes health provider state without pretending native health is connected', () => {
    expect(getHealthProviderLabel('auto', t)).toBe('Health data');
    expect(getHealthProviderLabel('manual', t)).toBe('Manual check-ins');
    expect(getHealthProviderStatus('auto', { available: false, platform: 'ios' }, 0, t)).toBe('Health data is not connected. You can use manual check-ins.');
    expect(getHealthProviderStatus('auto', { available: true, platform: 'ios' }, 0, t)).toBe('Apple Health is available.');
    expect(getHealthProviderStatus('auto', { available: false, platform: 'unsupported' }, 2, t)).toBe('2 connected health sources');
  });

  it('summarizes food preferences and missing values', () => {
    expect(summarizeLikesDislikes('rice, eggs, yogurt', '', t)).toBe('Likes: rice, eggs, yogurt');
    expect(summarizeLikesDislikes('', '', t)).toBe('No food preferences yet');
    expect(summarizeLikesDislikes('a very long preference string that should be shortened', 'fish', t, 24)).toContain('…');
    expect(formatProfileValue(undefined, t, ' kg')).toBe('Not set');
    expect(formatProfileValue(76, t, ' kg')).toBe('76 kg');
  });
});
