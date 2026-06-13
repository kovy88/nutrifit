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
});
