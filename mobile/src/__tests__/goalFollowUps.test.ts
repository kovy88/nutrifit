import { describe, expect, it } from 'vitest';
import { generateGoalFollowUps, hasRequiredGoalFollowUps } from '../lib/onboarding/follow-up-question-generator';
import { goalProfileFromQuickStart, parseGoalText, updateGoalProfile } from '../lib/onboarding/goal-parser';

describe('goal follow-up generation', () => {
  it('asks race distance when the user only says run a race', () => {
    const goal = goalProfileFromQuickStart('run_race');

    expect(generateGoalFollowUps(goal).map(question => question.id)).toEqual(['raceGoal']);
    expect(hasRequiredGoalFollowUps(goal)).toBe(false);
  });

  it('asks only missing race planning details for half marathon and marathon goals', () => {
    const goal = parseGoalText('I want to run a half marathon').goalProfile!;

    expect(generateGoalFollowUps(goal).map(question => question.id)).toEqual([
      'raceDateISO',
      'currentWeeklyKm',
      'longestRecentRunKm',
      'runsPerWeek',
      'availableTrainingDays',
      'targetTimeSeconds',
      'injuryFlag',
      'gymStrengthAvailable',
      'runWalkPreferred',
    ]);

    const complete = updateGoalProfile(goal, {
      raceDateISO: '2026-10-01',
      currentWeeklyKm: 25,
      longestRecentRunKm: 14,
      runsPerWeek: 3,
      availableTrainingDays: 4,
      targetTimeSeconds: 7200,
      injuryFlag: false,
      gymStrengthAvailable: true,
      runWalkPreferred: false,
    });

    expect(generateGoalFollowUps(complete)).toEqual([]);
    expect(hasRequiredGoalFollowUps(complete)).toBe(true);
  });

  it('asks fat-loss goal details without forcing maintenance as a primary goal', () => {
    const goal = parseGoalText('I want to lose fat').goalProfile!;

    expect(generateGoalFollowUps(goal).map(question => question.id)).toEqual([
      'currentWeightKg',
      'desiredWeightChangeKg',
      'timelineWeeks',
      'dietPreferences',
    ]);
  });

  it('asks build muscle training context', () => {
    const goal = parseGoalText('I want to build muscle but not gain too much fat').goalProfile!;

    expect(generateGoalFollowUps(goal).map(question => question.id)).toEqual([
      'trainingEnvironment',
      'availableTrainingDays',
    ]);
  });

  it('asks the main blocker for feel-better goals', () => {
    const goal = parseGoalText('I just want to feel better and be consistent').goalProfile!;

    expect(generateGoalFollowUps(goal).map(question => question.id)).toEqual(['mainWellbeingBlocker']);
  });
});
