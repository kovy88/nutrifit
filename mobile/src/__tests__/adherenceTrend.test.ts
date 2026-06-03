import { describe, expect, it } from 'vitest';
import {
  computeAdherenceTrend,
  adherenceToTrendPoints,
  describeAdherence,
  macroAdherenceBand,
} from '../lib/nutrition/adherenceTrend';
import type { Meal, FoodLogItem, DailyPlanRecord, DailyFoodLogRecord } from '../types';

function meal(kcal: number, p = 0, c = 0, f = 0): Meal {
  return {
    mealType: 'Snídaně',
    name: 'X',
    kcal,
    protein: p, carbs: c, fat: f, fiber: 0, prepTime: 10,
    difficulty: 'Jednoduchá', ingredients: [], steps: [],
  };
}

function logItem(kcal: number, p = 0, c = 0, f = 0): FoodLogItem {
  return {
    id: 'x',
    createdAt: '2026-05-28T08:00:00.000Z',
    source: 'manual',
    foodName: 'X',
    kcal,
    protein: p, carbs: c, fat: f,
  };
}

describe('computeAdherenceTrend — empty / partial', () => {
  it('empty plans + logs → all-null ratios', () => {
    const r = computeAdherenceTrend({}, {}, 7, new Date('2026-05-28'));
    expect(r.days.length).toBe(7);
    expect(r.days.every(d => d.ratio === null)).toBe(true);
    expect(r.averageRatio).toBeNull();
    expect(r.loggedDays).toBe(0);
    expect(r.plannedDays).toBe(0);
  });

  it('plan but no log → ratio 0', () => {
    const plans: DailyPlanRecord = { '2026-05-28': [meal(2000)] };
    const r = computeAdherenceTrend(plans, {}, 3, new Date('2026-05-28'));
    const today = r.days[r.days.length - 1];
    expect(today.plannedKcal).toBe(2000);
    expect(today.loggedKcal).toBe(0);
    expect(today.ratio).toBe(0);
  });

  it('log but no plan → ratio null (cannot compute % of nothing)', () => {
    const logs: DailyFoodLogRecord = { '2026-05-28': [logItem(1800)] };
    const r = computeAdherenceTrend({}, logs, 3, new Date('2026-05-28'));
    const today = r.days[r.days.length - 1];
    expect(today.plannedKcal).toBe(0);
    expect(today.loggedKcal).toBe(1800);
    expect(today.ratio).toBeNull();
  });
});

describe('computeAdherenceTrend — ratios', () => {
  it('perfect adherence → ratio 1.0', () => {
    const plans: DailyPlanRecord = { '2026-05-28': [meal(800), meal(700), meal(500)] }; // 2000
    const logs: DailyFoodLogRecord = { '2026-05-28': [logItem(2000)] };
    const r = computeAdherenceTrend(plans, logs, 1, new Date('2026-05-28'));
    expect(r.days[0].ratio).toBe(1);
  });

  it('100 kcal over → ratio 1.05', () => {
    const plans: DailyPlanRecord = { '2026-05-28': [meal(2000)] };
    const logs: DailyFoodLogRecord = { '2026-05-28': [logItem(2100)] };
    const r = computeAdherenceTrend(plans, logs, 1, new Date('2026-05-28'));
    expect(r.days[0].ratio).toBe(1.05);
  });

  it('200 kcal under → ratio 0.9', () => {
    const plans: DailyPlanRecord = { '2026-05-28': [meal(2000)] };
    const logs: DailyFoodLogRecord = { '2026-05-28': [logItem(1800)] };
    const r = computeAdherenceTrend(plans, logs, 1, new Date('2026-05-28'));
    expect(r.days[0].ratio).toBe(0.9);
  });

  it('average across multiple days', () => {
    const plans: DailyPlanRecord = {
      '2026-05-26': [meal(2000)],
      '2026-05-27': [meal(2000)],
      '2026-05-28': [meal(2000)],
    };
    const logs: DailyFoodLogRecord = {
      '2026-05-26': [logItem(2000)], // 1.0
      '2026-05-27': [logItem(1800)], // 0.9
      '2026-05-28': [logItem(2200)], // 1.1
    };
    const r = computeAdherenceTrend(plans, logs, 3, new Date('2026-05-28'));
    expect(r.averageRatio).toBe(1);
    expect(r.loggedDays).toBe(3);
    expect(r.plannedDays).toBe(3);
  });

  it('skips null-ratio days from average', () => {
    const plans: DailyPlanRecord = { '2026-05-28': [meal(2000)] };
    const logs: DailyFoodLogRecord = {
      '2026-05-27': [logItem(2200)],  // no plan, ignored
      '2026-05-28': [logItem(2000)],  // ratio 1.0
    };
    const r = computeAdherenceTrend(plans, logs, 2, new Date('2026-05-28'));
    expect(r.averageRatio).toBe(1);
  });
});

describe('adherenceToTrendPoints', () => {
  it('converts ratios to integer percentages', () => {
    const days = [
      { date: '2026-05-26', plannedKcal: 2000, loggedKcal: 2000, ratio: 1.0 },
      { date: '2026-05-27', plannedKcal: 2000, loggedKcal: 1800, ratio: 0.9 },
      { date: '2026-05-28', plannedKcal: 0, loggedKcal: 0, ratio: null },
    ];
    const points = adherenceToTrendPoints(days as unknown as Parameters<typeof adherenceToTrendPoints>[0]);
    expect(points).toEqual([
      { date: '2026-05-26', value: 100 },
      { date: '2026-05-27', value: 90 },
      { date: '2026-05-28', value: null },
    ]);
  });
});

describe('describeAdherence', () => {
  it('null average → asks for more data', () => {
    expect(describeAdherence(null).toLowerCase()).toMatch(/dat|trend|zápis/);
  });

  it('95-105% → "Skvělé"', () => {
    expect(describeAdherence(1.0).toLowerCase()).toContain('skvělé');
    expect(describeAdherence(0.97).toLowerCase()).toContain('skvělé');
    expect(describeAdherence(1.04).toLowerCase()).toContain('skvělé');
  });

  it('< 85% → warns about crash deficit', () => {
    expect(describeAdherence(0.7).toLowerCase()).toMatch(/výrazně|crash|méně/);
  });

  it('> 115% → warns about surplus', () => {
    expect(describeAdherence(1.2).toLowerCase()).toMatch(/surplus|výrazný|brzda/);
  });
});

describe('computeAdherenceTrend — per-macro tracking', () => {
  it('tracks protein, carbs, fat plan + logged per day', () => {
    const plans: DailyPlanRecord = {
      '2026-05-28': [meal(2000, 150, 200, 70)],
    };
    const logs: DailyFoodLogRecord = {
      '2026-05-28': [logItem(2000, 150, 200, 70)],
    };
    const r = computeAdherenceTrend(plans, logs, 1, new Date('2026-05-28'));
    const today = r.days[0];
    expect(today.plannedProtein).toBe(150);
    expect(today.loggedProtein).toBe(150);
    expect(today.plannedCarbs).toBe(200);
    expect(today.loggedCarbs).toBe(200);
    expect(today.plannedFat).toBe(70);
    expect(today.loggedFat).toBe(70);
    expect(today.proteinRatio).toBe(1);
    expect(today.carbsRatio).toBe(1);
    expect(today.fatRatio).toBe(1);
  });

  it('per-macro ratios respect partial plan/log', () => {
    const plans: DailyPlanRecord = {
      '2026-05-28': [meal(2000, 150, 200, 70)],
    };
    const logs: DailyFoodLogRecord = {
      // Under target on protein, over on carbs
      '2026-05-28': [logItem(2000, 120, 250, 60)],
    };
    const r = computeAdherenceTrend(plans, logs, 1, new Date('2026-05-28'));
    const today = r.days[0];
    expect(today.proteinRatio).toBeCloseTo(0.8, 2);
    expect(today.carbsRatio).toBeCloseTo(1.25, 2);
    expect(today.fatRatio).toBeCloseTo(60 / 70, 2);
  });

  it('averages all four macros independently', () => {
    const plans: DailyPlanRecord = {
      '2026-05-27': [meal(2000, 150, 200, 70)],
      '2026-05-28': [meal(2000, 150, 200, 70)],
    };
    const logs: DailyFoodLogRecord = {
      '2026-05-27': [logItem(2000, 150, 200, 70)],   // perfect
      '2026-05-28': [logItem(2200, 150, 250, 70)],   // over kcal+carbs
    };
    const r = computeAdherenceTrend(plans, logs, 2, new Date('2026-05-28'));
    expect(r.averages.kcal).toBeCloseTo(1.05, 2);
    expect(r.averages.protein).toBe(1);
    expect(r.averages.carbs).toBeCloseTo(1.125, 2);
    expect(r.averages.fat).toBe(1);
  });

  it('averages return null when no days have plans', () => {
    const r = computeAdherenceTrend({}, {}, 5, new Date('2026-05-28'));
    expect(r.averages.kcal).toBeNull();
    expect(r.averages.protein).toBeNull();
    expect(r.averages.carbs).toBeNull();
    expect(r.averages.fat).toBeNull();
  });
});

describe('adherenceToTrendPoints — per-macro selector', () => {
  it('default selects kcal ratio', () => {
    const plans: DailyPlanRecord = { '2026-05-28': [meal(2000, 150, 200, 70)] };
    const logs: DailyFoodLogRecord = { '2026-05-28': [logItem(2000, 100, 200, 70)] };
    const r = computeAdherenceTrend(plans, logs, 1, new Date('2026-05-28'));
    const points = adherenceToTrendPoints(r.days);
    expect(points[0].value).toBe(100); // kcal ratio 1.0 → 100%
  });

  it('selects protein ratio when requested', () => {
    const plans: DailyPlanRecord = { '2026-05-28': [meal(2000, 150, 200, 70)] };
    const logs: DailyFoodLogRecord = { '2026-05-28': [logItem(2000, 100, 200, 70)] };
    const r = computeAdherenceTrend(plans, logs, 1, new Date('2026-05-28'));
    const points = adherenceToTrendPoints(r.days, 'protein');
    expect(points[0].value).toBe(67); // 100/150 = 0.667 → 67%
  });

  it('selects fat ratio when requested', () => {
    const plans: DailyPlanRecord = { '2026-05-28': [meal(2000, 150, 200, 70)] };
    const logs: DailyFoodLogRecord = { '2026-05-28': [logItem(2000, 150, 200, 105)] };
    const r = computeAdherenceTrend(plans, logs, 1, new Date('2026-05-28'));
    const points = adherenceToTrendPoints(r.days, 'fat');
    expect(points[0].value).toBe(150); // 105/70 = 1.5 → 150%
  });
});

describe('macroAdherenceBand', () => {
  it('null → unknown', () => {
    expect(macroAdherenceBand(null)).toBe('unknown');
  });

  it('< 0.85 → low', () => {
    expect(macroAdherenceBand(0.7)).toBe('low');
    expect(macroAdherenceBand(0.84)).toBe('low');
  });

  it('0.85–1.15 → on_target', () => {
    expect(macroAdherenceBand(0.85)).toBe('on_target');
    expect(macroAdherenceBand(1.0)).toBe('on_target');
    expect(macroAdherenceBand(1.15)).toBe('on_target');
  });

  it('> 1.15 → high', () => {
    expect(macroAdherenceBand(1.2)).toBe('high');
    expect(macroAdherenceBand(2.0)).toBe('high');
  });
});
