import { describe, expect, it } from 'vitest';
import { computeEnergyBalance, describeEnergyBalance } from '../lib/nutrition/energyBalance';
import type { DailyFoodLogRecord, FoodLogItem } from '../types';

function log(kcal: number): FoodLogItem {
  return {
    id: 'x',
    createdAt: '2026-05-28T08:00:00.000Z',
    source: 'manual',
    foodName: 'X',
    kcal, protein: 0, carbs: 0, fat: 0,
  };
}

describe('computeEnergyBalance — basic', () => {
  it('empty logs → zero balance, no theoretical change', () => {
    const r = computeEnergyBalance({ logs: {}, tdee: 2000, days: 7 });
    expect(r.totalBalance).toBe(0);
    expect(r.theoreticalKgChange).toBe(0);
    expect(r.loggedDays).toBe(0);
    expect(r.averageDailyBalance).toBeNull();
  });

  it('one day eating exactly TDEE → zero balance', () => {
    const logs: DailyFoodLogRecord = { '2026-05-28': [log(2000)] };
    const r = computeEnergyBalance({ logs, tdee: 2000, days: 1, endDate: new Date('2026-05-28') });
    expect(r.totalBalance).toBe(0);
    expect(r.loggedDays).toBe(1);
  });

  it('500 kcal deficit per day for 7 days → -3500 kcal → -0.45 kg', () => {
    const logs: DailyFoodLogRecord = {};
    for (let i = 22; i <= 28; i++) {
      const date = `2026-05-${String(i).padStart(2, '0')}`;
      logs[date] = [log(1500)];
    }
    const r = computeEnergyBalance({ logs, tdee: 2000, days: 7, endDate: new Date('2026-05-28') });
    expect(r.totalBalance).toBe(-3500);
    expect(r.theoreticalKgChange).toBeCloseTo(-0.45, 2);
    expect(r.averageDailyBalance).toBe(-500);
  });

  it('1 kg of fat ≈ 7700 kcal (sanity check)', () => {
    const logs: DailyFoodLogRecord = {};
    for (let i = 1; i <= 14; i++) {
      const date = `2026-05-${String(i).padStart(2, '0')}`;
      logs[date] = [log(2550)]; // 550 surplus × 14 = 7700
    }
    const r = computeEnergyBalance({ logs, tdee: 2000, days: 14, endDate: new Date('2026-05-14') });
    expect(r.totalBalance).toBe(7700);
    expect(r.theoreticalKgChange).toBeCloseTo(1, 2);
  });

  it('skips days without logs from averageDailyBalance', () => {
    const logs: DailyFoodLogRecord = {
      '2026-05-27': [log(1500)],  // -500
      '2026-05-28': [log(1500)],  // -500
      // 2026-05-26 missing
    };
    const r = computeEnergyBalance({ logs, tdee: 2000, days: 3, endDate: new Date('2026-05-28') });
    expect(r.loggedDays).toBe(2);
    expect(r.totalBalance).toBe(-1000);
    expect(r.averageDailyBalance).toBe(-500); // 1000/2, not 1000/3
  });
});

describe('describeEnergyBalance — goal-aware', () => {
  it('< 3 logged days → asks for more data', () => {
    const empty = computeEnergyBalance({ logs: {}, tdee: 2000, days: 14 });
    expect(describeEnergyBalance(empty, 'fat_loss').toLowerCase()).toMatch(/zaznamenej|spolehlivý/);
  });

  it('fat_loss + deficit → praises', () => {
    const logs: DailyFoodLogRecord = {};
    for (let i = 22; i <= 28; i++) {
      logs[`2026-05-${String(i).padStart(2, '0')}`] = [log(1500)];
    }
    const r = computeEnergyBalance({ logs, tdee: 2000, days: 7, endDate: new Date('2026-05-28') });
    const msg = describeEnergyBalance(r, 'fat_loss').toLowerCase();
    expect(msg).toMatch(/deficit|pokrok|skvělý/);
  });

  it('fat_loss + surplus → warns', () => {
    const logs: DailyFoodLogRecord = {};
    for (let i = 22; i <= 28; i++) {
      logs[`2026-05-${String(i).padStart(2, '0')}`] = [log(2500)];
    }
    const r = computeEnergyBalance({ logs, tdee: 2000, days: 7, endDate: new Date('2026-05-28') });
    const msg = describeEnergyBalance(r, 'fat_loss').toLowerCase();
    expect(msg).toMatch(/surplus|brzdí|pozor/);
  });

  it('muscle_gain + surplus → praises', () => {
    const logs: DailyFoodLogRecord = {};
    for (let i = 22; i <= 28; i++) {
      logs[`2026-05-${String(i).padStart(2, '0')}`] = [log(2300)];
    }
    const r = computeEnergyBalance({ logs, tdee: 2000, days: 7, endDate: new Date('2026-05-28') });
    const msg = describeEnergyBalance(r, 'muscle_gain').toLowerCase();
    expect(msg).toMatch(/surplus|sval|čistě/);
  });

  it('muscle_gain + deficit → asks for more', () => {
    const logs: DailyFoodLogRecord = {};
    for (let i = 22; i <= 28; i++) {
      logs[`2026-05-${String(i).padStart(2, '0')}`] = [log(1800)];
    }
    const r = computeEnergyBalance({ logs, tdee: 2000, days: 7, endDate: new Date('2026-05-28') });
    const msg = describeEnergyBalance(r, 'muscle_gain').toLowerCase();
    expect(msg).toMatch(/přidej|potřebuješ|surplus/);
  });

  it('endurance + stability → ideal', () => {
    const logs: DailyFoodLogRecord = {};
    for (let i = 22; i <= 28; i++) {
      logs[`2026-05-${String(i).padStart(2, '0')}`] = [log(2000)];
    }
    const r = computeEnergyBalance({ logs, tdee: 2000, days: 7, endDate: new Date('2026-05-28') });
    const msg = describeEnergyBalance(r, 'endurance').toLowerCase();
    expect(msg).toMatch(/stabilní|ideální/);
  });

  it('endurance + big deficit → warns about performance', () => {
    const logs: DailyFoodLogRecord = {};
    for (let i = 22; i <= 28; i++) {
      logs[`2026-05-${String(i).padStart(2, '0')}`] = [log(1200)];
    }
    const r = computeEnergyBalance({ logs, tdee: 2000, days: 7, endDate: new Date('2026-05-28') });
    const msg = describeEnergyBalance(r, 'endurance').toLowerCase();
    expect(msg).toMatch(/výkon|glykogen|deficit/);
  });

  it('maintenance + flat balance → "v rovnováze"', () => {
    const logs: DailyFoodLogRecord = {};
    for (let i = 22; i <= 28; i++) {
      logs[`2026-05-${String(i).padStart(2, '0')}`] = [log(2010)];
    }
    const r = computeEnergyBalance({ logs, tdee: 2000, days: 7, endDate: new Date('2026-05-28') });
    const msg = describeEnergyBalance(r, 'maintenance').toLowerCase();
    expect(msg).toMatch(/rovnováze|stabilní/);
  });
});
