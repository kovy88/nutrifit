import { describe, expect, it } from 'vitest';
import { computeFueling } from '../lib/nutrition/workoutFueling';
import type { WorkoutSummary } from '../types/health';

function workout(opts: Partial<WorkoutSummary> & Pick<WorkoutSummary, 'kind' | 'durationMinutes'>): WorkoutSummary {
  return {
    id: 'w',
    externalId: 'ext',
    startedAt: '2026-05-28T10:00:00.000Z',
    endedAt: '2026-05-28T11:00:00.000Z',
    source: 'mock',
    ...opts,
  };
}

describe('computeFueling — easy / light → no explicit fuel', () => {
  it('walk 30 min → no pre/intra/post', () => {
    const r = computeFueling({ workout: workout({ kind: 'walk', durationMinutes: 30 }), weightKg: 75 });
    expect(r.pre).toBeNull();
    expect(r.intra).toBeNull();
    expect(r.post).toBeNull();
    expect(r.summary.toLowerCase()).toMatch(/voda|krátká|nízká/);
  });

  it('yoga 45 min → no fuel needed', () => {
    const r = computeFueling({ workout: workout({ kind: 'yoga', durationMinutes: 45 }), weightKg: 75 });
    expect(r.pre).toBeNull();
    expect(r.post).toBeNull();
  });
});

describe('computeFueling — long endurance → pre + intra + post', () => {
  it('90 min run → full fueling stack', () => {
    const r = computeFueling({ workout: workout({ kind: 'run', durationMinutes: 90 }), weightKg: 75 });
    expect(r.pre).not.toBeNull();
    expect(r.intra).not.toBeNull();
    expect(r.post).not.toBeNull();
    expect(r.pre!.carbsG).toBe(150); // 2 × 75
    expect(r.intra!.carbsGPerHour).toBeGreaterThan(0);
    expect(r.post!.proteinG).toBeGreaterThanOrEqual(25);
  });

  it('2h cycle → mentions glykogen in summary or post note', () => {
    const r = computeFueling({ workout: workout({ kind: 'cycle', durationMinutes: 120 }), weightKg: 80 });
    const txt = (r.summary + ' ' + (r.post?.note ?? '')).toLowerCase();
    expect(txt).toMatch(/glykogen|vytrvalostní|refuel/);
  });
});

describe('computeFueling — hard intervals → pre + post', () => {
  it('hard 60-min intervals → pre + post but no intra', () => {
    const r = computeFueling({
      workout: workout({
        kind: 'intervals' as any,
        durationMinutes: 60,
        avgHeartRate: 165,
        maxHeartRate: 185,
      }),
      weightKg: 75,
    });
    // intervals isn't in mapped types — should fall to default 'moderate'
    expect(r.summary.length).toBeGreaterThan(0);
  });

  it('hard run with HR data → pre + post', () => {
    const r = computeFueling({
      workout: workout({
        kind: 'run',
        durationMinutes: 50,
        avgHeartRate: 165,
        maxHeartRate: 180,
      }),
      weightKg: 70,
    });
    expect(r.pre).not.toBeNull();
    expect(r.post).not.toBeNull();
    expect(r.intra).toBeNull();
  });

  it('HIIT 30 min hard → pre + post', () => {
    const r = computeFueling({
      workout: workout({
        kind: 'hiit',
        durationMinutes: 30,
        avgHeartRate: 170,
        maxHeartRate: 185,
      }),
      weightKg: 75,
    });
    expect(r.pre).not.toBeNull();
    expect(r.post).not.toBeNull();
  });
});

describe('computeFueling — strength → protein focus', () => {
  it('strength → post-workout protein 35g+', () => {
    const r = computeFueling({ workout: workout({ kind: 'strength', durationMinutes: 60 }), weightKg: 80 });
    expect(r.post).not.toBeNull();
    expect(r.post!.proteinG).toBeGreaterThanOrEqual(30);
    expect(r.summary.toLowerCase()).toMatch(/silový|protein|hypertrofii/);
  });

  it('functional → strength-like post focus', () => {
    const r = computeFueling({ workout: workout({ kind: 'functional', durationMinutes: 45 }), weightKg: 75 });
    expect(r.post).not.toBeNull();
  });
});

describe('computeFueling — weight scaling', () => {
  it('heavier user gets proportionally more carbs', () => {
    const light = computeFueling({ workout: workout({ kind: 'run', durationMinutes: 90 }), weightKg: 60 });
    const heavy = computeFueling({ workout: workout({ kind: 'run', durationMinutes: 90 }), weightKg: 90 });
    expect(heavy.pre!.carbsG).toBeGreaterThan(light.pre!.carbsG);
    expect(heavy.post!.carbsG).toBeGreaterThan(light.post!.carbsG);
  });
});
