import { describe, expect, it } from 'vitest';
import { generateGoalFollowUps, hasRequiredGoalFollowUps } from '../lib/onboarding/follow-up-question-generator';
import { goalProfileFromQuickStart, parseGoalText, updateGoalProfile } from '../lib/onboarding/goal-parser';

describe('goal follow-up generation', () => {
  it('asks race distance when the user only says run a race', () => {
    const goal = goalProfileFromQuickStart('run_race');
    const [question] = generateGoalFollowUps(goal);

    expect(question.id).toBe('raceGoal');
    expect(question.kind).toBe('single_choice');
    expect(question.kind === 'single_choice' ? question.options.map(option => option.value) : []).toEqual([
      'run_5k',
      'run_10k',
      'half_marathon',
    ]);
    expect(hasRequiredGoalFollowUps(goal)).toBe(false);
  });

  it('asks only the race date for explicit race goals during MVP onboarding', () => {
    const goal = parseGoalText('I want to run a half marathon').goalProfile!;

    expect(generateGoalFollowUps(goal).map(question => question.id)).toEqual(['raceDateISO']);

    const complete = updateGoalProfile(goal, {
      raceDateISO: '2026-10-01',
    });

    expect(generateGoalFollowUps(complete)).toEqual([]);
    expect(hasRequiredGoalFollowUps(complete)).toBe(true);
  });

  it('does not ask fat-loss details before the first usable plan', () => {
    const goal = parseGoalText('I want to lose fat').goalProfile!;

    expect(generateGoalFollowUps(goal).map(question => question.id)).toEqual([]);
    expect(hasRequiredGoalFollowUps(goal)).toBe(true);
  });

  it('defers build muscle training context until after quick start', () => {
    const goal = parseGoalText('I want to build muscle but not gain too much fat').goalProfile!;

    expect(generateGoalFollowUps(goal).map(question => question.id)).toEqual([]);
    expect(hasRequiredGoalFollowUps(goal)).toBe(true);
  });

  it('defers the main blocker for feel-better goals', () => {
    const goal = parseGoalText('I just want to feel better and be consistent').goalProfile!;

    expect(generateGoalFollowUps(goal).map(question => question.id)).toEqual([]);
    expect(hasRequiredGoalFollowUps(goal)).toBe(true);
  });
});
