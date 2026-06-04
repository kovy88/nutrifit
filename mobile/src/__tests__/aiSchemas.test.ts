import { describe, it, expect } from 'vitest';
import {
  parseMealPlanResponse,
  parseWeeklySummarySafe,
  parseCoachReply,
  parseOnboardingCoachReply,
  parseStructuredCoachReply,
} from '../lib/ai/schemas';

describe('parseMealPlanResponse', () => {
  it('accepts a well-formed plan and coerces numeric strings', () => {
    const meals = parseMealPlanResponse({
      meals: [
        { mealType: 'Snídaně', name: 'Ovesná kaše', kcal: '450', protein: 30, carbs: 60, fat: 10, ingredients: ['80g ovesné vločky'], steps: ['Uvař.'] },
      ],
    });
    expect(meals).not.toBeNull();
    expect(meals![0].kcal).toBe(450); // coerced from "450"
  });

  it('returns null when the shape is wrong', () => {
    expect(parseMealPlanResponse({ foo: 'bar' })).toBeNull();
    expect(parseMealPlanResponse(null)).toBeNull();
    expect(parseMealPlanResponse({ meals: 'not-an-array' })).toBeNull();
  });
});

describe('parseWeeklySummarySafe', () => {
  it('parses a valid summary and defaults missing arrays', () => {
    const s = parseWeeklySummarySafe({ headline: 'Dobrý týden', recommendation: 'Drž tempo.' });
    expect(s).not.toBeNull();
    expect(s!.highlights).toEqual([]);
    expect(s!.concerns).toEqual([]);
  });

  it('rejects a summary without a headline', () => {
    expect(parseWeeklySummarySafe({ highlights: ['x'] })).toBeNull();
    expect(parseWeeklySummarySafe({ headline: '' })).toBeNull();
  });
});

describe('parseCoachReply', () => {
  it('parses a reply with optional followups', () => {
    expect(parseCoachReply({ reply: 'Dnes jeď lehce.' })).toEqual({ reply: 'Dnes jeď lehce.', followups: [] });
    const withF = parseCoachReply({ reply: 'OK', followups: ['Proč?'] });
    expect(withF!.followups).toEqual(['Proč?']);
  });

  it('rejects an empty or missing reply', () => {
    expect(parseCoachReply({ followups: ['x'] })).toBeNull();
    expect(parseCoachReply({ reply: '' })).toBeNull();
  });
});

describe('parseStructuredCoachReply', () => {
  it('parses proposed coach actions with safe defaults', () => {
    const parsed = parseStructuredCoachReply({
      reply: 'Můžu ti upravit den.',
      actions: [{ type: 'adjust_today', label: 'Upravit dnešek' }],
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.actions[0]).toEqual({
      type: 'adjust_today',
      label: 'Upravit dnešek',
      requiresConfirmation: true,
    });
  });

  it('rejects unsupported action types', () => {
    expect(parseStructuredCoachReply({
      reply: 'Nope',
      actions: [{ type: 'invent_calories', label: 'Bad' }],
    })).toBeNull();
  });
});

describe('parseOnboardingCoachReply', () => {
  it('parses extracted onboarding fields and coerces numbers', () => {
    const parsed = parseOnboardingCoachReply({
      reply: 'Rozumím, cíl je 10K.',
      extracted: {
        primaryGoal: 'improve_running',
        trainingGoal: 'run_10k',
        sessionsPerWeek: '4',
      },
      confidence: 'high',
      missingFields: ['raceDateISO'],
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.extracted.sessionsPerWeek).toBe(4);
    expect(parsed!.missingFields).toEqual(['raceDateISO']);
  });

  it('rejects unknown training goals', () => {
    expect(parseOnboardingCoachReply({
      reply: 'Bad',
      extracted: { trainingGoal: 'ultra_100_miles' },
    })).toBeNull();
  });
});
