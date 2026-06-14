import { describe, it, expect } from 'vitest';
import { scoreReadiness } from '../lib/coaching/readiness';
import type { RecoveryInputs } from '../types/coach';

describe('scoreReadiness', () => {
  it('returns a high score + high band when all signals are good', () => {
    const input: RecoveryInputs = {
      todaySleepMinutes: 480,
      todayHrvMs: 60,
      todayRhrBpm: 52,
      baseline: { sleepMeanMinutes: 460, hrvMeanMs: 58, rhrMeanBpm: 54 },
    };
    const r = scoreReadiness(input);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.band).toBe('high');
    expect(r.recommendedIntensity).toBe('hard');
    expect(r.confidence).toBe('high'); // 3 objective signals
  });

  it('returns a low score + low band when sleep/HRV/RHR are all bad', () => {
    const input: RecoveryInputs = {
      todaySleepMinutes: 300, // 5h
      todayHrvMs: 18,
      todayRhrBpm: 92,
      baseline: { sleepMeanMinutes: 460, hrvMeanMs: 55, rhrMeanBpm: 54 },
    };
    const r = scoreReadiness(input);
    expect(r.score).toBeLessThan(40);
    expect(r.band).toBe('low');
    expect(['rest', 'easy']).toContain(r.recommendedIntensity);
    expect(r.drivers.length).toBeGreaterThan(0);
  });

  it('keeps readiness drivers free of raw recovery measurements', () => {
    const r = scoreReadiness({
      todaySleepMinutes: 300,
      todayHrvMs: 18,
      todayRhrBpm: 92,
      sleepDebtHours: 12,
      baseline: { sleepMeanMinutes: 460, hrvMeanMs: 55, rhrMeanBpm: 54 },
    });
    const text = r.drivers.join(' ');

    expect(text).toContain('Regenerace');
    expect(text).not.toMatch(/\bHRV\b|RHR|klidový tep|\d+\s*ms|\d+\s*bpm|\d+\/3/i);
  });

  it('degrades gracefully with no objective data (neutral score, low confidence)', () => {
    const r = scoreReadiness({});
    expect(r.score).toBe(55);
    expect(r.band).toBe('medium');
    expect(r.confidence).toBe('low');
    expect(r.drivers.some(d => /chybí|missing/i.test(d))).toBe(true);
  });

  it('low subjective energy pulls the score down', () => {
    const base: RecoveryInputs = { todaySleepMinutes: 450 };
    const neutral = scoreReadiness({ ...base, subjectiveEnergy: 3 });
    const tired = scoreReadiness({ ...base, subjectiveEnergy: 1 });
    expect(tired.score).toBeLessThan(neutral.score);
  });

  it('high subjective soreness pulls the score down', () => {
    const base: RecoveryInputs = { todaySleepMinutes: 450 };
    const fresh = scoreReadiness({ ...base, subjectiveSoreness: 1 });
    const sore = scoreReadiness({ ...base, subjectiveSoreness: 5 });
    expect(sore.score).toBeLessThan(fresh.score);
    expect(sore.drivers.some(d => /svalovka|soreness|pain/i.test(d))).toBe(true);
  });

  it('high ACWR (overload) reduces the score and is surfaced with user-facing copy', () => {
    const base: RecoveryInputs = { todaySleepMinutes: 450, todayHrvMs: 50, todayRhrBpm: 55 };
    const calm = scoreReadiness({ ...base, acwr: 1.0 });
    const overloaded = scoreReadiness({ ...base, acwr: 1.8 });
    expect(overloaded.score).toBeLessThan(calm.score);
    expect(overloaded.drivers.some(d => /zátěž|load/i.test(d))).toBe(true);
    expect(overloaded.drivers.some(d => /acwr/i.test(d))).toBe(false);
  });

  it('confidence reflects the number of objective signals', () => {
    const oneSignal = scoreReadiness({ todaySleepMinutes: 450 });
    expect(oneSignal.confidence).toBe('low');
    expect(oneSignal.drivers.some(d => /orientační|approximate/i.test(d))).toBe(true);
    expect(scoreReadiness({ todaySleepMinutes: 450, todayHrvMs: 50 }).confidence).toBe('medium');
    expect(scoreReadiness({ todaySleepMinutes: 450, todayHrvMs: 50, todayRhrBpm: 55 }).confidence).toBe('high');
  });

  it('always clamps the score to 0–100', () => {
    const worst = scoreReadiness({
      todaySleepMinutes: 120, todayHrvMs: 5, todayRhrBpm: 110,
      acwr: 2.5, sleepDebtHours: 20, recoveryDebt: 10, subjectiveEnergy: 1, subjectiveSoreness: 5,
    });
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(100);
  });

  it('emits English drivers when locale is en', () => {
    const r = scoreReadiness({ todaySleepMinutes: 300, baseline: { sleepMeanMinutes: 460 } }, 'en');
    expect(r.drivers.some(d => /sleep/i.test(d))).toBe(true);
  });
});
