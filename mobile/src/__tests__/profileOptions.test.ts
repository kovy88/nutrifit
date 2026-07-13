import { describe, expect, it } from 'vitest';
import { PROFILE_NUTRITION_MODES, PROFILE_TRAINING_GOALS } from '../lib/profile/profile-options';

describe('profile MVP options', () => {
  it('keeps advanced training goals out of the profile editor', () => {
    expect(PROFILE_TRAINING_GOALS.map(goal => goal.value)).toEqual([
      'general_fitness',
      'walking_more',
      'couch_to_5k',
      'run_5k',
      'run_10k',
      'half_marathon',
      'strength_basics',
    ]);
    expect(PROFILE_TRAINING_GOALS.some(goal => goal.value === 'hyrox')).toBe(false);
  });

  it('keeps advanced nutrition modes internal', () => {
    const modes = PROFILE_NUTRITION_MODES.map(mode => mode.value);

    expect(modes).toEqual([
      'balanced',
      'fat_loss_friendly',
      'muscle_gain_friendly',
      'simple_meal_prep',
    ]);
    expect(modes).not.toContain('high_protein');
    expect(modes).not.toContain('budget_friendly');
    expect(modes).not.toContain('endurance_fueling');
  });
});
