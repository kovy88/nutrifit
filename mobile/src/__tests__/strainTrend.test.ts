import { describe, expect, it } from 'vitest';
import { __test__ } from '../hooks/useStrainTrend';
import type { WorkoutSummary } from '../lib/health';

function workout(durationMinutes: number, avgHr?: number, maxHr?: number): WorkoutSummary {
  return {
    id: 'w', externalId: 'ext',
    startedAt: '2026-05-28T10:00:00.000Z',
    endedAt: new Date(new Date('2026-05-28T10:00:00.000Z').getTime() + durationMinutes * 60_000).toISOString(),
    kind: 'run',
    durationMinutes,
    source: 'mock',
    ...(avgHr ? { avgHeartRate: avgHr } : {}),
    ...(maxHr ? { maxHeartRate: maxHr } : {}),
  };
}

describe('useStrainTrend — point computation helper', () => {
  it('no workouts → null (gap in trend chart)', () => {
    expect(__test__.strainPointForWorkouts([])).toBeNull();
  });

  it('one easy workout → score > 0', () => {
    const v = __test__.strainPointForWorkouts([workout(30, 110, 180)]);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0);
  });

  it('harder workout → higher score', () => {
    const easy = __test__.strainPointForWorkouts([workout(60, 110, 180)])!;
    const hard = __test__.strainPointForWorkouts([workout(60, 170, 180)])!;
    expect(hard).toBeGreaterThan(easy);
  });

  it('multiple workouts in the day sum to higher score than one', () => {
    const one = __test__.strainPointForWorkouts([workout(45, 130, 180)])!;
    const three = __test__.strainPointForWorkouts([
      workout(45, 130, 180),
      workout(45, 130, 180),
      workout(45, 130, 180),
    ])!;
    expect(three).toBeGreaterThan(one);
  });

  it('score is capped at 21 even with extreme load', () => {
    const v = __test__.strainPointForWorkouts([
      workout(180, 175, 185),
      workout(180, 175, 185),
      workout(180, 175, 185),
    ])!;
    expect(v).toBeLessThanOrEqual(21);
  });
});
