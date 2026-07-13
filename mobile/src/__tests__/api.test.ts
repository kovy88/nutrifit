import { beforeEach, describe, expect, it, vi } from 'vitest';
import { askOnboardingCoach, generateMealPlan } from '../services/api';
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
    const meals = await generateMealPlan(DEFAULT_PROFILE, macros, null, 'cs');
    const validation = validateMealPlan(meals, macros, namesForMealCount(DEFAULT_PROFILE.mealCount, 'cs').length, 'cs');

    expect(meals).toHaveLength(DEFAULT_PROFILE.mealCount);
    expect(validation.valid).toBe(true);
    expect(meals[0].name).toContain('záložní');
  });
});

describe('services/api onboarding coach', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('parses a valid onboarding coach reply from /api/generate', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                reply: 'Super, mám trénink.',
                extracted: {
                  coachScope: 'training',
                  sessionsPerWeek: 4,
                },
                confidence: 'high',
                missingFields: ['experience'],
              }),
            }],
          },
        }],
      }),
    } as any));

    const reply = await askOnboardingCoach({
      draft: DEFAULT_PROFILE,
      history: [],
      userText: 'Chci jen trénink čtyřikrát týdně.',
      locale: 'cs',
    });

    expect(reply.reply).toBe('Super, mám trénink.');
    expect(reply.extracted.coachScope).toBe('training');
    expect(reply.extracted.sessionsPerWeek).toBe(4);
    expect(reply.confidence).toBe('high');
    expect(reply.missingFields).toEqual(['experience']);
  });

  it('returns a safe fallback when onboarding coach JSON is invalid', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: '{"reply":""}' }] },
        }],
      }),
    } as any));

    const reply = await askOnboardingCoach({
      draft: DEFAULT_PROFILE,
      history: [],
      userText: 'něco divného',
      locale: 'cs',
    });

    expect(reply.extracted).toEqual({});
    expect(reply.confidence).toBe('low');
    expect(reply.reply).toContain('Nedokázal jsem');
  });
});
