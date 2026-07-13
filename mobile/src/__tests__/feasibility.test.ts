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
    expect(result.recommendation).toBe('unrealistic_marathon');
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

  it('allows a 5K when the runner has enough time and a small base', () => {
    const result = validateRaceGoalFeasibility({
      trainingGoal: 'run_5k',
      todayISO: '2026-06-01',
      profile: {
        experience: 'beginner',
        raceDateISO: '2026-08-24',
        currentWeeklyKm: 15,
        longestRecentRunKm: 5,
        runsPerWeek: 3,
      },
    });

    expect(result.verdict).toBe('feasible');
    expect(result.requiredPeakKm).toBe(30);
  });

  it('marks a 10K as tight when weekly frequency is low but ramp is possible', () => {
    const result = validateRaceGoalFeasibility({
      trainingGoal: 'run_10k',
      todayISO: '2026-06-01',
      profile: {
        experience: 'intermediate',
        raceDateISO: '2026-09-07',
        currentWeeklyKm: 18,
        longestRecentRunKm: 8,
        runsPerWeek: 2,
      },
    });

    expect(result.verdict).toBe('tight');
    expect(result.reasons).toContain('low_frequency');
  });

  it('flags fat-loss primary goal combined with marathon build', () => {
    const result = resolveGoalConflict('lose_fat', 'marathon');

    expect(result.conflict).toBeTruthy();
    expect(result.conflict?.boundedNutrition).toBe('mild_deficit');
    expect(result.allowedTrainingGoals).not.toContain('marathon');
  });

  it('hard-flags recent injury for half marathon even with adequate base', () => {
    const result = validateRaceGoalFeasibility({
      trainingGoal: 'half_marathon',
      todayISO: '2026-06-01',
      profile: {
        experience: 'advanced',
        raceDateISO: '2026-10-19',
        currentWeeklyKm: 40,
        longestRecentRunKm: 18,
        runsPerWeek: 5,
        injuryFlag: true,
      },
    });

    expect(result.verdict).toBe('unrealistic');
    expect(result.reasons).toContain('recent_injury');
  });

  it('recommends shorter alternatives for an unrealistic marathon build from low weekly km', () => {
    const result = validateRaceGoalFeasibility({
      trainingGoal: 'marathon',
      todayISO: '2026-06-01',
      profile: {
        experience: 'beginner',
        raceDateISO: '2026-09-14',
        currentWeeklyKm: 6,
        longestRecentRunKm: 5,
        runsPerWeek: 2,
      },
    });

    expect(result.verdict).toBe('unrealistic');
    expect(result.safePeakByRaceKm).toBeLessThan(result.requiredPeakKm * 0.72);
    expect(result.recommendation).toBe('unrealistic_marathon');
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
