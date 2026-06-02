import { describe, expect, it, vi, beforeEach } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadPlansByDate,
  loadProfile,
  savePlanForDate,
  loadFoodLogsByDate,
  saveFoodLogForDate,
  loadSessionsByDate,
  saveSessionForDate,
  listStoredDates,
  runMigration,
  loadCoachThreadsByDate,
  loadDailyCoachHistory,
  loadTrainingCompletionsByDate,
  saveCoachThreadForDate,
  saveDailyCoachRecommendationForDate,
  saveTrainingCompletionForDate,
} from '../services/storage';
import { toDateKey } from '../utils/nutrition';
import type { Meal, FoodLogItem } from '../types';
import { generateDailyCoachRecommendation } from '../lib/coaching/dailyCoach';
import { DEFAULT_PROFILE, calculateMacros } from '../utils/nutrition';

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
});
