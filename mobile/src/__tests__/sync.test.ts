import { describe, expect, it, vi } from 'vitest';
import {
  buildSyncRows,
  mergeRecordsByUpdatedAt,
  resolveByUpdatedAt,
} from '../services/sync';
import { DEFAULT_PROFILE } from '../utils/nutrition';

vi.mock('../services/supabase', () => ({
  supabase: { from: () => ({ upsert: vi.fn().mockResolvedValue({ error: null }) }) },
}));

describe('sync helpers', () => {
  it('resolves updated-at conflicts by newer record and reports the decision', () => {
    const local = { value: 'local', updatedAt: '2026-05-30T10:00:00.000Z' };
    const remote = { value: 'remote', updatedAt: '2026-05-30T09:00:00.000Z' };
    const result = resolveByUpdatedAt('training_completions', '2026-05-30', local, remote);
    expect(result.value).toBe(local);
    expect(result.conflict?.resolvedBy).toBe('local');
  });

  it('mergeRecordsByUpdatedAt picks the newer record per key and unions both key sets', () => {
    const local = {
      '2026-05-30': { value: 'local-newer', updatedAt: '2026-05-30T10:00:00.000Z' },
      '2026-05-31': { value: 'local-only', updatedAt: '2026-05-31T00:00:00.000Z' },
    };
    const remote = {
      '2026-05-30': { value: 'remote-older', updatedAt: '2026-05-30T09:00:00.000Z' },
      '2026-06-01': { value: 'remote-only', updatedAt: '2026-06-01T00:00:00.000Z' },
    };
    const { merged } = mergeRecordsByUpdatedAt('training_completions', local, remote);
    expect(merged['2026-05-30'].value).toBe('local-newer');
    expect(merged['2026-05-31'].value).toBe('local-only');
    expect(merged['2026-06-01'].value).toBe('remote-only');
  });

  it('mergeRecordsByUpdatedAt only reports a conflict when the two sides actually disagree', () => {
    const identical = { value: 'same', updatedAt: '2026-05-30T10:00:00.000Z' };
    const local = { '2026-05-30': identical };
    const remote = { '2026-05-30': { ...identical } };
    const { conflicts } = mergeRecordsByUpdatedAt('training_completions', local, remote);
    expect(conflicts).toHaveLength(0);
  });

  it('mergeRecordsByUpdatedAt reports a conflict when both sides exist and differ', () => {
    const local = { '2026-05-30': { value: 'local', updatedAt: '2026-05-30T10:00:00.000Z' } };
    const remote = { '2026-05-30': { value: 'remote', updatedAt: '2026-05-30T09:00:00.000Z' } };
    const { conflicts } = mergeRecordsByUpdatedAt('training_completions', local, remote);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].resolvedBy).toBe('local');
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
      checkIns: [{
        weekStartISO: '2026-05-25',
        weightKg: 80,
        adherence: 0.8,
        energyLevel: 3,
        hungerLevel: 2,
        sorenessLevel: 4,
        createdAt: '2026-05-30T10:00:00.000Z',
        updatedAt: '2026-05-30T10:00:00.000Z',
      }],
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
    expect(rows.weeklyCheckins[0].soreness_level).toBe(4);
    expect(rows.trainingCompletions[0].status).toBe('completed');
  });

  it('stamps weekly_checkins rows with each check-in\'s own updatedAt, not the push-time timestamp', () => {
    const rows = buildSyncRows({
      profile: DEFAULT_PROFILE,
      plansByDate: {},
      foodLogsByDate: {},
      sessionsByDate: {},
      weightsByDate: {},
      checkIns: [{
        weekStartISO: '2026-05-25',
        adherence: 0.8,
        createdAt: '2026-05-25T09:00:00.000Z',
        updatedAt: '2026-05-25T09:00:00.000Z',
      }],
      trainingCompletionsByDate: {},
      // push-time timestamp is deliberately different from the check-in's own
      // updatedAt above — a real edit-time timestamp must win, matching the
      // pattern training_completions already used before this fix.
    }, 'user-1', '2026-06-01T12:00:00.000Z');

    expect(rows.weeklyCheckins[0].updated_at).toBe('2026-05-25T09:00:00.000Z');
  });
});
