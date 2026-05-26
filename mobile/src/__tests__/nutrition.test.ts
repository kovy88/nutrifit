import { describe, expect, it } from 'vitest';
import { calculateMacros, normalizeFoodEstimate, remainingMacros, sumFoodLog, validateProfile } from '../utils/nutrition';
import { DEFAULT_PROFILE } from '../utils/nutrition';

describe('nutrition utilities', () => {
  it('calculates daily macros with sane totals', () => {
    const macros = calculateMacros(DEFAULT_PROFILE);
    expect(macros.kcal).toBeGreaterThan(1200);
    expect(macros.protein).toBe(150);
    expect(macros.carbs).toBeGreaterThanOrEqual(0);
    expect(macros.tdee).toBeGreaterThan(macros.bmr);
  });

  it('warns for underage mobile users', () => {
    const errors = validateProfile({ ...DEFAULT_PROFILE, age: 16 });
    expect(errors.join(' ')).toContain('18+');
  });

  it('sums and subtracts food log items', () => {
    const macros = calculateMacros(DEFAULT_PROFILE);
    const items = [{
      id: '1',
      createdAt: new Date().toISOString(),
      source: 'manual' as const,
      foodName: 'Jogurt',
      kcal: 200,
      protein: 20,
      carbs: 15,
      fat: 6,
    }];
    expect(sumFoodLog(items).kcal).toBe(200);
    expect(remainingMacros(macros, items).protein).toBe(macros.protein - 20);
  });

  it('normalizes AI food estimates', () => {
    const estimate = normalizeFoodEstimate({ foodName: '', kcal: 9999, confidence: 'maybe' });
    expect(estimate.foodName).toBe('Neznámé jídlo');
    expect(estimate.kcal).toBe(3000);
    expect(estimate.confidence).toBe('střední');
  });
});
