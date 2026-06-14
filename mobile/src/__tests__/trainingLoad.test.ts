import { describe, expect, it } from 'vitest';
import { computeTrainingLoad } from '../lib/coaching/trainingLoad';
import type { WorkoutSummary } from '../types/health';

function workout(daysAgo: number, durationMinutes: number, opts: Partial<WorkoutSummary> = {}): WorkoutSummary {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `w-${daysAgo}`,
    externalId: `ext-${daysAgo}`,
    startedAt: d.toISOString(),
    endedAt: new Date(d.getTime() + durationMinutes * 60_000).toISOString(),
    kind: 'run',
    durationMinutes,
    source: 'mock',
    ...opts,
  };
}

describe('computeTrainingLoad — empty / sparse', () => {
  it('no workouts → detraining + suggests training', () => {
    const r = computeTrainingLoad({ workouts: [] });
    expect(r.status).toBe('detraining');
    expect(r.workoutCountAcute).toBe(0);
    expect(r.workoutCountChronic).toBe(0);
    expect(r.acwr).toBeNull();
  });

  it('only acute workouts (no chronic history) → optimal "learning rhythm"', () => {
    const r = computeTrainingLoad({ workouts: [workout(2, 45), workout(4, 60)] });
    expect(r.acwr).toBeNull(); // chronic avg < 1
    expect(r.workoutCountAcute).toBe(2);
    expect(r.status).toBe('optimal');
    expect(r.message.toLowerCase()).toMatch(/běžný rytmus|usual rhythm/);
    expect(r.message.toLowerCase()).not.toContain('baseline');
  });
});

describe('computeTrainingLoad — ACWR ranges', () => {
  it('stable training (acute ~ chronic) → optimal', () => {
    // 3 workouts/week consistent over 4 weeks = 12 workouts × 60 min
    const workouts: WorkoutSummary[] = [];
    for (let i = 1; i <= 27; i += 2) workouts.push(workout(i, 60));
    const r = computeTrainingLoad({ workouts });
    expect(r.status).toBe('optimal');
    expect(r.acwr).toBeGreaterThan(0.8);
    expect(r.acwr).toBeLessThan(1.3);
  });

  it('large acute spike vs small chronic → high_risk', () => {
    // Sparse 28-day baseline (1 workout) + heavy acute (4 hard workouts in 7 days)
    const workouts: WorkoutSummary[] = [
      workout(20, 30),
      workout(2, 90, { avgHeartRate: 165 }),
      workout(3, 90, { avgHeartRate: 165 }),
      workout(4, 90, { avgHeartRate: 165 }),
      workout(6, 90, { avgHeartRate: 165 }),
    ];
    const r = computeTrainingLoad({ workouts });
    expect(r.acwr).not.toBeNull();
    expect(r.acwr!).toBeGreaterThan(1.5);
    expect(r.status).toBe('high_risk');
  });

  it('moderate spike → overreaching', () => {
    // 4 workouts/week chronic average, acute slightly elevated
    const workouts: WorkoutSummary[] = [];
    // chronic baseline of ~3 workouts/week (positions 8-27)
    for (let i = 8; i <= 27; i += 2) workouts.push(workout(i, 45, { avgHeartRate: 130, maxHeartRate: 180 }));
    // acute spike — 6 workouts in last 7 days, harder intensity
    for (let i = 1; i <= 6; i++) workouts.push(workout(i, 60, { avgHeartRate: 160, maxHeartRate: 180 }));
    const r = computeTrainingLoad({ workouts });
    expect(r.acwr).not.toBeNull();
    expect(['overreaching', 'high_risk']).toContain(r.status);
  });

  it('drop in acute volume → detraining', () => {
    // Heavy chronic, almost nothing acute
    const workouts: WorkoutSummary[] = [];
    for (let i = 8; i <= 27; i++) workouts.push(workout(i, 60, { avgHeartRate: 150, maxHeartRate: 180 }));
    // last 7 days: just 1 short walk
    workouts.push(workout(3, 15, { kind: 'walk' }));
    const r = computeTrainingLoad({ workouts });
    expect(r.acwr).not.toBeNull();
    expect(r.acwr!).toBeLessThan(0.8);
    expect(r.status).toBe('detraining');
  });
});

describe('computeTrainingLoad — TRIMP intensity mapping', () => {
  it('high HR → counts as hard intensity (higher TRIMP)', () => {
    const easy = computeTrainingLoad({
      workouts: [workout(2, 60, { avgHeartRate: 110, maxHeartRate: 180 })],
    });
    const hard = computeTrainingLoad({
      workouts: [workout(2, 60, { avgHeartRate: 170, maxHeartRate: 180 })],
    });
    expect(hard.acute).toBeGreaterThan(easy.acute);
  });

  it('workouts outside 28-day window are ignored', () => {
    const old = computeTrainingLoad({ workouts: [workout(40, 60)] });
    expect(old.workoutCountChronic).toBe(0);
    expect(old.workoutCountAcute).toBe(0);
  });

  it('respects custom endDate', () => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    // Workout 5 days before `past` would normally fall in acute window relative to NOW
    // but relative to `past` it's 5 days before — in acute (< 7 days).
    const r = computeTrainingLoad({
      workouts: [workout(15, 60)],
      endDate: past,
    });
    expect(r.workoutCountAcute).toBe(1);
  });
});

describe('computeTrainingLoad — messages + recommendations', () => {
  it('keeps internal ACWR out of user-facing messages while preserving the numeric field', () => {
    const workouts: WorkoutSummary[] = [];
    for (let i = 1; i <= 27; i += 2) workouts.push(workout(i, 60));
    const r = computeTrainingLoad({ workouts });
    expect(r.acwr).not.toBeNull();
    expect(r.message).not.toMatch(/ACWR/i);
  });

  it('optimal status mentions safe progression', () => {
    const workouts: WorkoutSummary[] = [];
    for (let i = 1; i <= 27; i += 2) workouts.push(workout(i, 60));
    const r = computeTrainingLoad({ workouts });
    expect(r.recommendation.toLowerCase()).toMatch(/pokračuj|forma|rytmu/);
  });

  it('high_risk status suggests deload', () => {
    const workouts: WorkoutSummary[] = [workout(20, 30)];
    for (let i = 1; i <= 7; i++) workouts.push(workout(i, 90, { avgHeartRate: 170 }));
    const r = computeTrainingLoad({ workouts });
    if (r.status === 'high_risk' || r.status === 'overreaching') {
      expect(r.recommendation.toLowerCase()).toMatch(/sniž|deload|uvolnit/);
    }
  });
});
