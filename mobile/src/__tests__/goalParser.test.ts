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

  it('maps running quick-start text into concrete race distances', () => {
    expect(parseGoalText('I want to run 5 km.').goalProfile).toMatchObject({
      primaryGoal: 'run_race',
      raceGoal: 'run_5k',
    });
    expect(parseGoalText('I want to run 10 km.').goalProfile).toMatchObject({
      primaryGoal: 'run_race',
      raceGoal: 'run_10k',
    });
    expect(parseGoalText('I want to run a half marathon.').goalProfile).toMatchObject({
      primaryGoal: 'run_race',
      raceGoal: 'half_marathon',
    });
  });

  it('does not match short needles inside unrelated words or numbers', () => {
    // '25k steps' contains '5k' as a substring — must not be misread as a 5K race goal.
    expect(parseGoalText('I walk 25k steps a day and want to feel better').goalProfile).toMatchObject({
      primaryGoal: 'build_consistency',
    });
    // 'cutlery' contains 'cut' — must not trigger fat-loss detection.
    expect(parseGoalText('I need new cutlery for my kitchen').goalProfile).toBeNull();
    // '110k' contains '10k' — must not be misread as a 10K race goal.
    expect(parseGoalText('My car has 110k miles and I want to build muscle').goalProfile).toMatchObject({
      primaryGoal: 'build_muscle',
      raceGoal: 'none',
    });
  });

  it('still matches short needles at real word boundaries', () => {
    expect(parseGoalText('I want to cut weight').goalProfile).toMatchObject({
      primaryGoal: 'lose_fat',
    });
    expect(parseGoalText('I want to run 5k').goalProfile).toMatchObject({
      primaryGoal: 'run_race',
      raceGoal: 'run_5k',
    });
    expect(parseGoalText('I want to run 10k').goalProfile).toMatchObject({
      primaryGoal: 'run_race',
      raceGoal: 'run_10k',
    });
  });
});
