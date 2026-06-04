import { describe, expect, it } from 'vitest';
import { goalProfileFromQuickStart, parseGoalText } from '../lib/onboarding/goal-parser';

describe('deterministic onboarding goal parser', () => {
  it('parses direct nutrition and training goals', () => {
    expect(parseGoalText('I want to lose fat').goalProfile).toMatchObject({
      primaryGoal: 'lose_fat',
      raceGoal: 'none',
      nutritionMode: 'fat_loss',
    });
    expect(parseGoalText('I want to build muscle').goalProfile).toMatchObject({
      primaryGoal: 'build_muscle',
      nutritionMode: 'muscle_gain',
    });
    expect(parseGoalText('I want to eat healthier').goalProfile).toMatchObject({
      primaryGoal: 'eat_healthier',
      nutritionMode: 'healthy_eating',
    });
  });

  it('parses race distances before generic marathon matching', () => {
    expect(parseGoalText('I want to run 10k').goalProfile).toMatchObject({
      primaryGoal: 'run_race',
      raceGoal: 'run_10k',
      nutritionMode: 'performance_fueling',
    });
    expect(parseGoalText('I want to run a half marathon').goalProfile).toMatchObject({
      primaryGoal: 'run_race',
      raceGoal: 'half_marathon',
    });
    expect(parseGoalText('I want to run a marathon').goalProfile).toMatchObject({
      primaryGoal: 'run_race',
      raceGoal: 'marathon',
    });
  });

  it('keeps combined fat loss plus race as fat loss with performance fueling', () => {
    expect(parseGoalText('I want to lose fat and run a half marathon').goalProfile).toMatchObject({
      primaryGoal: 'lose_fat',
      raceGoal: 'half_marathon',
      nutritionMode: 'performance_fueling',
      summary: 'fat loss + half marathon prep',
    });
  });

  it('maps broad wellbeing language into consistency', () => {
    expect(parseGoalText('I want to feel better and be consistent').goalProfile).toMatchObject({
      primaryGoal: 'build_consistency',
      nutritionMode: 'healthy_eating',
    });
  });

  it('quick starts do not include maintenance as a primary motivation', () => {
    expect(goalProfileFromQuickStart('lose_fat')).toMatchObject({ primaryGoal: 'lose_fat' });
    expect(() => goalProfileFromQuickStart('maintenance' as never)).toThrow();
  });
});
