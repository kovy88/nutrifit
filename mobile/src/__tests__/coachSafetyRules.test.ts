import { describe, expect, it } from 'vitest';

import { validateNutritionSafety } from '../lib/coaching/coach-safety-rules';
import type { UserProfile } from '../types';

const baseProfile: Pick<
  UserProfile,
  'gender' | 'weight' | 'height' | 'age' | 'activityFactor' | 'trainingGoal' | 'planIntensity'
> = {
  gender: 'muz',
  weight: 80,
  height: 180,
  age: 35,
  activityFactor: 1.55,
  trainingGoal: 'general_fitness',
  planIntensity: 'moderate',
};

describe('validateNutritionSafety', () => {
  it('keeps internal maintenance labels out of Czech deficit warnings', () => {
    const warnings = validateNutritionSafety(baseProfile, 'fat_loss', 1200, 130, 60, 'cs');
    const text = warnings.join(' ');

    expect(text).toContain('udržovacímu příjmu');
    expect(text).not.toMatch(/TDEE|BMR|floor|hormon/i);
  });

  it('uses plain English nutrition safety wording', () => {
    const warnings = validateNutritionSafety(baseProfile, 'fat_loss', 1200, 70, 20, 'en');
    const text = warnings.join(' ');

    expect(text).toContain('maintenance intake');
    expect(text).toContain('safe minimum');
    expect(text).not.toMatch(/TDEE|BMR|floor|hormonal/i);
  });
});
