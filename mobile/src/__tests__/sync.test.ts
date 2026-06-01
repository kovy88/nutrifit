import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildSyncRows,
  clearPendingSyncWrites,
  loadPendingSyncWrites,
  queuePendingSyncWrite,
  resolveByUpdatedAt,
} from '../services/sync';
import { DEFAULT_PROFILE } from '../utils/nutrition';

vi.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    default: {
      getItem: vi.fn().mockImplementation(async (key: string) => store[key] || null),
      setItem: vi.fn().mockImplementation(async (key: string, val: string) => { store[key] = val; }),
      removeItem: vi.fn().mockImplementation(async (key: string) => { delete store[key]; }),
      clear: vi.fn().mockImplementation(async () => { Object.keys(store).forEach(k => delete store[k]); }),
    },
  };
});

vi.mock('../services/supabase', () => ({
  supabase: { from: () => ({ upsert: vi.fn().mockResolvedValue({ error: null }) }) },
}));

describe('sync helpers', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('resolves updated-at conflicts by newer record and reports the decision', () => {
    const local = { value: 'local', updatedAt: '2026-05-30T10:00:00.000Z' };
    const remote = { value: 'remote', updatedAt: '2026-05-30T09:00:00.000Z' };
    const result = resolveByUpdatedAt('training_completions', '2026-05-30', local, remote);
    expect(result.value).toBe(local);
    expect(result.conflict?.resolvedBy).toBe('local');
  });

  it('queues pending writes for offline/background retry', async () => {
    await clearPendingSyncWrites();
    await queuePendingSyncWrite({ entity: 'profile', payload: { reason: 'offline' } });
    await queuePendingSyncWrite({ entity: 'weight_entries', payload: { date: '2026-05-30' } });
    const writes = await loadPendingSyncWrites();
    expect(writes).toHaveLength(2);
    expect(writes[0].entity).toBe('profile');
  });

  it('builds deterministic Supabase rows from the local snapshot', () => {
    const rows = buildSyncRows({
      profile: DEFAULT_PROFILE,
      plansByDate: {
        '2026-05-30': [{
          mealType: 'Snídaně',
          name: 'Skyr',
          kcal: 300,
          protein: 30,
          carbs: 30,
          fat: 6,
          fiber: 4,
          prepTime: 3,
          difficulty: 'easy',
          ingredients: [],
          steps: [],
        }],
      },
      foodLogsByDate: {
        '2026-05-30': [{
          id: 'food-1',
          createdAt: '2026-05-30T08:00:00.000Z',
          source: 'manual',
          foodName: 'Skyr',
          kcal: 300,
          protein: 30,
          carbs: 30,
          fat: 6,
        }],
      },
      sessionsByDate: {},
      weightsByDate: { '2026-05-30': 80 },
      checkIns: [],
      trainingCompletionsByDate: {
        '2026-05-30': {
          date: '2026-05-30',
          status: 'completed',
          plannedSession: null,
          source: 'manual',
          createdAt: '2026-05-30T10:00:00.000Z',
          updatedAt: '2026-05-30T10:00:00.000Z',
        },
      },
    }, 'user-1', '2026-05-30T12:00:00.000Z');

    expect(rows.profile[0].user_id).toBe('user-1');
    expect(rows.dailyMealPlans[0].total_kcal).toBe(300);
    expect(rows.dailyFoodLogs[0].client_id).toBe('food-1');
    expect(rows.weightEntries[0].weight_kg).toBe(80);
    expect(rows.trainingCompletions[0].status).toBe('completed');
  });
});
