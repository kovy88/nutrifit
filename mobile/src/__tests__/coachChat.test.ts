import { describe, it, expect } from 'vitest';
import { buildCoachChatRequest, buildExplainRequest, type CoachChatContext } from '../lib/ai/coachChat';
import type { CoachMessage, DailyCoachRecommendation } from '../types/coach';

const rec: DailyCoachRecommendation = {
  date: '2026-05-30',
  emoji: '🟡',
  headline: 'Easy run. Slightly reduced readiness.',
  readiness: { score: 58, band: 'medium', recommendedIntensity: 'moderate', drivers: ['Low sleep'], confidence: 'medium' },
  training: { session: { date: '2026-05-30', kind: 'easy_run', title: 'Lehký běh', durationMinutes: 40, intensity: 'easy' }, focus: 'Aerobní báze', adjusted: false },
  nutrition: { targets: { kcal: 2300, protein: 150, carbs: 230, fat: 60, fiber: 30, waterMl: 2500, bmr: 1600, tdee: 2200, bmi: 23, goal: 'fat_loss' }, deltaVsBaselineKcal: 100, reason: 'training day' },
  coachNote: 'Keep it easy today.',
  warnings: [],
  suggestedActions: ['swap_meal', 'ask_coach'],
};

const context: CoachChatContext = { recommendation: rec, goalSummary: 'lose_weight + run_10k', recentWeightTrendKgPerWeek: -0.3 };

describe('buildCoachChatRequest', () => {
  it('instructs the model to not invent numbers and to return JSON', () => {
    const r = buildCoachChatRequest({ context, history: [], question: 'Mám dnes běžet?', locale: 'cs' });
    expect(r.systemPrompt).toMatch(/NEVER invent/i);
    expect(r.systemPrompt).toMatch(/JSON/);
    expect(r.systemPrompt).toMatch(/medical/i);
  });

  it('embeds the deterministic plan context and the question', () => {
    const r = buildCoachChatRequest({ context, history: [], question: 'Co k obědu?', locale: 'cs' });
    expect(r.prompt).toContain('Readiness: 58/100');
    expect(r.prompt).toContain('2300 kcal');
    expect(r.prompt).toContain('lose_weight + run_10k');
    expect(r.prompt).toContain('Co k obědu?');
  });

  it('includes recent conversation turns (trimmed)', () => {
    const history = Array.from({ length: 8 }, (_, i): CoachMessage => ({ id: `${i}`, role: i % 2 ? 'coach' : 'user', text: `msg${i}`, createdAt: '' }));
    const r = buildCoachChatRequest({ context, history, question: 'next', locale: 'en' });
    expect(r.prompt).toContain('CONVERSATION SO FAR:');
    expect(r.prompt).toContain('msg7');
    expect(r.prompt).not.toContain('msg1'); // only last 6 kept
  });

  it('explainer asks why and carries the context', () => {
    const r = buildExplainRequest({ context, locale: 'en' });
    expect(r.prompt.toLowerCase()).toContain('why is this my recommendation');
    expect(r.prompt).toContain('Readiness: 58/100');
  });

  it('handles a null recommendation without throwing', () => {
    const r = buildCoachChatRequest({ context: { recommendation: null, goalSummary: 'get_fit' }, history: [], question: 'ahoj', locale: 'cs' });
    expect(r.prompt).toContain('Goal: get_fit');
    expect(r.prompt).toContain('ahoj');
  });
});
