import { describe, expect, it } from 'vitest';
import { buildSingleMealRequest } from '../utils/mealPrompts';
import type { Meal, UserProfile, TrainingSession } from '../types';

const profile: UserProfile = {
  gender: 'muz',
  primaryGoal: 'lose_fat',
  trainingGoal: 'run_10k',
  sessionsPerWeek: 3,
  experience: 'intermediate',
  age: 32,
  height: 180,
  weight: 80,
  activityFactor: 1.55,
  likes: 'kuřecí, rýže',
  dislikes: 'mušle, kapr',
  diet: 'standardní',
  mealCount: 5,
};

const breakfast: Meal = {
  mealType: 'Snídaně',
  name: 'Ovesná kaše s banánem',
  kcal: 420,
  protein: 22,
  carbs: 60,
  fat: 9,
  fiber: 8,
  prepTime: 10,
  difficulty: 'Jednoduchá',
  ingredients: ['80 g ovesných vloček', '1 banán'],
  steps: ['Uvař vločky', 'Přidej banán'],
};

const lunch: Meal = {
  mealType: 'Oběd',
  name: 'Kuřecí prsa s rýží',
  kcal: 650,
  protein: 45,
  carbs: 75,
  fat: 14,
  fiber: 6,
  prepTime: 30,
  difficulty: 'Střední',
  ingredients: ['200 g kuřecích prsou', '120 g basmati rýže'],
  steps: ['Opeč kuře', 'Uvař rýži'],
};

describe('buildSingleMealRequest', () => {
  it('embeds the slot label and target macros in the prompt', () => {
    const r = buildSingleMealRequest({ profile, current: breakfast });
    expect(r.mealType).toBe('Snídaně');
    expect(r.prompt).toContain('Snídaně');
    expect(r.prompt).toContain('420 kcal');
    expect(r.prompt).toContain('22 g'); // protein
    expect(r.prompt).toContain('60 g'); // carbs
  });

  it('instructs the AI to avoid the rejected meal name', () => {
    const r = buildSingleMealRequest({ profile, current: breakfast });
    expect(r.prompt).toContain('Ovesná kaše s banánem');
    expect(r.prompt).toContain('AVOID');
  });

  it('lists other meals to discourage protein duplication', () => {
    const r = buildSingleMealRequest({ profile, current: breakfast, otherMeals: [breakfast, lunch] });
    expect(r.prompt).toContain('Oběd: Kuřecí prsa s rýží');
  });

  it('omits training context when session is rest', () => {
    const rest: TrainingSession = { date: '2026-05-27', kind: 'rest', title: 'Volno', durationMinutes: 0, intensity: 'rest' };
    const r = buildSingleMealRequest({ profile, session: rest, current: breakfast });
    expect(r.prompt).not.toContain('TRAINING CONTEXT');
  });

  it('includes training context for a hard session', () => {
    const hard: TrainingSession = { date: '2026-05-27', kind: 'intervals', title: 'Intervaly 6×400 m', durationMinutes: 50, intensity: 'hard' };
    const r = buildSingleMealRequest({ profile, session: hard, current: breakfast });
    expect(r.prompt).toContain('TRAINING CONTEXT');
    expect(r.prompt).toContain('Intervaly 6×400 m');
  });

  it('returns Czech-only output instruction in systemPrompt', () => {
    const r = buildSingleMealRequest({ profile, current: breakfast, locale: 'cs' });
    expect(r.systemPrompt).toContain('Czech');
    expect(r.systemPrompt).toMatch(/ONE.*JSON|JSON.*meal object/i);
  });

  it('uses a tighter maxTokens than the full-plan builder (under 1500)', () => {
    const r = buildSingleMealRequest({ profile, current: breakfast });
    expect(r.maxTokens).toBeLessThan(1500);
    expect(r.maxTokens).toBeGreaterThan(400);
  });

  it('respects diet style in the prompt', () => {
    const vegan: UserProfile = { ...profile, diet: 'veganský' };
    const r = buildSingleMealRequest({ profile: vegan, current: breakfast });
    expect(r.prompt).toContain('veganský');
  });

  it('respects allergies / dislikes', () => {
    const r = buildSingleMealRequest({ profile, current: breakfast });
    expect(r.prompt).toContain('mušle, kapr');
  });
});
