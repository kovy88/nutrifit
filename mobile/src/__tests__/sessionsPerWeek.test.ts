import { describe, expect, it } from 'vitest';
import { fitPlanToSessionsPerWeek, planForDate } from '../lib/training';
import { adjustForDay } from '../utils/nutrition';
import type { TrainingSession } from '../types';

const profile = {
  trainingGoal: 'strength_basics',
  primaryGoal: 'gain_muscle',
  experience: 'intermediate',
  weight: 78,
  programStartISO: '2026-10-19',
} as any;

function mainSessions(sessions: TrainingSession[]) {
  return sessions.filter(s => s.kind !== 'rest' && s.kind !== 'mobility' && s.intensity !== 'rest');
}

describe('fitPlanToSessionsPerWeek', () => {
  it('trims the template to the sessions/week the user picked', () => {
    const date = new Date('2026-10-21T12:00:00');
    expect(mainSessions(planForDate({ ...profile, sessionsPerWeek: 4 }, date).sessions)).toHaveLength(4);
    expect(mainSessions(planForDate({ ...profile, sessionsPerWeek: 2 }, date).sessions)).toHaveLength(2);
  });

  it('drops the easiest session first and keeps the long run', () => {
    const s = (kind: TrainingSession['kind'], intensity: TrainingSession['intensity']): TrainingSession =>
      ({ date: '2026-10-19', kind, title: kind, durationMinutes: 40, intensity });
    const plan = {
      goalKind: 'run_10k', weekStartISO: '2026-10-19', weekIndex: 0, totalKm: 0, warnings: [],
      sessions: [s('intervals', 'hard'), s('easy_run', 'easy'), s('long_run', 'moderate'), s('strength', 'moderate')],
    } as any;
    const kinds = fitPlanToSessionsPerWeek(plan, 2).sessions.map(x => x.kind);
    expect(kinds).toEqual(['intervals', 'rest', 'long_run', 'rest']);
  });

  it('never adds sessions when the template has fewer than requested', () => {
    const date = new Date('2026-10-21T12:00:00');
    const plan = planForDate({ ...profile, sessionsPerWeek: 7 }, date);
    expect(mainSessions(plan.sessions)).toHaveLength(4);
  });
});

describe('adjustForDay training-day energy', () => {
  const baseline = { kcal: 3000, protein: 160, carbs: 380, fat: 90, tdee: 2900 } as any;

  it('does not add calories for a normal session already covered by the activity factor', () => {
    const res = adjustForDay(baseline, { date: '2026-10-19', kind: 'strength', title: 'Full body', durationMinutes: 45, intensity: 'hard' }, { weight: 78 });
    expect(res.macros.kcal).toBe(baseline.kcal);
    expect(res.macros.carbs).toBeGreaterThan(baseline.carbs);
    expect(res.macros.fat).toBeLessThan(baseline.fat);
  });

  it('keeps fat above a 0.7 g/kg floor', () => {
    const lowFat = { ...baseline, fat: 58 };
    const res = adjustForDay(lowFat, { date: '2026-10-19', kind: 'intervals', title: 'HIIT', durationMinutes: 50, intensity: 'hard' }, { weight: 78 });
    expect(res.macros.fat).toBeGreaterThanOrEqual(Math.round(78 * 0.7));
  });
});
