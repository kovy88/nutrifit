import { describe, expect, it } from 'vitest';
import { resolveGoalConflict, validateRaceGoalFeasibility } from '../lib/training/feasibility';

describe('training feasibility', () => {
  it('marks beginner marathon in 8 weeks as unrealistic', () => {
    const result = validateRaceGoalFeasibility({
      trainingGoal: 'marathon',
      todayISO: '2026-06-01',
      profile: {
        experience: 'beginner',
        raceDateISO: '2026-07-27',
        currentWeeklyKm: 10,
        longestRecentRunKm: 6,
        runsPerWeek: 2,
      },
    });

    expect(result.verdict).toBe('unrealistic');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.recommendation).toMatch(/half marathon|run-walk|later/i);
  });

  it('allows an intermediate half marathon with 16 weeks and a solid base', () => {
    const result = validateRaceGoalFeasibility({
      trainingGoal: 'half_marathon',
      todayISO: '2026-06-01',
      profile: {
        experience: 'intermediate',
        raceDateISO: '2026-09-21',
        currentWeeklyKm: 25,
        longestRecentRunKm: 14,
        runsPerWeek: 4,
      },
    });

    expect(result.verdict).toBe('feasible');
    expect(result.weeksUntilRace).toBe(16);
    expect(result.safePeakByRaceKm).toBeGreaterThanOrEqual(result.requiredPeakKm);
  });

  it('flags fat-loss primary goal combined with marathon build', () => {
    const result = resolveGoalConflict('lose_fat', 'marathon');

    expect(result.conflict).toBeTruthy();
    expect(result.conflict?.boundedNutrition).toBe('mild_deficit');
    expect(result.allowedTrainingGoals).not.toContain('marathon');
  });

  it('treats invalid race dates as missing instead of producing NaN', () => {
    const result = validateRaceGoalFeasibility({
      trainingGoal: 'half_marathon',
      todayISO: '2026-06-01',
      profile: {
        experience: 'intermediate',
        raceDateISO: '2026-13-40',
        currentWeeklyKm: 25,
        longestRecentRunKm: 14,
        runsPerWeek: 4,
      },
    });

    expect(result.weeksUntilRace).toBe(0);
    expect(result.safePeakByRaceKm).toBeGreaterThan(0);
    expect(result.verdict).toBe('unrealistic');
  });
});
