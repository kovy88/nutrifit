import { describe, it, expect } from 'vitest';
import {
  parseMealPlanResponse,
  parseWeeklySummarySafe,
  parseCoachReply,
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
