import { describe, expect, it } from 'vitest';
import { planWeeklyAdjustment } from '../lib/coaching/weeklyAdjustment';
import type { WeeklyCheckIn } from '../types/checkin';

function checkIn(weekStartISO: string, weightKg: number, overrides: Partial<WeeklyCheckIn> = {}): WeeklyCheckIn {
  return {
    weekStartISO,
    weightKg,
    energyLevel: 3,
    hungerLevel: 3,
    adherence: 0.8,
    createdAt: `${weekStartISO}T08:00:00.000Z`,
    updatedAt: `${weekStartISO}T08:00:00.000Z`,
    ...overrides,
  };
}

describe('planWeeklyAdjustment — empty / single input', () => {
  it('empty check-ins → no adjustment, neutral reason', () => {
    const r = planWeeklyAdjustment({ goalKind: 'fat_loss', recentCheckIns: [] });
    expect(r.kcalDelta).toBe(0);
    expect(r.reason).toMatch(/dost dat|drž/i);
  });

  it('single check-in → no weight trend yet → no kcal change', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'fat_loss',
      recentCheckIns: [checkIn('2026-05-04', 80)],
    });
    expect(r.kcalDelta).toBe(0);
  });
});

describe('planWeeklyAdjustment — fat_loss goal', () => {
  it('stagnation (weight unchanged) → -150 kcal', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'fat_loss',
      recentCheckIns: [
        checkIn('2026-05-04', 80),
        checkIn('2026-05-11', 80),
      ],
    });
    expect(r.kcalDelta).toBe(-150);
    expect(r.reason).toContain('stagnuje');
  });

  it('healthy pace (-0.5 kg/wk) → no change', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'fat_loss',
      recentCheckIns: [
        checkIn('2026-05-04', 80),
        checkIn('2026-05-11', 79.5),
      ],
    });
    expect(r.kcalDelta).toBe(0);
  });

  it('too fast (-1.2 kg/wk) → +150 kcal + warning', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'fat_loss',
      recentCheckIns: [
        checkIn('2026-05-04', 80),
        checkIn('2026-05-11', 78.8),
      ],
    });
    expect(r.kcalDelta).toBe(150);
    expect(r.warnings.some(w => /1 kg|udržiteln/i.test(w))).toBe(true);
  });

  it('upper-bound pace (-0.9 kg/wk) → no change but warning', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'fat_loss',
      recentCheckIns: [
        checkIn('2026-05-04', 80),
        checkIn('2026-05-11', 79.1),
      ],
    });
    expect(r.kcalDelta).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('planWeeklyAdjustment — muscle_gain goal', () => {
  it('no growth → +150 kcal', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'muscle_gain',
      recentCheckIns: [
        checkIn('2026-05-04', 80),
        checkIn('2026-05-11', 80.05),
      ],
    });
    expect(r.kcalDelta).toBe(150);
    expect(r.reason).toContain('neroste');
  });

  it('healthy growth (+0.2 kg/wk) → no change', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'muscle_gain',
      recentCheckIns: [
        checkIn('2026-05-04', 80),
        checkIn('2026-05-11', 80.2),
      ],
    });
    expect(r.kcalDelta).toBe(0);
  });

  it('too fast (+0.6 kg/wk) → -100 kcal', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'muscle_gain',
      recentCheckIns: [
        checkIn('2026-05-04', 80),
        checkIn('2026-05-11', 80.6),
      ],
    });
    expect(r.kcalDelta).toBe(-100);
  });
});

describe('planWeeklyAdjustment — endurance goal', () => {
  it('stable weight → no change', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'endurance',
      recentCheckIns: [
        checkIn('2026-05-04', 75),
        checkIn('2026-05-11', 75),
      ],
    });
    expect(r.kcalDelta).toBe(0);
  });

  it('unwanted weight gain (+0.5 kg/wk) → -100 kcal correction', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'endurance',
      recentCheckIns: [
        checkIn('2026-05-04', 75),
        checkIn('2026-05-11', 75.5),
      ],
    });
    expect(r.kcalDelta).toBe(-100);
  });
});

describe('planWeeklyAdjustment — adherence + subjective signals', () => {
  it('low adherence (50%) triggers warning', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'fat_loss',
      recentCheckIns: [checkIn('2026-05-04', 80, { adherence: 0.5 })],
    });
    expect(r.warnings.some(w => /Adherence|jednodušší/i.test(w))).toBe(true);
  });

  it('low energy on fat_loss adds warning', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'fat_loss',
      recentCheckIns: [checkIn('2026-05-04', 80, { energyLevel: 1 })],
    });
    expect(r.warnings.some(w => /energie|maintenance/i.test(w))).toBe(true);
  });

  it('missed most planned workouts adds a training warning', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'muscle_gain',
      recentCheckIns: [
        checkIn('2026-04-27', 80.2, { plannedSessions: 4, completedSessions: 4 }),
        checkIn('2026-05-04', 80.4, { plannedSessions: 4, completedSessions: 1 }),
      ],
    });
    expect(r.warnings.some(w => /trénink|objem|polovinu/i.test(w))).toBe(true);
  });

  it('does not warn about training when no workouts were planned', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'maintenance',
      recentCheckIns: [
        checkIn('2026-04-27', 80, { plannedSessions: 0, completedSessions: 0 }),
        checkIn('2026-05-04', 80, { plannedSessions: 0, completedSessions: 0 }),
      ],
    });
    expect(r.warnings.some(w => /trénink|objem|pravidelnost|polovinu/i.test(w))).toBe(false);
  });
});

describe('planWeeklyAdjustment — chronic low energy auto-switch', () => {
  it('3 trailing low-energy weeks on fat_loss → goal auto-switch to maintenance', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'fat_loss',
      recentCheckIns: [
        checkIn('2026-04-13', 82, { energyLevel: 4 }),
        checkIn('2026-04-20', 81, { energyLevel: 2 }),
        checkIn('2026-04-27', 80, { energyLevel: 2 }),
        checkIn('2026-05-04', 80, { energyLevel: 1 }),
      ],
    });
    expect(r.adjustedGoalKind).toBe('maintenance');
    expect(r.kcalDelta).toBe(0); // override handles it
    expect(r.reason).toMatch(/přepínáme|udržení/i);
  });

  it('only one low-energy week → no auto-switch (just warning)', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'fat_loss',
      recentCheckIns: [
        checkIn('2026-04-27', 81, { energyLevel: 5 }),
        checkIn('2026-05-04', 80, { energyLevel: 2 }),
      ],
    });
    expect(r.adjustedGoalKind).toBeUndefined();
  });
});

describe('planWeeklyAdjustment — chronic hunger', () => {
  it('3 trailing high-hunger weeks on fat_loss → warning', () => {
    const r = planWeeklyAdjustment({
      goalKind: 'fat_loss',
      recentCheckIns: [
        checkIn('2026-04-20', 81, { hungerLevel: 4 }),
        checkIn('2026-04-27', 80, { hungerLevel: 4 }),
        checkIn('2026-05-04', 80, { hungerLevel: 5 }),
      ],
    });
    expect(r.warnings.some(w => /hlad|bílkovin|vláknin/i.test(w))).toBe(true);
  });
});
