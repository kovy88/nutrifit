import { describe, it, expect } from 'vitest';
import { GOAL_QUICK_STARTS, quickStartsForScope, parseGoalText } from '../lib/onboarding/goal-parser';

describe('quick-start goals filtered by coach scope', () => {
  it('training-only nenabízí čistě nutriční cíle (jíst zdravěji, zhubnout tuk)', () => {
    const ids = quickStartsForScope('training').map(q => q.id);
    expect(ids).not.toContain('eat_healthier');
    expect(ids).not.toContain('lose_fat');
    // ...ale nabízí tréninkové/sportovní cíle
    expect(ids).toContain('improve_fitness');
    expect(ids).toContain('run_race');
    expect(ids).toContain('build_muscle');
    expect(ids).toContain('build_consistency');
  });

  it('nutrition-only nabízí dietní cíle, ne čistě tréninkové', () => {
    const ids = quickStartsForScope('nutrition').map(q => q.id);
    expect(ids).toContain('lose_fat');
    expect(ids).toContain('eat_healthier');
    expect(ids).not.toContain('run_race');
    expect(ids).not.toContain('improve_fitness');
  });

  it('both ukáže všechny quick-starty', () => {
    expect(quickStartsForScope('both')).toHaveLength(GOAL_QUICK_STARTS.length);
  });

  it('každý quick-start má neprázdné scopes a obsahuje "both" (both vidí vše)', () => {
    for (const q of GOAL_QUICK_STARTS) {
      expect(q.scopes.length, q.labelKey).toBeGreaterThan(0);
      expect(q.scopes, q.labelKey).toContain('both');
    }
  });

  it('text každého quick-startu se naparsuje zpět na jeho primaryGoal (round-trip)', () => {
    for (const q of GOAL_QUICK_STARTS) {
      const parsed = parseGoalText(q.text);
      expect(parsed.goalProfile, `"${q.text}" se musí naparsovat`).not.toBeNull();
      expect(parsed.goalProfile?.primaryGoal, `"${q.text}" → ${q.id}`).toBe(q.id);
    }
  });
});
