import { describe, expect, it } from 'vitest';
import { computeLogStreak, computeAdherenceStreak, describeStreak } from '../lib/nutrition/streaks';
import type { AdherenceDay } from '../lib/nutrition/adherenceTrend';

function day(date: string, opts: Partial<AdherenceDay> = {}): AdherenceDay {
  return {
    date,
    plannedKcal: 0, loggedKcal: 0,
    plannedProtein: 0, loggedProtein: 0,
    plannedCarbs: 0, loggedCarbs: 0,
    plannedFat: 0, loggedFat: 0,
    ratio: null, proteinRatio: null, carbsRatio: null, fatRatio: null,
    ...opts,
  };
}

describe('computeLogStreak', () => {
  it('empty days → streak 0', () => {
    const r = computeLogStreak([]);
    expect(r.current).toBe(0);
    expect(r.longest).toBe(0);
  });

  it('one logged day → streak 1', () => {
    const days = [day('2026-05-28', { loggedKcal: 1800 })];
    const r = computeLogStreak(days, '2026-05-28');
    expect(r.current).toBe(1);
    expect(r.longest).toBe(1);
  });

  it('3 consecutive logged days → streak 3', () => {
    const days = [
      day('2026-05-26', { loggedKcal: 1800 }),
      day('2026-05-27', { loggedKcal: 1900 }),
      day('2026-05-28', { loggedKcal: 2000 }),
    ];
    const r = computeLogStreak(days, '2026-05-28');
    expect(r.current).toBe(3);
    expect(r.longest).toBe(3);
    // startDate = oldest day in the current run (kdy streak začal)
    expect(r.startDate).toBe('2026-05-26');
  });

  it('break in middle resets current but longest preserved', () => {
    const days = [
      day('2026-05-22', { loggedKcal: 1800 }),
      day('2026-05-23', { loggedKcal: 1800 }),
      day('2026-05-24', { loggedKcal: 1800 }),
      day('2026-05-25'),                          // empty break
      day('2026-05-26', { loggedKcal: 1800 }),
      day('2026-05-27', { loggedKcal: 1800 }),
      day('2026-05-28', { loggedKcal: 1800 }),
    ];
    const r = computeLogStreak(days, '2026-05-28');
    expect(r.current).toBe(3); // last 3 days
    expect(r.longest).toBe(3); // both runs are 3 long, tied
  });

  it('break at today → use yesterday as anchor', () => {
    const days = [
      day('2026-05-26', { loggedKcal: 1800 }),
      day('2026-05-27', { loggedKcal: 1800 }),
      day('2026-05-28'),  // today, empty
    ];
    const r = computeLogStreak(days, '2026-05-28');
    expect(r.current).toBe(2); // yesterday + day before
  });

  it('yesterday empty + today empty → streak 0', () => {
    const days = [
      day('2026-05-26', { loggedKcal: 1800 }),
      day('2026-05-27'),                  // yesterday empty
      day('2026-05-28'),                  // today empty
    ];
    const r = computeLogStreak(days, '2026-05-28');
    expect(r.current).toBe(0);
    expect(r.longest).toBe(1);
  });
});

describe('computeAdherenceStreak', () => {
  it('only counts days within band (85-115%)', () => {
    const days = [
      day('2026-05-26', { plannedKcal: 2000, loggedKcal: 1800, ratio: 0.9 }),  // ✓
      day('2026-05-27', { plannedKcal: 2000, loggedKcal: 1500, ratio: 0.75 }), // ✗ (low)
      day('2026-05-28', { plannedKcal: 2000, loggedKcal: 2050, ratio: 1.025 }), // ✓
    ];
    const r = computeAdherenceStreak(days, '2026-05-28');
    expect(r.current).toBe(1); // only today
    expect(r.longest).toBe(1); // 2 separate single-day runs
  });

  it('3 in-band days in a row → streak 3', () => {
    const days = [
      day('2026-05-26', { plannedKcal: 2000, loggedKcal: 2000, ratio: 1.0 }),
      day('2026-05-27', { plannedKcal: 2000, loggedKcal: 1900, ratio: 0.95 }),
      day('2026-05-28', { plannedKcal: 2000, loggedKcal: 2100, ratio: 1.05 }),
    ];
    const r = computeAdherenceStreak(days, '2026-05-28');
    expect(r.current).toBe(3);
  });

  it('overshooting >115% breaks streak', () => {
    const days = [
      day('2026-05-26', { plannedKcal: 2000, loggedKcal: 2000, ratio: 1.0 }),
      day('2026-05-27', { plannedKcal: 2000, loggedKcal: 2500, ratio: 1.25 }),  // surplus
      day('2026-05-28', { plannedKcal: 2000, loggedKcal: 2000, ratio: 1.0 }),
    ];
    const r = computeAdherenceStreak(days, '2026-05-28');
    expect(r.current).toBe(1);
  });

  it('partial today (no log) → use yesterday', () => {
    const days = [
      day('2026-05-26', { plannedKcal: 2000, loggedKcal: 1900, ratio: 0.95 }),
      day('2026-05-27', { plannedKcal: 2000, loggedKcal: 1950, ratio: 0.975 }),
      day('2026-05-28', { plannedKcal: 2000, loggedKcal: 0, ratio: 0 }),  // today empty
    ];
    const r = computeAdherenceStreak(days, '2026-05-28');
    expect(r.current).toBe(2);
  });

  it('custom band overrides default 85-115%', () => {
    const days = [
      day('2026-05-26', { plannedKcal: 2000, loggedKcal: 1800, ratio: 0.9 }),
      day('2026-05-27', { plannedKcal: 2000, loggedKcal: 1700, ratio: 0.85 }),
      day('2026-05-28', { plannedKcal: 2000, loggedKcal: 1600, ratio: 0.8 }),
    ];
    const strict = computeAdherenceStreak(days, '2026-05-28', { low: 0.9, high: 1.1 });
    expect(strict.current).toBe(0);  // today's 0.8 fails strict band
    expect(strict.longest).toBe(1);  // yesterday's 0.85 fails too, only 0.9 passes
  });
});

describe('describeStreak', () => {
  it('0 streak gives onboarding hint', () => {
    expect(describeStreak({ current: 0, longest: 5, startDate: null }, 'log').toLowerCase())
      .toMatch(/začni|start|zapisovat/);
    expect(describeStreak({ current: 0, longest: 5, startDate: null }, 'adherence').toLowerCase())
      .toMatch(/cíl|start/);
  });

  it('< 3 streak is encouraging', () => {
    expect(describeStreak({ current: 2, longest: 5, startDate: '2026-05-27' }, 'log').toLowerCase())
      .toMatch(/pokračuj|2 dny/);
  });

  it('3+ streak gets fire emoji', () => {
    const r = describeStreak({ current: 5, longest: 5, startDate: '2026-05-24' }, 'log');
    expect(r).toContain('🔥');
    expect(r).toContain('5');
  });

  it('current = longest is celebrated', () => {
    expect(describeStreak({ current: 7, longest: 7, startDate: '2026-05-22' }, 'log').toLowerCase())
      .toMatch(/nejdelší|tvůj/);
  });

  it('current < longest mentions record', () => {
    const r = describeStreak({ current: 4, longest: 12, startDate: '2026-05-25' }, 'log');
    expect(r).toContain('12');
  });

  it('handles correct Czech plural (1 den / 2-4 dny / 5+ dní)', () => {
    expect(describeStreak({ current: 1, longest: 1, startDate: '2026-05-28' }, 'log')).toContain('1 den');
    expect(describeStreak({ current: 3, longest: 3, startDate: '2026-05-26' }, 'log')).toContain('3 dny');
    expect(describeStreak({ current: 7, longest: 7, startDate: '2026-05-22' }, 'log')).toContain('7 dní');
  });
});
