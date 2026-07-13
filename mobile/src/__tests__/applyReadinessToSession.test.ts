import { describe, expect, it } from 'vitest';
import { applyReadinessToSession } from '../lib/coaching/applyReadinessToSession';
import { evaluateReadiness } from '../lib/coaching/readiness';
import type { TrainingSession } from '../types';

function hardIntervals(): TrainingSession {
  return {
    date: '2026-05-27',
    kind: 'intervals',
    title: 'Intervaly 6×400 m',
    durationMinutes: 60,
    intensity: 'hard',
  };
}

function moderateRun(): TrainingSession {
  return {
    date: '2026-05-27',
    kind: 'easy_run',
    title: 'Středně dlouhý běh',
    durationMinutes: 50,
    intensity: 'moderate',
  };
}

function restDay(): TrainingSession {
  return {
    date: '2026-05-27',
    kind: 'rest',
    title: 'Volno',
    durationMinutes: 0,
    intensity: 'rest',
  };
}

describe('applyReadinessToSession', () => {
  it('returns original session when assessment is null', () => {
    const session = hardIntervals();
    const out = applyReadinessToSession(session, null);
    expect(out.adjusted).toBe(false);
    expect(out.session).toEqual(session);
  });

  it('returns original on green readiness (no adjustment)', () => {
    const assessment = evaluateReadiness({ todaySleepMinutes: 480, todayRhrBpm: 60, todayHrvMs: 50 });
    const out = applyReadinessToSession(hardIntervals(), assessment);
    expect(out.adjusted).toBe(false);
  });

  it('downgrades hard intervals to easy_run on red day', () => {
    const assessment = evaluateReadiness({ todaySleepMinutes: 240 }); // red
    const out = applyReadinessToSession(hardIntervals(), assessment, 'cs');
    expect(out.adjusted).toBe(true);
    expect(out.session.intensity).toBe('easy');
    expect(out.session.kind).toBe('easy_run');
    expect(out.session.title).toContain('Lehký běh');
    // Duration drops ~30%
    expect(out.session.durationMinutes).toBe(Math.round(60 * 0.7));
    expect(out.reason).toBeTruthy();
  });

  it('downgrades hard to moderate on yellow day (single yellow factor)', () => {
    const assessment = evaluateReadiness({ todaySleepMinutes: 390, todayRhrBpm: 60, todayHrvMs: 50 });
    expect(assessment.level).toBe('yellow');
    const out = applyReadinessToSession(hardIntervals(), assessment);
    expect(out.adjusted).toBe(true);
    expect(out.session.intensity).toBe('moderate');
    // Hard kind preserved as kind, only intensity drops
    expect(out.session.kind).toBe('intervals');
    expect(out.session.durationMinutes).toBe(Math.round(60 * 0.85));
  });

  it('localizes preserved titles when downgrading in English', () => {
    const assessment = evaluateReadiness({ todaySleepMinutes: 390, todayRhrBpm: 60, todayHrvMs: 50 });
    const out = applyReadinessToSession(hardIntervals(), assessment, 'en');
    expect(out.adjusted).toBe(true);
    expect(out.session.title).toBe('Intervals 6×400 m (reduced intensity)');
  });

  it('does NOT modify a moderate session on yellow day', () => {
    const assessment = evaluateReadiness({ todaySleepMinutes: 390 });
    const out = applyReadinessToSession(moderateRun(), assessment);
    // yellow target = 'moderate', original already 'moderate' → no adjustment
    expect(out.adjusted).toBe(false);
  });

  it('downgrades moderate session to easy on red day', () => {
    const assessment = evaluateReadiness({ todaySleepMinutes: 200 });
    const out = applyReadinessToSession(moderateRun(), assessment);
    expect(out.adjusted).toBe(true);
    expect(out.session.intensity).toBe('easy');
    // kind 'easy_run' stays kind 'easy_run' (not hard kind), just intensity drops
    expect(out.session.kind).toBe('easy_run');
  });

  it('never modifies rest day', () => {
    const assessment = evaluateReadiness({ todaySleepMinutes: 200 });
    const out = applyReadinessToSession(restDay(), assessment);
    expect(out.adjusted).toBe(false);
    expect(out.session.kind).toBe('rest');
  });

  it('never upgrades (easy stays easy even on green)', () => {
    const easy: TrainingSession = { ...moderateRun(), intensity: 'easy', kind: 'easy_run' };
    const assessment = evaluateReadiness({ todaySleepMinutes: 480, todayRhrBpm: 60, todayHrvMs: 60 });
    const out = applyReadinessToSession(easy, assessment);
    expect(out.adjusted).toBe(false);
  });

  it('preserves a minimum 20-minute duration even on aggressive downgrade', () => {
    const tinyHard: TrainingSession = { ...hardIntervals(), durationMinutes: 15 };
    const assessment = evaluateReadiness({ todaySleepMinutes: 200 });
    const out = applyReadinessToSession(tinyHard, assessment);
    expect(out.session.durationMinutes).toBeGreaterThanOrEqual(20);
  });
});
