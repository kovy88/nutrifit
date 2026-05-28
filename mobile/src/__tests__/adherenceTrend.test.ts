import { describe, expect, it } from 'vitest';
import {
  computeAdherenceTrend,
  adherenceToTrendPoints,
  describeAdherence,
} from '../lib/nutrition/adherenceTrend';
import type { Meal, FoodLogItem, DailyPlanRecord, DailyFoodLogRecord } from '../types';

function meal(kcal: number): Meal {
  return {
    mealType: 'Snídaně',
    name: 'X',
    kcal,
    protein: 0, carbs: 0, fat: 0, fiber: 0, prepTime: 10,
    difficulty: 'Jednoduchá', ingredients: [], steps: [],
  };
}

function logItem(kcal: number): FoodLogItem {
  return {
    id: 'x',
    createdAt: '2026-05-28T08:00:00.000Z',
    source: 'manual',
    foodName: 'X',
    kcal,
    protein: 0, carbs: 0, fat: 0,
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
    const points = adherenceToTrendPoints(days);
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
