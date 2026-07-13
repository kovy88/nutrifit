import { describe, expect, it } from 'vitest';
import { createTranslator } from '../lib/i18n';
import { parseGoalText } from '../lib/onboarding/goal-parser';
import { formatGoalProfileSummary } from '../lib/onboarding/goal-summary-labels';

describe('goal summary labels', () => {
  it('formats combined goals through translated labels instead of parser summaries', () => {
    const goal = parseGoalText('I want to lose fat and run a half marathon').goalProfile!;

    expect(goal.summary).toBe('fat loss + half marathon prep');
    expect(formatGoalProfileSummary(goal, createTranslator('en'))).toBe('Fat loss + Half marathon');
    expect(formatGoalProfileSummary(goal, createTranslator('cs'))).toBe('Hubnutí tuku + Půlmaraton');
  });

  it('keeps concrete race goals short and user-facing', () => {
    const goal = parseGoalText('I want to run 10 km').goalProfile!;

    expect(formatGoalProfileSummary(goal, createTranslator('en'))).toBe('10 km');
    expect(formatGoalProfileSummary(goal, createTranslator('cs'))).toBe('10 km');
  });

  it('formats non-race goals with product labels', () => {
    const goal = parseGoalText('I want to eat healthier').goalProfile!;

    expect(formatGoalProfileSummary(goal, createTranslator('en'))).toBe('Eat better');
    expect(formatGoalProfileSummary(goal, createTranslator('cs'))).toBe('Jíst líp');
  });
});
