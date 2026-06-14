import { describe, expect, it } from 'vitest';
import { buildDailyCoachPrompt } from '../lib/ai/coach-prompt-builder';
import { DEFAULT_PROFILE } from '../utils/nutrition';
import type { Macros, TrainingSession } from '../types';
import type { ReadinessScore } from '../types/coach';
import type { TrainingLoadAssessment } from '../lib/coaching/trainingLoad';

const macros: Macros = {
  kcal: 2300,
  protein: 150,
  carbs: 240,
  fat: 70,
  fiber: 30,
  waterMl: 2500,
  bmr: 1600,
  tdee: 2200,
  bmi: 23,
  goal: 'maintenance',
};

const readiness: ReadinessScore = {
  score: 58,
  band: 'medium',
  recommendedIntensity: 'moderate',
  drivers: ['Low sleep'],
  confidence: 'medium',
};

const session: TrainingSession = {
  date: '2026-05-30',
  kind: 'easy_run',
  title: 'Lehký běh',
  durationMinutes: 40,
  intensity: 'easy',
};

const trainingLoad: TrainingLoadAssessment = {
  acute: 70,
  chronic: 52,
  acwr: 1.34,
  status: 'overreaching',
  message: 'This week is well above your usual rhythm.',
  recommendation: 'Cut volume ~20%.',
  workoutCountAcute: 5,
  workoutCountChronic: 16,
};

describe('buildDailyCoachPrompt', () => {
  it('keeps deterministic numbers but humanizes goal, intensity and load context', () => {
    const request = buildDailyCoachPrompt({
      profile: { ...DEFAULT_PROFILE, primaryGoal: 'lose_fat', trainingGoal: 'run_10k', experience: 'intermediate' },
      readiness,
      session,
      macros,
      trainingLoad,
      locale: 'en',
    });

    expect(request.systemPrompt).toContain('Use user-facing wording');
    expect(request.prompt).toContain('Goal: Fat loss');
    expect(request.prompt).toContain('Training focus: 10 km');
    expect(request.prompt).toContain('Today score: 58/100 (steady)');
    expect(request.prompt).toContain("Today's ceiling: steady");
    expect(request.prompt).toContain("Today's workout: Lehký běh (40 min, light)");
    expect(request.prompt).toContain('Training load vs usual: higher than usual (1.34)');
    expect(request.prompt).toContain('2300 kcal');
    expect(request.prompt).not.toContain('lose_fat');
    expect(request.prompt).not.toContain('run_10k');
    expect(request.prompt).not.toContain('Recommended intensity');
    expect(request.prompt).not.toContain('ACWR');
  });
});
