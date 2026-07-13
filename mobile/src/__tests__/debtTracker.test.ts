import { describe, expect, it } from 'vitest';
import {
  computeSleepDebt,
  computeRecoveryDebt,
  describeSleepDebt,
  describeRecoveryDebt,
} from '../lib/coaching/debtTracker';
import type { SleepSummary } from '../types/health';

function sleep(date: string, totalMinutes: number): SleepSummary {
  return { date, totalMinutes, source: 'mock' };
}

describe('computeSleepDebt', () => {
  it('empty sleeps → no debt, no average', () => {
    const r = computeSleepDebt({ sleeps: [] });
    expect(r.totalDebtMinutes).toBe(0);
    expect(r.totalDebtHours).toBe(0);
    expect(r.averageMinutes).toBeNull();
    expect(r.daysWithData).toBe(0);
  });

  it('sleeping exactly 8h every day → 0 debt', () => {
    const sleeps = Array.from({ length: 7 }, (_, i) => sleep(`2026-05-${22 + i}`, 480));
    const r = computeSleepDebt({ sleeps, days: 7 });
    expect(r.totalDebtMinutes).toBe(0);
    expect(r.averageMinutes).toBe(480);
    expect(r.daysWithData).toBe(7);
  });

  it('sleeping 7h every day for 7 days → debt 7*60 = 420 min = 7h', () => {
    const sleeps = Array.from({ length: 7 }, (_, i) => sleep(`2026-05-${22 + i}`, 420));
    const r = computeSleepDebt({ sleeps, days: 7 });
    expect(r.totalDebtMinutes).toBe(420);
    expect(r.totalDebtHours).toBe(7);
  });

  it('oversleeping does NOT reduce debt (only positive entries count)', () => {
    const sleeps = [
      sleep('2026-05-26', 360),   // 2h debt
      sleep('2026-05-27', 600),   // would be -2h, but doesn't reduce
      sleep('2026-05-28', 420),   // 1h debt
    ];
    const r = computeSleepDebt({ sleeps, days: 3 });
    expect(r.totalDebtMinutes).toBe(120 + 60); // 3h
    expect(r.totalDebtHours).toBe(3);
  });

  it('respects custom target', () => {
    const sleeps = Array.from({ length: 3 }, (_, i) => sleep(`2026-05-${26 + i}`, 420));
    const r = computeSleepDebt({ sleeps, targetMinutes: 420, days: 3 });
    expect(r.totalDebtMinutes).toBe(0);
  });
});

describe('computeRecoveryDebt — totals', () => {
  it('empty → 0 debt', () => {
    expect(computeRecoveryDebt({ readinessLevels: [] }).totalDebt).toBe(0);
  });

  it('counts 2pts per red, 1pt per yellow, 0 per green', () => {
    const r = computeRecoveryDebt({
      readinessLevels: ['green', 'green', 'yellow', 'red', 'yellow', 'green'],
    });
    // 2 yellows × 1pt + 1 red × 2pts = 4
    expect(r.totalDebt).toBe(4);
    expect(r.greenDays).toBe(3);
    expect(r.yellowDays).toBe(2);
    expect(r.redDays).toBe(1);
  });
});

describe('computeRecoveryDebt — currentDebt with reset', () => {
  it('starts fresh when last 2 days are green', () => {
    const r = computeRecoveryDebt({
      readinessLevels: ['red', 'red', 'yellow', 'green', 'green'],
    });
    // Last 2 days green → reset on iteration of newest=green, green → break
    expect(r.currentDebt).toBe(0);
  });

  it('accumulates when not enough greens', () => {
    const r = computeRecoveryDebt({
      readinessLevels: ['green', 'yellow', 'red'],
    });
    // Newest=red(+2), back to yellow(+1), back to green → break
    expect(r.currentDebt).toBe(3);
  });

  it('single green at the end does not reset', () => {
    const r = computeRecoveryDebt({
      readinessLevels: ['red', 'red', 'green'],
    });
    // newest=green (1 consecutive), back to red(+2), back to red(+2)
    expect(r.currentDebt).toBe(4);
  });

  it('two greens in a row at end reset', () => {
    const r = computeRecoveryDebt({
      readinessLevels: ['red', 'yellow', 'green', 'green'],
    });
    expect(r.currentDebt).toBe(0);
  });
});

describe('describeSleepDebt', () => {
  it('< 3 days → asks for more data', () => {
    const r = computeSleepDebt({ sleeps: [sleep('2026-05-28', 480)] });
    expect(describeSleepDebt(r).toLowerCase()).toMatch(/3 noci|dat/);
  });

  it('< 1h debt → "v normě"', () => {
    const sleeps = Array.from({ length: 7 }, (_, i) => sleep(`2026-05-${22 + i}`, 480));
    const r = computeSleepDebt({ sleeps, days: 7 });
    expect(describeSleepDebt(r, 'cs').toLowerCase()).toMatch(/v normě/);
  });

  it('5–10h debt → suggests catch-up', () => {
    const sleeps = Array.from({ length: 7 }, (_, i) => sleep(`2026-05-${22 + i}`, 420));
    const r = computeSleepDebt({ sleeps, days: 7 }); // 7h debt
    expect(describeSleepDebt(r).toLowerCase()).toMatch(/víkendový|catch|delší/);
  });

  it('> 10h debt → flags it as priority', () => {
    const sleeps = Array.from({ length: 7 }, (_, i) => sleep(`2026-05-${22 + i}`, 360));
    const r = computeSleepDebt({ sleeps, days: 7 }); // 14h debt
    expect(describeSleepDebt(r, 'cs').toLowerCase()).toMatch(/priorita|projevuje/);
  });

  it('supports English descriptions', () => {
    const sleeps = Array.from({ length: 7 }, (_, i) => sleep(`2026-05-${22 + i}`, 420));
    const r = computeSleepDebt({ sleeps, days: 7 });
    expect(describeSleepDebt(r, 'en')).toMatch(/sleep debt|catch-up|longer nights/i);
    expect(describeSleepDebt(r, 'en')).not.toMatch(/[ěščřžýáíéůúňťďó]/i);
  });
});

describe('describeRecoveryDebt', () => {
  it('all green or reset → praises', () => {
    const r = computeRecoveryDebt({ readinessLevels: ['green', 'green', 'green'] });
    expect(describeRecoveryDebt(r).toLowerCase()).toMatch(/pohodě|green/);
  });

  it('mild current debt → easy training suggestion', () => {
    // Need ≥ 3 days for describe to skip the onboarding message
    const r = computeRecoveryDebt({ readinessLevels: ['green', 'yellow', 'yellow'] });
    expect(describeRecoveryDebt(r, 'cs').toLowerCase()).toMatch(/lehčí|brzo|spát/);
  });

  it('high current debt → rest days recommendation', () => {
    const r = computeRecoveryDebt({ readinessLevels: ['red', 'red', 'red'] });
    expect(describeRecoveryDebt(r, 'cs').toLowerCase()).toMatch(/pauzy|dny/);
  });

  it('supports English descriptions', () => {
    const r = computeRecoveryDebt({ readinessLevels: ['green', 'yellow', 'yellow'] });
    expect(describeRecoveryDebt(r, 'en')).toMatch(/recovery debt|lighter|bed early/i);
    expect(describeRecoveryDebt(r, 'en')).not.toMatch(/[ěščřžýáíéůúňťďó]/i);
  });
});
