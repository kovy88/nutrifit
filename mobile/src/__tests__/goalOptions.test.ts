import { describe, expect, it } from 'vitest';
import { trainingGoalsFor } from '../constants/goals';

describe('goal option surfaces', () => {
  it('keeps marathon out of running quick choices while engines still support it explicitly', () => {
    const visibleRunningGoals = trainingGoalsFor('improve_running').map(goal => goal.value);

    expect(visibleRunningGoals).toEqual([
      'couch_to_5k',
      'run_5k',
      'run_10k',
      'half_marathon',
    ]);
    expect(visibleRunningGoals).not.toContain('marathon');
  });

  it('keeps advanced and custom sport formats out of onboarding choices', () => {
    const visibleFitnessGoals = trainingGoalsFor('improve_fitness').map(goal => goal.value);

    expect(visibleFitnessGoals).toEqual([
      'general_fitness',
    ]);
    expect(visibleFitnessGoals).not.toContain('play_sport');
    expect(visibleFitnessGoals).not.toContain('sports_conditioning');
    expect(visibleFitnessGoals).not.toContain('hyrox');
    expect(visibleFitnessGoals).not.toContain('sprint_triathlon');
  });

  it('keeps default training choices focused on simple repeatable goals', () => {
    const fallbackGoals = trainingGoalsFor('build_consistency').map(goal => goal.value);

    expect(fallbackGoals).toEqual([
      'walking_more',
      'couch_to_5k',
      'general_fitness',
    ]);
    expect(fallbackGoals).not.toContain('play_sport');
    expect(fallbackGoals).not.toContain('sports_conditioning');
  });
});
