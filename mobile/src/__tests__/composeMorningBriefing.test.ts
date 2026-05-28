import { describe, expect, it } from 'vitest';
import { composeMorningBriefing } from '../lib/coaching/composeMorningBriefing';
import { evaluateReadiness } from '../lib/coaching/readiness';
import { computeTrainingLoad } from '../lib/coaching/trainingLoad';
import type { TrainingSession, Macros } from '../types';
import type { WorkoutSummary } from '../types/health';

const macros: Macros = {
  kcal: 2400, protein: 180, carbs: 280, fat: 70, fiber: 36, waterMl: 2800,
  bmr: 1700, tdee: 2400, bmi: 23.0, goal: 'endurance',
};

const longRun: TrainingSession = {
  date: '2026-05-28', kind: 'long_run', title: 'Long run',
  durationMinutes: 90, intensity: 'moderate',
};

const intervals: TrainingSession = {
  date: '2026-05-28', kind: 'intervals', title: 'Intervaly',
  durationMinutes: 60, intensity: 'hard',
};

const restDay: TrainingSession = {
  date: '2026-05-28', kind: 'rest', title: 'Volno',
  durationMinutes: 0, intensity: 'rest',
};

// ── Headline rules ──────────────────────────────────────────────────────────

describe('composeMorningBriefing — headline shape', () => {
  it('rest day → "Volný den" headline, white emoji', () => {
    const b = composeMorningBriefing({
      session: restDay,
      readiness: null,
      trainingLoad: null,
      macros,
      baselineMacros: macros,
    });
    expect(b.emoji).toBe('⚪️');
    expect(b.headline.toLowerCase()).toContain('volný den');
  });

  it('no session → rest day default', () => {
    const b = composeMorningBriefing({
      session: null,
      readiness: null,
      trainingLoad: null,
      macros,
      baselineMacros: macros,
    });
    expect(b.headline.toLowerCase()).toContain('volný den');
  });

  it('green readiness + long run → "podle plánu" + 🟢', () => {
    const readiness = evaluateReadiness({ todaySleepMinutes: 480, todayRhrBpm: 58, todayHrvMs: 60 });
    expect(readiness.level).toBe('green');
    const b = composeMorningBriefing({ session: longRun, readiness, trainingLoad: null, macros, baselineMacros: macros });
    expect(b.emoji).toBe('🟢');
    expect(b.headline).toContain('Long run');
    expect(b.headline.toLowerCase()).toMatch(/podle plánu|můžeš jet/);
  });

  it('yellow readiness → headline mentions reduced readiness + 🟡', () => {
    const readiness = evaluateReadiness({ todaySleepMinutes: 390 });
    const b = composeMorningBriefing({ session: intervals, readiness, trainingLoad: null, macros, baselineMacros: macros });
    expect(b.emoji).toBe('🟡');
    expect(b.headline.toLowerCase()).toMatch(/snížen|mírně/);
  });

  it('red readiness → headline urges regeneration + 🔴', () => {
    const readiness = evaluateReadiness({ todaySleepMinutes: 240 });
    const b = composeMorningBriefing({ session: intervals, readiness, trainingLoad: null, macros, baselineMacros: macros });
    expect(b.emoji).toBe('🔴');
    expect(b.headline.toLowerCase()).toMatch(/regeneraci|regenera/);
  });

  it('intervals headline includes duration', () => {
    const b = composeMorningBriefing({ session: intervals, readiness: null, trainingLoad: null, macros, baselineMacros: macros });
    expect(b.headline).toContain('60 min');
  });
});

// ── Recommendation rules ────────────────────────────────────────────────────

describe('composeMorningBriefing — recommendation priority', () => {
  it('red readiness recommendation overrides everything else', () => {
    const readiness = evaluateReadiness({ todaySleepMinutes: 200 });
    const b = composeMorningBriefing({ session: intervals, readiness, trainingLoad: null, macros, baselineMacros: macros });
    expect(b.recommendation.toLowerCase()).toMatch(/lehk|spát|easy/);
  });

  it('overreaching ACWR + hard session → recommends shortening', () => {
    // 4 hard workouts last week + thin chronic baseline = elevated ACWR
    const workouts: WorkoutSummary[] = [];
    for (let i = 8; i <= 27; i += 2) workouts.push(makeWorkout(i, 45, 'mock'));
    for (let i = 1; i <= 6; i++) workouts.push(makeWorkout(i, 70, 'mock', 165));
    const trainingLoad = computeTrainingLoad({ workouts });
    if (trainingLoad.status === 'overreaching' || trainingLoad.status === 'high_risk') {
      const readiness = evaluateReadiness({ todaySleepMinutes: 470, todayRhrBpm: 60, todayHrvMs: 55 });
      const b = composeMorningBriefing({ session: intervals, readiness, trainingLoad, macros, baselineMacros: macros });
      expect(b.recommendation.toLowerCase()).toMatch(/zkrátit|sniž|deload|průměr|jednotku/);
    }
  });

  it('macro delta (training day) → recommends extra carbs', () => {
    const adjusted: Macros = { ...macros, kcal: macros.kcal + 380, carbs: macros.carbs + 95 };
    const b = composeMorningBriefing({
      session: longRun,
      readiness: null,
      trainingLoad: null,
      macros: adjusted,
      baselineMacros: macros,
    });
    expect(b.recommendation).toContain('95');
    expect(b.recommendation.toLowerCase()).toContain('sachari');
  });

  it('macro delta negative (rest day) → recommends fat/protein focus', () => {
    const adjusted: Macros = { ...macros, kcal: macros.kcal - 100, carbs: macros.carbs - 25, fat: macros.fat + 10 };
    const b = composeMorningBriefing({
      session: restDay,
      readiness: null,
      trainingLoad: null,
      macros: adjusted,
      baselineMacros: macros,
    });
    // restDay headline wins, but recommendation still reflects rest day character
    expect(b.recommendation.toLowerCase()).toMatch(/voda|tuk|bílkovin|kávy|lehčí/);
  });

  it('long_run default → mentions pre-fuel + hydration', () => {
    const b = composeMorningBriefing({
      session: longRun,
      readiness: null,
      trainingLoad: null,
      macros,
      baselineMacros: macros,
    });
    expect(b.recommendation.toLowerCase()).toMatch(/long.?run|snídan|vod/);
  });

  it('yellow readiness without overrides → "drž HR v zóně 2"', () => {
    const readiness = evaluateReadiness({ todaySleepMinutes: 390 });
    const b = composeMorningBriefing({ session: intervals, readiness, trainingLoad: null, macros, baselineMacros: macros });
    expect(b.recommendation.toLowerCase()).toMatch(/zóně 2|neforsír|hr/);
  });
});

// ── Detail line ─────────────────────────────────────────────────────────────

describe('composeMorningBriefing — detail facts', () => {
  it('shows readiness factors prioritised by severity', () => {
    const readiness = evaluateReadiness({
      todaySleepMinutes: 380,         // yellow
      todayRhrBpm: 60,                // green
      todayHrvMs: 18,                 // red
    });
    const b = composeMorningBriefing({ session: longRun, readiness, trainingLoad: null, macros, baselineMacros: macros });
    // First-shown fact should be the worst (HRV red)
    expect(b.detail.toLowerCase()).toContain('hrv');
  });

  it('includes ACWR in detail when load is measurable', () => {
    const workouts: WorkoutSummary[] = [];
    for (let i = 1; i <= 27; i += 2) workouts.push(makeWorkout(i, 50, 'mock'));
    const trainingLoad = computeTrainingLoad({ workouts });
    expect(trainingLoad.acwr).not.toBeNull();
    const b = composeMorningBriefing({ session: longRun, readiness: null, trainingLoad, macros, baselineMacros: macros });
    expect(b.detail.toLowerCase()).toContain('acwr');
  });

  it('detail empty when no signals at all', () => {
    const b = composeMorningBriefing({
      session: longRun,
      readiness: null,
      trainingLoad: null,
      macros,
      baselineMacros: macros,
    });
    expect(b.detail).toBe('');
  });

  it('does not include missing-data factors', () => {
    const readiness = evaluateReadiness({}); // all missing → all 'green'+missing
    const b = composeMorningBriefing({ session: longRun, readiness, trainingLoad: null, macros, baselineMacros: macros });
    expect(b.detail).toBe('');
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeWorkout(daysAgo: number, durationMinutes: number, source: 'mock' | 'manual', avgHr?: number): WorkoutSummary {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `w-${daysAgo}`,
    externalId: `ext-${daysAgo}`,
    startedAt: d.toISOString(),
    endedAt: new Date(d.getTime() + durationMinutes * 60_000).toISOString(),
    kind: 'run',
    durationMinutes,
    source,
    ...(avgHr ? { avgHeartRate: avgHr, maxHeartRate: 185 } : {}),
  };
}
