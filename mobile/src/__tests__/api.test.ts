import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMealPlan } from '../services/api';
import { DEFAULT_PROFILE, calculateMacros, validateMealPlan } from '../utils/nutrition';
import { namesForMealCount } from '../utils/mealPrompts';

vi.mock('expo-file-system', () => ({
  default: {},
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: vi.fn(),
}));

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

describe('services/api meal-plan fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('returns a deterministic valid meal plan when AI generation fails after retry', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    });

    const macros = calculateMacros(DEFAULT_PROFILE);
    const meals = await generateMealPlan(DEFAULT_PROFILE, macros, null);
    const validation = validateMealPlan(meals, macros, namesForMealCount(DEFAULT_PROFILE.mealCount).length);

    expect(meals).toHaveLength(DEFAULT_PROFILE.mealCount);
    expect(validation.valid).toBe(true);
    expect(meals[0].name).toContain('záložní');
  });
});
