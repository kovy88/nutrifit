import { describe, it, expect } from 'vitest';
import {
  estimateWeeklyBaseKm,
  peakWeeklyKm,
  progressVolume,
  readinessSignal,
  generateTrainingPlan,
  TRAINING_RULES,
  type TrainingPlan,
} from '../lib/training/plan';
import {
  adjustPlanForTrainingCompletions,
  adjustedPlanSessionForDate,
  planSessionForDate,
  mondayOf,
  weekIndexFor,
  validateRaceGoalFeasibility,
  adjustTrainingForRecovery,
  adjustTrainingAfterMissedSession,
  validateTrainingPlanSafety,
} from '../lib/training';
import type { SleepSummary } from '../types/health';

const sleep = (totalMinutes: number, i = 1): SleepSummary => ({
  date: `2026-01-0${i}`, totalMinutes, source: 'manual',
});
const badSleep: SleepSummary[] = Array.from({ length: 5 }, (_, i) => sleep(320, i + 1));

describe('volume math', () => {
  it('peakWeeklyKm: marathon > half > 10k > 5k', () => {
    expect(peakWeeklyKm('marathon')).toBeGreaterThan(peakWeeklyKm('half_marathon'));
    expect(peakWeeklyKm('half_marathon')).toBeGreaterThan(peakWeeklyKm('run_10k'));
    expect(peakWeeklyKm('run_10k')).toBeGreaterThan(peakWeeklyKm('run_5k'));
  });

  it('progressVolume holds the 10% rule', () => {
    expect(progressVolume(30, 1, 60)).toBeCloseTo(33, 1);
    expect(progressVolume(30, 2, 60)).toBeCloseTo(36.3, 1);
  });

  it('every 4th week is a deload', () => {
    expect(progressVolume(30, 3, 60)).toBeLessThan(progressVolume(30, 2, 60));
  });

  it('never exceeds the peak', () => {
    expect(progressVolume(30, 10, 45)).toBeLessThanOrEqual(45);
  });

  it('falls back to the beginner minimum without a base', () => {
    expect(progressVolume(0, 0, 30)).toBeGreaterThanOrEqual(TRAINING_RULES.MIN_RUN_KM_BEGINNER);
  });

  it('estimateWeeklyBaseKm uses currentWeeklyKm when given, else null', () => {
    expect(estimateWeeklyBaseKm({ kind: 'marathon', currentWeeklyKm: 42 }, [])).toBe(42);
    expect(estimateWeeklyBaseKm({ kind: 'run_5k' }, [])).toBe(null);
  });
});

describe('readinessSignal', () => {
  it('low sleep → red', () => {
    expect(readinessSignal(badSleep)).toBe('red');
  });
  it('HRV drop ≥ 10% → red', () => {
    expect(readinessSignal([sleep(420)], 50, 60)).toBe('red');
  });
  it('all ok → green', () => {
    expect(readinessSignal([sleep(460)], 60, 60)).toBe('green');
  });
});

describe('generateTrainingPlan', () => {
  it('5k without history starts conservatively', () => {
    const plan = generateTrainingPlan({ goal: { kind: 'run_5k' }, weekStartISO: '2026-01-05', weekIndex: 0 });
    expect(plan.totalKm).toBeLessThanOrEqual(TRAINING_RULES.MIN_RUN_KM_BEGINNER + 1);
    expect(plan.warnings.some(w => w.includes('konzervativ'))).toBe(true);
  });

  it('marathon has long_run + strength + rest', () => {
    const plan = generateTrainingPlan({ goal: { kind: 'marathon', currentWeeklyKm: 60 }, weekStartISO: '2026-01-05', weekIndex: 2 });
    const kinds = plan.sessions.map(s => s.kind);
    expect(kinds).toContain('long_run');
    expect(kinds).toContain('strength');
    expect(kinds.filter(k => k === 'rest').length).toBeGreaterThanOrEqual(1);
  });

  it('bad sleep replaces the quality session with an easy run (no hard sessions)', () => {
    const plan = generateTrainingPlan({ goal: { kind: 'run_10k', currentWeeklyKm: 35 }, weekStartISO: '2026-01-05', recentSleep: badSleep });
    expect(plan.sessions.filter(s => s.intensity === 'hard').length).toBe(0);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('strength_basics has 3 strength days', () => {
    const plan = generateTrainingPlan({ goal: { kind: 'strength_basics' }, weekStartISO: '2026-01-05' });
    expect(plan.sessions.filter(s => s.kind === 'strength').length).toBe(3);
  });

  it('every session has a valid ISO date', () => {
    const plan = generateTrainingPlan({ goal: { kind: 'general_fitness' }, weekStartISO: '2026-01-05' });
    plan.sessions.forEach(s => expect(/^\d{4}-\d{2}-\d{2}$/.test(s.date)).toBe(true));
  });

  it('hyrox: ≥2 functional, run volume > 0, no swim/bike, bad sleep lowers intensity', () => {
    const plan = generateTrainingPlan({ goal: { kind: 'hyrox', currentWeeklyKm: 25 }, weekStartISO: '2026-01-05' });
    expect(plan.sessions.filter(s => s.kind === 'functional').length).toBeGreaterThanOrEqual(2);
    expect(plan.totalKm).toBeGreaterThan(0);
    expect(plan.sessions.every(s => s.kind !== 'swim' && s.kind !== 'bike')).toBe(true);
    const tired = generateTrainingPlan({ goal: { kind: 'hyrox', currentWeeklyKm: 25 }, weekStartISO: '2026-01-05', recentSleep: badSleep });
    expect(tired.sessions.filter(s => s.kind === 'functional').every(s => s.intensity !== 'hard')).toBe(true);
  });

  it('sprint triathlon: swim/bike/brick present with positive volumes', () => {
    const plan = generateTrainingPlan({ goal: { kind: 'sprint_triathlon' }, weekStartISO: '2026-01-05' });
    const kinds = plan.sessions.map(s => s.kind);
    expect(kinds).toContain('swim');
    expect(kinds).toContain('bike');
    expect(kinds).toContain('brick');
    expect(plan.totalSwimKm).toBeGreaterThan(0);
    expect(plan.totalBikeKm).toBeGreaterThan(0);
    expect(plan.sessions.find(s => s.kind === 'brick')?.distanceKm).toBeGreaterThan(0);
  });

  it('olympic triathlon has bigger volumes than sprint', () => {
    const sprint = generateTrainingPlan({ goal: { kind: 'sprint_triathlon' }, weekStartISO: '2026-01-05' });
    const olympic = generateTrainingPlan({ goal: { kind: 'olympic_triathlon' }, weekStartISO: '2026-01-05' });
    expect(olympic.totalSwimKm!).toBeGreaterThan(sprint.totalSwimKm!);
    expect(olympic.totalBikeKm!).toBeGreaterThan(sprint.totalBikeKm!);
  });

  it('OCR contains functional + long_run with run volume', () => {
    const plan = generateTrainingPlan({ goal: { kind: 'ocr', currentWeeklyKm: 20 }, weekStartISO: '2026-01-05' });
    const kinds = plan.sessions.map(s => s.kind);
    expect(kinds).toContain('functional');
    expect(kinds).toContain('long_run');
    expect(plan.totalKm).toBeGreaterThan(0);
  });

  it('all multi-sport goals produce 7 well-formed sessions', () => {
    const newKinds = ['hyrox', 'sprint_triathlon', 'olympic_triathlon', 'half_ironman', 'full_ironman', 'ocr'] as const;
    for (const kind of newKinds) {
      const plan = generateTrainingPlan({ goal: { kind }, weekStartISO: '2026-01-05' });
      expect(plan.sessions.length).toBe(7);
      plan.sessions.forEach(s => {
        expect(/^\d{4}-\d{2}-\d{2}$/.test(s.date)).toBe(true);
        expect(typeof s.title).toBe('string');
        expect(typeof s.intensity).toBe('string');
      });
    }
  });
});

describe('beginner goals', () => {
  it('walking_more: 7 sessions, no hard days, includes rest', () => {
    const plan = generateTrainingPlan({ goal: { kind: 'walking_more' }, weekStartISO: '2026-01-05' });
    expect(plan.sessions.length).toBe(7);
    expect(plan.sessions.every(s => s.intensity !== 'hard')).toBe(true);
    expect(plan.sessions.some(s => s.kind === 'rest')).toBe(true);
  });

  it('couch_to_5k: never hard, progresses with weekIndex, holds the 18 km cap', () => {
    const w0 = generateTrainingPlan({ goal: { kind: 'couch_to_5k' }, weekStartISO: '2026-01-05', weekIndex: 0 });
    const w2 = generateTrainingPlan({ goal: { kind: 'couch_to_5k' }, weekStartISO: '2026-01-19', weekIndex: 2 });
    expect(w0.sessions.every(s => s.intensity !== 'hard')).toBe(true);
    expect(w2.totalKm).toBeGreaterThan(w0.totalKm);
    expect(w2.totalKm).toBeLessThanOrEqual(18);
    expect(w0.warnings.length).toBeGreaterThan(0);
  });
});

describe('planSessionForDate adapter', () => {
  it('mondayOf returns the Monday of the week', () => {
    // 2026-01-08 is a Thursday → Monday is 2026-01-05
    expect(mondayOf(new Date('2026-01-08T12:00:00'))).toBe('2026-01-05');
  });

  it('weekIndexFor counts whole weeks from program start', () => {
    expect(weekIndexFor('2026-01-05', '2026-01-05')).toBe(0);
    expect(weekIndexFor('2026-01-05', '2026-01-19')).toBe(2);
    expect(weekIndexFor(undefined, '2026-01-19')).toBe(0);
  });

  it('returns a session whose date matches the requested day', () => {
    const s = planSessionForDate({ trainingGoal: 'run_10k' }, new Date('2026-01-07T12:00:00'));
    expect(s.date).toBe('2026-01-07');
    expect(typeof s.kind).toBe('string');
  });
});

describe('adjustPlanForTrainingCompletions', () => {
  it('returns the original plan without skipped completions', () => {
    const plan = fixturePlan();
    const result = adjustPlanForTrainingCompletions(plan, {
      '2026-01-05': completion('2026-01-05', 'completed', plan.sessions[0]),
    });

    expect(result.plan).toBe(plan);
    expect(result.skippedDates).toEqual([]);
    expect(result.adjustedDates).toEqual([]);
  });

  it('lowers later hard sessions after one skipped hard session without stacking a replacement', () => {
    const plan = fixturePlan();
    const result = adjustPlanForTrainingCompletions(plan, {
      '2026-01-05': completion('2026-01-05', 'skipped', plan.sessions[0]),
    });

    const skipped = result.plan.sessions.find(session => session.date === '2026-01-05');
    const laterHard = result.plan.sessions.find(session => session.date === '2026-01-07');
    const originalTotal = plan.sessions.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);
    const adjustedTotal = result.plan.sessions.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);

    expect(skipped?.kind).toBe('rest');
    expect(skipped?.durationMinutes).toBe(0);
    expect(laterHard?.intensity).toBe('easy');
    expect(laterHard?.durationMinutes).toBeLessThanOrEqual(plan.sessions[2].durationMinutes);
    expect(adjustedTotal).toBeLessThan(originalTotal);
    expect(result.adjustedDates).toContain('2026-01-07');
  });

  it('applies multiple skipped sessions chronologically and preserves rest days', () => {
    const plan = fixturePlan();
    const result = adjustPlanForTrainingCompletions(plan, {
      '2026-01-05': completion('2026-01-05', 'skipped', plan.sessions[0]),
      '2026-01-07': completion('2026-01-07', 'skipped', plan.sessions[2]),
    });

    expect(result.skippedDates).toEqual(['2026-01-05', '2026-01-07']);
    expect(result.plan.sessions.find(session => session.date === '2026-01-05')?.kind).toBe('rest');
    expect(result.plan.sessions.find(session => session.date === '2026-01-07')?.kind).toBe('rest');
    expect(result.plan.sessions.find(session => session.date === '2026-01-06')?.kind).toBe('rest');
    expect(result.plan.sessions.find(session => session.date === '2026-01-09')?.intensity).toBe('easy');
  });

  it('adjustedPlanSessionForDate uses skipped completions for later days', () => {
    const session = adjustedPlanSessionForDate(
      { trainingGoal: 'strength_basics' },
      new Date('2026-01-07T12:00:00'),
      {
        '2026-01-05': completion('2026-01-05', 'skipped', null),
      },
    );

    expect(session.date).toBe('2026-01-07');
    expect(session.intensity).toBe('easy');
    expect(session.title).toContain('úprava po vynechaném tréninku');
  });
});

function completion(
  date: string,
  status: 'completed' | 'skipped',
  plannedSession: TrainingPlan['sessions'][number] | null,
) {
  return {
    date,
    status,
    plannedSession,
    source: 'manual' as const,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
  };
}

function fixturePlan(): TrainingPlan {
  return {
    goalKind: 'run_10k',
    weekStartISO: '2026-01-05',
    weekIndex: 0,
    totalKm: 20,
    weeklyVolume: 20,
    longRunDistance: 8,
    sessions: [
      { date: '2026-01-05', kind: 'intervals', title: 'Intervaly', distanceKm: 5, durationMinutes: 35, intensity: 'hard' },
      { date: '2026-01-06', kind: 'rest', title: 'Volno', durationMinutes: 0, intensity: 'rest' },
      { date: '2026-01-07', kind: 'tempo', title: 'Tempo', distanceKm: 5, durationMinutes: 35, intensity: 'hard' },
      { date: '2026-01-08', kind: 'rest', title: 'Volno', durationMinutes: 0, intensity: 'rest' },
      { date: '2026-01-09', kind: 'intervals', title: 'Kvalita', distanceKm: 4, durationMinutes: 28, intensity: 'hard' },
      { date: '2026-01-10', kind: 'long_run', title: 'Long run', distanceKm: 6, durationMinutes: 42, intensity: 'moderate' },
      { date: '2026-01-11', kind: 'rest', title: 'Volno', durationMinutes: 0, intensity: 'rest' },
    ],
    warnings: [],
    intensityDistribution: { easy: 3, moderate: 1, hard: 3 },
  };
}

describe('Running Goals & Support Core Checks', () => {
  it('5K plan generation: generates safe sessions with strength and rest', () => {
    const plan = generateTrainingPlan({
      goal: { kind: 'run_5k', experience: 'beginner', runsPerWeek: 3 },
      weekStartISO: '2026-01-05',
    });
    expect(plan.sessions.length).toBe(7);
    expect(plan.sessions.some(s => s.kind === 'strength')).toBe(true);
    expect(plan.sessions.some(s => s.kind === 'rest')).toBe(true);
    expect(plan.sessions.some(s => s.kind === 'long_run')).toBe(true);
  });

  it('10K plan generation: calculates safe volume progression and weekly distribution', () => {
    const planW0 = generateTrainingPlan({
      goal: { kind: 'run_10k', currentWeeklyKm: 20, experience: 'intermediate', runsPerWeek: 4 },
      weekStartISO: '2026-01-05',
      weekIndex: 0,
    });
    const planW1 = generateTrainingPlan({
      goal: { kind: 'run_10k', currentWeeklyKm: 20, experience: 'intermediate', runsPerWeek: 4 },
      weekStartISO: '2026-01-12',
      weekIndex: 1,
    });
    // Checks that volume progresses and doesn't exceed 10% jump
    expect(planW1.totalKm).toBeLessThanOrEqual(planW0.totalKm * 1.1 + 0.1);
  });

  it('half marathon feasibility: realistic timeline vs unrealistic', () => {
    // 16 weeks target: realistic
    const res1 = validateRaceGoalFeasibility({
      trainingGoal: 'half_marathon',
      profile: {
        experience: 'intermediate',
        currentWeeklyKm: 30,
        longestRecentRunKm: 15,
        runsPerWeek: 4,
        raceDateISO: '2026-05-01', // ~17 weeks from local time
        injuryFlag: false,
      },
      todayISO: '2026-01-01',
    });
    expect(res1.verdict).toBe('feasible');

    // 4 weeks target: unrealistic
    const res2 = validateRaceGoalFeasibility({
      trainingGoal: 'half_marathon',
      profile: {
        experience: 'beginner',
        currentWeeklyKm: 5,
        longestRecentRunKm: 3,
        runsPerWeek: 2,
        raceDateISO: '2026-01-29', // 4 weeks
        injuryFlag: false,
      },
      todayISO: '2026-01-01',
    });
    expect(res2.verdict).toBe('unrealistic');
  });

  it('marathon feasibility: beginner marathon is blocked or warned', () => {
    // Beginner with no running history → unrealistic/blocked
    const res = validateRaceGoalFeasibility({
      trainingGoal: 'marathon',
      profile: {
        experience: 'beginner',
        currentWeeklyKm: 0,
        longestRecentRunKm: 0,
        runsPerWeek: 0,
        raceDateISO: '2026-06-01',
        injuryFlag: false,
      },
      todayISO: '2026-01-01',
    });
    expect(res.verdict).toBe('unrealistic');
    expect(res.reasons.some(r => r.includes('historie') || r.includes('začátečník') || r.includes('experience') || r.includes('běžecký základ') || r.includes('Marathon') || r.includes('blocked'))).toBe(true);
  });

  it('weekly volume progression handles deload weeks', () => {
    // Deload week (every 4th week is deload by ~30%)
    const normalPlan = generateTrainingPlan({
      goal: { kind: 'run_10k', currentWeeklyKm: 30 },
      weekStartISO: '2026-01-05',
      weekIndex: 2,
    });
    const deloadPlan = generateTrainingPlan({
      goal: { kind: 'run_10k', currentWeeklyKm: 30 },
      weekStartISO: '2026-01-12',
      weekIndex: 3, // Week index 3 is deload (0-indexed 3 = 4th week)
    });
    expect(deloadPlan.totalKm).toBeLessThan(normalPlan.totalKm);
  });

  it('low readiness adjustment downscales volume and intensity', () => {
    const plan = generateTrainingPlan({
      goal: { kind: 'run_10k', currentWeeklyKm: 30 },
      weekStartISO: '2026-01-05',
    });
    const adjusted = adjustTrainingForRecovery(plan, 'red');
    
    // Low readiness reduces volume and removes hard runs
    expect(adjusted.totalKm).toBeLessThan(plan.totalKm);
    expect(adjusted.sessions.filter(s => s.intensity === 'hard').length).toBe(0);
  });

  it('missed workout adjustment reschedules or scales back next sessions', () => {
    const plan = generateTrainingPlan({
      goal: { kind: 'run_10k', currentWeeklyKm: 30 },
      weekStartISO: '2026-01-05',
    });
    // Set date for sessions
    plan.sessions.forEach((s, i) => {
      s.date = `2026-01-0${i + 5}`;
    });
    
    // Simulate missing the first session (2026-01-05)
    const adjusted = adjustTrainingAfterMissedSession(plan, '2026-01-05');
    // Missed session gets flagged or scales down subsequent volume to prevent stacking
    const totalAdjustedKm = adjusted.sessions.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
    const totalOriginalKm = plan.sessions.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
    expect(totalAdjustedKm).toBeLessThan(totalOriginalKm);
  });

  it('safety validation flags marathon beginner and fat loss conflicts', () => {
    const plan = generateTrainingPlan({
      goal: { kind: 'marathon', experience: 'beginner', desiredWeightChangeKg: 8, timelineWeeks: 10 },
      weekStartISO: '2026-01-05',
    });
    
    const errors = validateTrainingPlanSafety(plan, 'beginner');
    expect(errors.length).toBeGreaterThan(0);
    // Beginner marathon is warned
    expect(errors.some(e => e.includes('maraton') || e.includes('půlmaraton'))).toBe(true);
    // Aggressive fat loss is warned
    expect(errors.some(e => e.includes('hubnutí') || e.includes('Kombinace'))).toBe(true);
  });
});
