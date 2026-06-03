import { describe, it, expect } from 'vitest';
import {
  estimateWeeklyBaseKm,
  peakWeeklyKm,
  progressVolume,
  readinessSignal,
  generateTrainingPlan,
  TRAINING_RULES,
} from '../lib/training/plan';
import { planSessionForDate, mondayOf, weekIndexFor } from '../lib/training';
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
