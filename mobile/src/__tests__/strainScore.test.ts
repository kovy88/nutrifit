import { describe, expect, it } from 'vitest';
import { computeDailyStrain } from '../lib/coaching/strainScore';
import type { TrainingSession } from '../types';
import type { WorkoutSummary } from '../types/health';

function workout(durationMinutes: number, avgHr?: number, maxHr?: number): WorkoutSummary {
  return {
    id: 'w',
    externalId: 'ext',
    startedAt: '2026-05-28T10:00:00.000Z',
    endedAt: new Date(new Date('2026-05-28T10:00:00.000Z').getTime() + durationMinutes * 60_000).toISOString(),
    kind: 'run',
    durationMinutes,
    source: 'mock',
    ...(avgHr ? { avgHeartRate: avgHr } : {}),
    ...(maxHr ? { maxHeartRate: maxHr } : {}),
  };
}

function session(kind: TrainingSession['kind'], intensity: TrainingSession['intensity'], durationMinutes: number): TrainingSession {
  return { date: '2026-05-28', kind, title: kind, durationMinutes, intensity };
}

describe('computeDailyStrain — bands', () => {
  it('rest day with no workouts → recovery + score 0', () => {
    const r = computeDailyStrain({ plannedSession: session('rest', 'rest', 0), todaysWorkouts: [] });
    expect(r.score).toBe(0);
    expect(r.band).toBe('recovery');
    expect(r.workoutCount).toBe(0);
  });

  it('planned easy 30min only → light band', () => {
    const r = computeDailyStrain({ plannedSession: session('easy_run', 'easy', 30), todaysWorkouts: [] });
    expect(r.band).toBe('light');
    expect(r.score).toBeGreaterThan(2);
    expect(r.score).toBeLessThan(7);
  });

  it('planned hard 60min → moderate-to-high', () => {
    const r = computeDailyStrain({ plannedSession: session('intervals', 'hard', 60), todaysWorkouts: [] });
    expect(['moderate', 'high']).toContain(r.band);
    expect(r.score).toBeGreaterThan(10);
  });

  it('all-out: very long hard workout actually completed → high/all_out band', () => {
    const r = computeDailyStrain({
      plannedSession: null,
      todaysWorkouts: [workout(180, 170, 185)], // 3h at avgHR 170
    });
    expect(['high', 'all_out']).toContain(r.band);
    expect(r.score).toBeGreaterThanOrEqual(14);
  });

  it('score never exceeds 21', () => {
    const r = computeDailyStrain({
      plannedSession: null,
      todaysWorkouts: [
        workout(180, 170, 185),
        workout(180, 170, 185),
        workout(180, 170, 185),
      ],
    });
    expect(r.score).toBeLessThanOrEqual(21);
  });
});

describe('computeDailyStrain — completed workouts override planned', () => {
  it('actual workouts override the planned session', () => {
    // Planned hard 90min, but user actually only walked 20min — score reflects reality.
    const r = computeDailyStrain({
      plannedSession: session('intervals', 'hard', 90),
      todaysWorkouts: [workout(20, 100, 180)], // very easy
    });
    // TRIMP should be from the workout (~20 * 1.0 = 20), not the plan (~180)
    expect(r.trimp).toBeLessThan(50);
    expect(r.band).toBe('light');
  });

  it('multiple workouts sum to a higher total', () => {
    const one = computeDailyStrain({
      plannedSession: null,
      todaysWorkouts: [workout(45, 130, 180)],
    });
    const two = computeDailyStrain({
      plannedSession: null,
      todaysWorkouts: [workout(45, 130, 180), workout(30, 150, 180)],
    });
    expect(two.score).toBeGreaterThan(one.score);
    expect(two.workoutCount).toBe(2);
  });
});

describe('computeDailyStrain — HR-based intensity scaling', () => {
  it('high HR ratio scales TRIMP higher than low HR same duration', () => {
    const easy = computeDailyStrain({ plannedSession: null, todaysWorkouts: [workout(60, 110, 180)] });
    const hard = computeDailyStrain({ plannedSession: null, todaysWorkouts: [workout(60, 165, 180)] });
    expect(hard.score).toBeGreaterThan(easy.score);
  });

  it('no HR data falls back to unknown factor (~1.2x)', () => {
    const r = computeDailyStrain({ plannedSession: null, todaysWorkouts: [workout(60)] });
    expect(r.trimp).toBe(72); // 60 * 1.2
  });
});

describe('computeDailyStrain — recommendations', () => {
  it('moderate band recommends post-workout protein', () => {
    const r = computeDailyStrain({ plannedSession: null, todaysWorkouts: [workout(75, 150, 180)] });
    if (r.band === 'moderate') {
      expect(r.recommendation.toLowerCase()).toMatch(/bílkovin|regenerac|spánek/);
    }
  });

  it('all_out band warns about rest day tomorrow', () => {
    const r = computeDailyStrain({
      plannedSession: null,
      todaysWorkouts: [workout(180, 175, 185), workout(120, 170, 185)],
    });
    if (r.band === 'all_out') {
      expect(r.recommendation.toLowerCase()).toMatch(/volno|regenerační|zítra|vydatněji/);
    }
  });

  it('recovery band suggests light activity for tomorrow', () => {
    const r = computeDailyStrain({ plannedSession: null, todaysWorkouts: [] });
    expect(r.band).toBe('recovery');
    expect(r.recommendation.toLowerCase()).toMatch(/lehkou|zítra/);
  });

  it('keeps high-load recommendations free of raw recovery jargon', () => {
    const r = computeDailyStrain({
      plannedSession: null,
      todaysWorkouts: [workout(120, 170, 185)],
      locale: 'en',
    });
    expect(['high', 'all_out']).toContain(r.band);
    expect(r.recommendation).toMatch(/load|lighter|recovery|refuel|eat/i);
    expect(`${r.label} ${r.recommendation}`).not.toMatch(/strain|all-out|HRV|RHR|resting HR|carb refuel|easy \+/i);
  });
});
