import { describe, it, expect } from 'vitest';
import { generateDailyCoachRecommendation, classifyToday, type DailyCoachInput } from '../lib/coaching/dailyCoach';
import type { Macros, TrainingSession } from '../types';

function makeMacros(kcal = 2200): Macros {
  return { kcal, protein: 150, carbs: 220, fat: 60, fiber: 30, waterMl: 2500, bmr: 1600, tdee: 2200, bmi: 23, goal: 'maintenance' };
}

function session(kind: TrainingSession['kind'], intensity: TrainingSession['intensity'], durationMinutes = 45): TrainingSession {
  return { date: '2026-05-30', kind, title: `${kind}`, durationMinutes, intensity };
}

const baseInput = (over: Partial<DailyCoachInput> = {}): DailyCoachInput => ({
  date: '2026-05-30',
  profile: { primaryGoal: 'lose_fat', experience: 'intermediate' },
  session: session('easy_run', 'easy', 40),
  recovery: { todaySleepMinutes: 460, todayHrvMs: 55, todayRhrBpm: 52, baseline: { sleepMeanMinutes: 455, hrvMeanMs: 54, rhrMeanBpm: 53 } },
  baselineMacros: makeMacros(2200),
  todayMacros: makeMacros(2300),
  trainingLoad: null,
  ...over,
});

describe('classifyToday', () => {
  it('returns rest focus for a null/rest session', () => {
    expect(classifyToday(null, 'hard').intensity).toBe('rest');
    expect(classifyToday(session('rest', 'rest', 0), 'hard').intensity).toBe('rest');
  });

  it('caps planned intensity at the readiness ceiling', () => {
    const hard = session('intervals', 'hard');
    expect(classifyToday(hard, 'easy').intensity).toBe('easy'); // ceiling wins
    expect(classifyToday(hard, 'hard').intensity).toBe('hard'); // plan allowed
  });
});

describe('generateDailyCoachRecommendation', () => {
  it('produces a full recommendation on a good readiness day', () => {
    const rec = generateDailyCoachRecommendation(baseInput());
    expect(rec.readiness.band).toBe('high');
    expect(rec.training!.session).not.toBeNull();
    expect(rec.training!.focus.length).toBeGreaterThan(0);
    expect(rec.coachNote.length).toBeGreaterThan(0);
    expect(rec.suggestedActions).toContain('ask_coach');
    expect(rec.nutrition!.deltaVsBaselineKcal).toBe(100);
  });

  it('downgrades a hard session and sets whatNotToDo when readiness is poor', () => {
    const rec = generateDailyCoachRecommendation(baseInput({
      session: session('intervals', 'hard', 50),
      recovery: { todaySleepMinutes: 300 }, // <6h → red assessment + low score
    }));
    expect(rec.readiness.band).toBe('low');
    expect(rec.training!.adjusted).toBe(true);
    expect(rec.training!.session?.intensity).not.toBe('hard');
    expect(rec.training!.whatNotToDo).toBeTruthy();
  });

  it('warns when a long-run day is not fueled above baseline', () => {
    const rec = generateDailyCoachRecommendation(baseInput({
      session: session('long_run', 'moderate', 90),
      baselineMacros: makeMacros(2400),
      todayMacros: makeMacros(2400), // no surplus
    }));
    expect(rec.nutrition!.reason.toLowerCase()).toContain('long run');
    expect(rec.warnings.some(w => /carb|sachar/i.test(w))).toBe(true);
  });

  it('cautions a beginner planning a hard session on a non-high day', () => {
    const rec = generateDailyCoachRecommendation(baseInput({
      profile: { primaryGoal: 'improve_fitness', experience: 'beginner' },
      session: session('intervals', 'hard'),
      recovery: { todaySleepMinutes: 380 }, // borderline → not high
    }));
    expect(rec.warnings.some(w => /beginner|začátečník/i.test(w))).toBe(true);
  });

  it('surfaces high training-load statuses as Today warnings', () => {
    const rec = generateDailyCoachRecommendation(baseInput({
      trainingLoad: {
        acute: 80,
        chronic: 50,
        acwr: 1.6,
        status: 'high_risk',
        message: 'Very fast load increase.',
        recommendation: 'Cut volume ~30% this week.',
        workoutCountAcute: 5,
        workoutCountChronic: 16,
      },
    }));
    expect(rec.warnings).toContain('Cut volume ~30% this week.');
  });

  it('handles a rest day (null session) without mark_done and never throws', () => {
    const rec = generateDailyCoachRecommendation(baseInput({ session: null, recovery: {} }));
    expect(rec.training!.session).toBeNull();
    expect(rec.suggestedActions).not.toContain('mark_done');
    expect(rec.readiness.score).toBeGreaterThanOrEqual(0);
    expect(rec.readiness.confidence).toBe('low');
    expect(rec.warnings.some(w => /bez dat|no sleep|guidance/i.test(w))).toBe(true);
  });

  it('does not present missing recovery data as a fully cleared hard day', () => {
    const rec = generateDailyCoachRecommendation(baseInput({
      session: session('intervals', 'hard', 50),
      recovery: {},
    }));
    expect(rec.readiness.confidence).toBe('low');
    expect(rec.training!.whatNotToDo).toBeTruthy();
    expect(rec.warnings.some(w => /bez dat|no sleep|orientační|guidance/i.test(w))).toBe(true);
  });
});

describe('coachScope gating', () => {
  it('training-only omits nutrition and never offers swap_meal', () => {
    const rec = generateDailyCoachRecommendation(baseInput({ profile: { primaryGoal: 'improve_running', experience: 'intermediate', coachScope: 'training' } }));
    expect(rec.scope).toBe('training');
    expect(rec.training).toBeTruthy();
    expect(rec.nutrition).toBeUndefined();
    expect(rec.suggestedActions).not.toContain('swap_meal');
  });

  it('nutrition-only omits training and never offers mark_done', () => {
    const rec = generateDailyCoachRecommendation(baseInput({ profile: { primaryGoal: 'lose_fat', experience: 'intermediate', coachScope: 'nutrition' } }));
    expect(rec.scope).toBe('nutrition');
    expect(rec.nutrition).toBeTruthy();
    expect(rec.training).toBeUndefined();
    expect(rec.suggestedActions).not.toContain('mark_done');
  });

  it('both (default) includes training and nutrition', () => {
    const rec = generateDailyCoachRecommendation(baseInput());
    expect(rec.scope).toBe('both');
    expect(rec.training).toBeTruthy();
    expect(rec.nutrition).toBeTruthy();
  });
});
