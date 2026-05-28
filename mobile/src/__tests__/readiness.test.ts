import { describe, expect, it } from 'vitest';
import { evaluateReadiness } from '../lib/coaching/readiness';

describe('evaluateReadiness — single-signal severity', () => {
  it('all data within healthy norms → green', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 480, todayRhrBpm: 60, todayHrvMs: 50 });
    expect(r.level).toBe('green');
    expect(r.trainingAdjustment).toBeNull();
    expect(r.factors.find(f => f.key === 'sleep_ok')).toBeDefined();
    expect(r.factors.find(f => f.key === 'hrv_ok')).toBeDefined();
    expect(r.factors.find(f => f.key === 'rhr_ok')).toBeDefined();
  });

  it('sleep under 6 h alone → red', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 320, todayRhrBpm: 60, todayHrvMs: 50 });
    expect(r.level).toBe('red');
    expect(r.factors.find(f => f.key === 'sleep_short')).toBeDefined();
    expect(r.trainingAdjustment).toBe('reduce_to_easy');
  });

  it('sleep 6–7 h alone → yellow', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 390, todayRhrBpm: 60, todayHrvMs: 50 });
    expect(r.level).toBe('yellow');
    expect(r.trainingAdjustment).toBe('reduce_to_moderate');
  });

  it('HRV under 25 ms → red', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 480, todayRhrBpm: 60, todayHrvMs: 20 });
    expect(r.level).toBe('red');
    expect(r.factors.find(f => f.key === 'hrv_low')).toBeDefined();
  });

  it('HRV 25–35 ms → yellow', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 480, todayRhrBpm: 60, todayHrvMs: 30 });
    expect(r.level).toBe('yellow');
  });

  it('RHR > 85 → red', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 480, todayRhrBpm: 90, todayHrvMs: 50 });
    expect(r.level).toBe('red');
    expect(r.factors.find(f => f.key === 'rhr_high')).toBeDefined();
  });

  it('RHR 75–85 → yellow', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 480, todayRhrBpm: 78, todayHrvMs: 50 });
    expect(r.level).toBe('yellow');
  });
});

describe('evaluateReadiness — aggregation rules', () => {
  it('two yellow factors → escalate to red', () => {
    // Sleep yellow (6.5h) + HRV yellow (30 ms)
    const r = evaluateReadiness({ todaySleepMinutes: 390, todayRhrBpm: 60, todayHrvMs: 30 });
    expect(r.level).toBe('red');
    expect(r.trainingAdjustment).toBe('reduce_to_easy');
  });

  it('one yellow factor stays yellow', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 390, todayRhrBpm: 60, todayHrvMs: 50 });
    expect(r.level).toBe('yellow');
  });

  it('one red trumps any green', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 200, todayRhrBpm: 55, todayHrvMs: 60 });
    expect(r.level).toBe('red');
  });

  it('red + yellow stays red', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 200, todayRhrBpm: 80, todayHrvMs: 50 });
    expect(r.level).toBe('red');
  });
});

describe('evaluateReadiness — missing data', () => {
  it('all signals missing → green with "no data" recommendation', () => {
    const r = evaluateReadiness({});
    expect(r.level).toBe('green');
    expect(r.recommendation).toContain('Nemáme');
    expect(r.trainingAdjustment).toBeNull();
    expect(r.factors.every(f => f.key.endsWith('_missing'))).toBe(true);
  });

  it('only sleep present (low) still triggers red even without HRV/RHR', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 300 });
    expect(r.level).toBe('red');
  });

  it('only HRV missing, others normal → green', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 480, todayRhrBpm: 60 });
    expect(r.level).toBe('green');
  });

  it('null is treated same as undefined', () => {
    const r = evaluateReadiness({ todaySleepMinutes: null, todayRhrBpm: null, todayHrvMs: null });
    expect(r.level).toBe('green');
  });
});

describe('evaluateReadiness — recommendations', () => {
  it('red day mentions regeneration', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 240 });
    expect(r.recommendation.toLowerCase()).toMatch(/regeneraci|sniž|zkrať/);
  });

  it('yellow day suggests caution but lets user train', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 390, todayRhrBpm: 60, todayHrvMs: 50 });
    expect(r.recommendation.toLowerCase()).toMatch(/poslouchej|mírně|zvládneš/);
  });

  it('green day clears for planned training', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 480, todayRhrBpm: 60, todayHrvMs: 50 });
    expect(r.recommendation.toLowerCase()).toMatch(/připraven|podle plánu|trénuj/);
  });
});

describe('evaluateReadiness — factor messages are informative', () => {
  it('sleep_short message includes the actual hours', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 330 });
    const sleep = r.factors.find(f => f.key === 'sleep_short');
    expect(sleep?.message).toContain('5h 30m');
  });

  it('hrv_moderate message includes the ms value', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 480, todayHrvMs: 28 });
    const hrv = r.factors.find(f => f.key === 'hrv_moderate');
    expect(hrv?.message).toContain('28');
  });

  it('rhr_elevated message includes the bpm value', () => {
    const r = evaluateReadiness({ todaySleepMinutes: 480, todayRhrBpm: 80 });
    const rhr = r.factors.find(f => f.key === 'rhr_elevated');
    expect(rhr?.message).toContain('80');
  });
});
