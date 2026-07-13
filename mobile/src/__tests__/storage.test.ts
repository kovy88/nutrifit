import { describe, expect, it, vi, beforeEach } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadPlansByDate,
  loadProfile,
  savePlanForDate,
  loadFoodLogsByDate,
  saveFoodLogForDate,
  loadSessionsByDate,
  listStoredDates,
  runMigration,
  loadCoachThreadsByDate,
  loadDailyCoachHistory,
  loadTrainingCompletionsByDate,
  saveCoachThreadForDate,
  saveCoachThreadsByDate,
  saveDailyCoachRecommendationForDate,
  saveTrainingCompletionForDate,
  purgeAllLocalData,
} from '../services/storage';
import { toDateKey , DEFAULT_PROFILE, calculateMacros } from '../utils/nutrition';
import type { Meal, FoodLogItem } from '../types';
import { generateDailyCoachRecommendation } from '../lib/coaching/dailyCoach';

vi.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    default: {
      getItem: vi.fn().mockImplementation(async (key: string) => store[key] || null),
      setItem: vi.fn().mockImplementation(async (key: string, val: string) => {
        store[key] = val;
      }),
      removeItem: vi.fn().mockImplementation(async (key: string) => {
        delete store[key];
      }),
      clear: vi.fn().mockImplementation(async () => {
        Object.keys(store).forEach(k => delete store[k]);
      }),
      getAllKeys: vi.fn().mockImplementation(async () => Object.keys(store)),
      multiGet: vi.fn().mockImplementation(async (keys: string[]) =>
        keys.map(k => [k, store[k] ?? null] as [string, string | null])),
      multiSet: vi.fn().mockImplementation(async (pairs: [string, string][]) => {
        for (const [k, v] of pairs) store[k] = v;
      }),
      multiRemove: vi.fn().mockImplementation(async (keysToRemove: string[]) => {
        for (const k of keysToRemove) delete store[k];
      }),
    },
  };
});

describe('date-based storage and migration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('saves and loads plans for a specific date', async () => {
    const meals: Meal[] = [
      {
        mealType: 'Snídaně',
        name: 'Ovesná kaše',
        kcal: 350,
        protein: 15,
        carbs: 55,
        fat: 8,
        fiber: 5,
        prepTime: 5,
        difficulty: 'Snadná',
        ingredients: ['Vločky', 'Mléko'],
        steps: ['Uvař.'],
      },
    ];

    await savePlanForDate('2026-05-28', meals);
    const plans = await loadPlansByDate();
    expect(plans['2026-05-28']).toEqual(meals);
    expect(plans['2026-05-27']).toBeUndefined();
  });

  it('saves and loads food logs for a specific date', async () => {
    const items: FoodLogItem[] = [
      {
        id: '1',
        createdAt: '2026-05-28T08:00:00Z',
        source: 'manual',
        foodName: 'Banán',
        kcal: 100,
        protein: 1,
        carbs: 23,
        fat: 0,
      },
    ];

    await saveFoodLogForDate('2026-05-28', items);
    const logs = await loadFoodLogsByDate();
    expect(logs['2026-05-28']).toEqual(items);
  });

  it('lists stored dates in chronological sorted order', async () => {
    await savePlanForDate('2026-05-30', []);
    await saveFoodLogForDate('2026-05-28', []);
    await savePlanForDate('2026-05-29', []);

    const dates = await listStoredDates();
    expect(dates).toEqual(['2026-05-28', '2026-05-29', '2026-05-30']);
  });

  it('stores training completions and coach thread/history by date', async () => {
    await saveTrainingCompletionForDate('2026-05-30', {
      date: '2026-05-30',
      status: 'completed',
      plannedSession: null,
      source: 'manual',
      createdAt: '2026-05-30T10:00:00.000Z',
      updatedAt: '2026-05-30T10:00:00.000Z',
    });

    const macros = calculateMacros(DEFAULT_PROFILE);
    const recommendation = generateDailyCoachRecommendation({
      date: '2026-05-30',
      profile: DEFAULT_PROFILE,
      session: null,
      recovery: {},
      baselineMacros: macros,
      todayMacros: macros,
    });
    const memory = { goalSummary: 'lose_fat + general_fitness', updatedAt: '2026-05-30T10:00:00.000Z' };
    await saveDailyCoachRecommendationForDate('2026-05-30', recommendation, memory);
    await saveCoachThreadForDate('2026-05-30', [
      { id: '1', role: 'user', text: 'Why?', createdAt: '2026-05-30T10:00:00.000Z' },
    ], memory);

    expect((await loadTrainingCompletionsByDate())['2026-05-30'].status).toBe('completed');
    expect((await loadDailyCoachHistory())['2026-05-30'].recommendation.date).toBe('2026-05-30');
    expect((await loadCoachThreadsByDate())['2026-05-30'].messages).toHaveLength(1);
    expect(await listStoredDates()).toContain('2026-05-30');
  });

  it('migrates legacy primary goal names to the new taxonomy', async () => {
    await AsyncStorage.setItem('nutrifit.profile.v2', JSON.stringify({
      ...DEFAULT_PROFILE,
      primaryGoal: 'run_race',
      trainingGoal: 'half_marathon',
    }));

    await runMigration();

    const profile = await loadProfile();
    expect(profile?.primaryGoal).toBe('improve_running');
    expect(profile?.trainingGoal).toBe('half_marathon');
  });

  it('migrates removed recovery goal to build consistency', async () => {
    await AsyncStorage.setItem('nutrifit.profile.v2', JSON.stringify({
      ...DEFAULT_PROFILE,
      primaryGoal: 'improve_recovery',
      trainingGoal: 'walking_more',
    }));

    await runMigration();

    const profile = await loadProfile();
    expect(profile?.primaryGoal).toBe('build_consistency');
    expect(profile?.trainingGoal).toBe('walking_more');
  });

  it('migrates legacy lastPlan, foodLog, and todaySession keys to todays date, then removes them', async () => {
    const today = toDateKey(new Date());

    const legacyPlan = [
      {
        mealType: 'Oběd',
        name: 'Kuřecí prsa',
        kcal: 400,
        protein: 30,
        carbs: 40,
        fat: 10,
        fiber: 2,
        prepTime: 15,
        difficulty: 'Snadná',
        ingredients: [],
        steps: [],
      },
    ];
    const legacyFood = [
      {
        id: 'legacy-1',
        createdAt: '2026-05-27T10:00:00Z',
        source: 'photo' as const,
        foodName: 'Salát',
        kcal: 150,
        protein: 5,
        carbs: 10,
        fat: 10,
      },
    ];
    const legacySession = {
      date: '2026-05-27',
      kind: 'strength' as const,
      title: 'Silový trénink',
      durationMinutes: 45,
      intensity: 'moderate' as const,
    };

    await AsyncStorage.setItem('nutrifit.lastPlan.v1', JSON.stringify(legacyPlan));
    await AsyncStorage.setItem('nutrifit.foodLog.v1', JSON.stringify(legacyFood));
    await AsyncStorage.setItem('nutrifit.todaySession.v1', JSON.stringify(legacySession));

    await runMigration();

    const plans = await loadPlansByDate();
    const logs = await loadFoodLogsByDate();
    const sessions = await loadSessionsByDate();

    expect(plans[today]).toEqual(legacyPlan);
    expect(logs[today]).toEqual(legacyFood);
    expect(sessions[today]).toEqual(legacySession);

    // Verify legacy keys are removed
    expect(await AsyncStorage.getItem('nutrifit.lastPlan.v1')).toBeNull();
    expect(await AsyncStorage.getItem('nutrifit.foodLog.v1')).toBeNull();
    expect(await AsyncStorage.getItem('nutrifit.todaySession.v1')).toBeNull();
  });

  it('prunes date-bound records older than the retention window on every runMigration() call', async () => {
    const today = new Date();
    const recentDate = toDateKey(today);
    // 100 days ago — past the 90-day retention window pruneDateBoundedStores() enforces.
    const oldDate = toDateKey(new Date(today.getTime() - 100 * 24 * 60 * 60 * 1000));

    await savePlanForDate(recentDate, []);
    await savePlanForDate(oldDate, []);
    await saveFoodLogForDate(recentDate, []);
    await saveFoodLogForDate(oldDate, []);

    await runMigration();

    const plans = await loadPlansByDate();
    const logs = await loadFoodLogsByDate();
    expect(plans[recentDate]).toBeDefined();
    expect(plans[oldDate]).toBeUndefined();
    expect(logs[recentDate]).toBeDefined();
    expect(logs[oldDate]).toBeUndefined();
  });

  it('does not prune a date sitting just inside the retention window', async () => {
    const today = new Date();
    // 89 days ago — inside the 90-day window, must survive pruning.
    const borderlineDate = toDateKey(new Date(today.getTime() - 89 * 24 * 60 * 60 * 1000));

    await savePlanForDate(borderlineDate, []);
    await runMigration();

    expect((await loadPlansByDate())[borderlineDate]).toBeDefined();
  });

  describe('coach thread per-day storage', () => {
    const memory = { goalSummary: 'lose_fat + general_fitness', updatedAt: '2026-05-30T10:00:00.000Z' };

    it('migrates the legacy single-blob key into per-day keys, then removes it', async () => {
      const legacyBlob = {
        '2026-05-28': { date: '2026-05-28', messages: [{ id: 'a', role: 'user', text: 'hi', createdAt: '2026-05-28T00:00:00.000Z' }], memory, createdAt: '2026-05-28T00:00:00.000Z', updatedAt: '2026-05-28T00:00:00.000Z' },
        '2026-05-29': { date: '2026-05-29', messages: [{ id: 'b', role: 'user', text: 'hey', createdAt: '2026-05-29T00:00:00.000Z' }], memory, createdAt: '2026-05-29T00:00:00.000Z', updatedAt: '2026-05-29T00:00:00.000Z' },
      };
      await AsyncStorage.setItem('nutrifit.coachThreadsByDate.v1', JSON.stringify(legacyBlob));

      await runMigration();

      const all = await loadCoachThreadsByDate();
      expect(all['2026-05-28'].messages[0].text).toBe('hi');
      expect(all['2026-05-29'].messages[0].text).toBe('hey');
      expect(await AsyncStorage.getItem('nutrifit.coachThreadsByDate.v1')).toBeNull();
    });

    it('running the migration twice is a no-op the second time', async () => {
      await AsyncStorage.setItem('nutrifit.coachThreadsByDate.v1', JSON.stringify({
        '2026-05-28': { date: '2026-05-28', messages: [], memory, createdAt: '2026-05-28T00:00:00.000Z', updatedAt: '2026-05-28T00:00:00.000Z' },
      }));
      await runMigration();
      await runMigration();

      const all = await loadCoachThreadsByDate();
      expect(Object.keys(all)).toEqual(['2026-05-28']);
    });

    it('saving one day does not touch another day already in storage', async () => {
      await saveCoachThreadForDate('2026-06-01', [
        { id: '1', role: 'user', text: 'day one', createdAt: '2026-06-01T00:00:00.000Z' },
      ], memory);
      await saveCoachThreadForDate('2026-06-02', [
        { id: '2', role: 'user', text: 'day two', createdAt: '2026-06-02T00:00:00.000Z' },
      ], memory);

      const all = await loadCoachThreadsByDate();
      expect(all['2026-06-01'].messages[0].text).toBe('day one');
      expect(all['2026-06-02'].messages[0].text).toBe('day two');
    });

    it('preserves createdAt across repeated saves to the same day', async () => {
      const first = await saveCoachThreadForDate('2026-06-03', [
        { id: '1', role: 'user', text: 'first', createdAt: '2026-06-03T00:00:00.000Z' },
      ], memory);
      const second = await saveCoachThreadForDate('2026-06-03', [
        { id: '1', role: 'user', text: 'first', createdAt: '2026-06-03T00:00:00.000Z' },
        { id: '2', role: 'coach', text: 'reply', createdAt: '2026-06-03T00:01:00.000Z' },
      ], memory);

      expect(second.createdAt).toBe(first.createdAt);
      expect(second.messages).toHaveLength(2);
    });

    it('saveCoachThreadsByDate bulk-writes one key per date without disturbing others', async () => {
      await saveCoachThreadForDate('2026-06-04', [], memory);
      await saveCoachThreadsByDate({
        '2026-06-05': { date: '2026-06-05', messages: [], memory, createdAt: '2026-06-05T00:00:00.000Z', updatedAt: '2026-06-05T00:00:00.000Z' },
        '2026-06-06': { date: '2026-06-06', messages: [], memory, createdAt: '2026-06-06T00:00:00.000Z', updatedAt: '2026-06-06T00:00:00.000Z' },
      });

      const all = await loadCoachThreadsByDate();
      expect(Object.keys(all).sort()).toEqual(['2026-06-04', '2026-06-05', '2026-06-06']);
    });

    it('prunes per-day coach thread keys older than the retention window', async () => {
      const today = new Date();
      const recentDate = toDateKey(today);
      const oldDate = toDateKey(new Date(today.getTime() - 100 * 24 * 60 * 60 * 1000));

      await saveCoachThreadForDate(recentDate, [], memory);
      await saveCoachThreadForDate(oldDate, [], memory);

      await runMigration();

      const all = await loadCoachThreadsByDate();
      expect(all[recentDate]).toBeDefined();
      expect(all[oldDate]).toBeUndefined();
    });

    it('purgeAllLocalData removes every per-day coach thread key', async () => {
      await saveCoachThreadForDate('2026-06-10', [], memory);
      await saveCoachThreadForDate('2026-06-11', [], memory);

      await purgeAllLocalData();

      expect(await loadCoachThreadsByDate()).toEqual({});
    });
  });
});
