import { buildAIPlanPrompt, validateAIPlanOutput } from '../js/services/ai-plan-service.js';
import { calcMacroTargets } from '../js/domain/nutrition.js';

const profile = {
  sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80,
  activityLevel: 'moderate', diet: 'omnivore',
};
const goal = { kind: 'fat_loss' };
const target = calcMacroTargets(profile, goal);

test('buildAIPlanPrompt: vrací system + user prompt s konkrétními makry', () => {
  const { systemPrompt, prompt } = buildAIPlanPrompt({
    profile, nutritionGoal: goal, macros: target,
  });
  expect(systemPrompt.length).toBeGreaterThan(100);
  expect(prompt).toContain(`kcal=${target.kcal}`);
  expect(prompt).toContain(`protein=${target.proteinG}g`);
  expect(prompt).toContain('do not recompute');
});

test('buildAIPlanPrompt: bez trainingPlanu nemá week sekci', () => {
  const { prompt } = buildAIPlanPrompt({ profile, nutritionGoal: goal, macros: target });
  expect(prompt).toContain('Training week');
  expect(prompt).toContain('none');
});

test('buildAIPlanPrompt: trainingPlan předaný jako kompletní struktura', () => {
  const trainingPlan = {
    goalKind: 'run_10k', weekStartISO: '2026-01-05', weekIndex: 0,
    totalKm: 30, warnings: [],
    sessions: [
      { date: '2026-01-05', kind: 'easy_run', title: 'Lehký', distanceKm: 6, durationMinutes: 36, intensity: 'easy' },
      { date: '2026-01-06', kind: 'intervals', title: 'Kvalita', distanceKm: 6, durationMinutes: 35, intensity: 'hard' },
    ],
  };
  const { prompt } = buildAIPlanPrompt({ profile, nutritionGoal: goal, macros: target, trainingPlan });
  expect(prompt).toContain('2026-01-05 easy_run');
  expect(prompt).toContain('intervals');
});

test('validateAIPlanOutput: detekuje chybějící pole', () => {
  const out = validateAIPlanOutput({ summary: 'x' }, target);
  expect(out.ok).toBe(false);
  expect(out.errors.length).toBeGreaterThan(0);
});

test('validateAIPlanOutput: úspěch při validním 1-day výstupu', () => {
  const totalKcal = target.kcal;
  const protein = target.proteinG;
  const fat = target.fatG;
  const carbs = target.carbsG;
  // Postav jeden den ze 2 jídel, jejichž součet = target a kcal = p*4+c*4+f*9
  const meal1 = halfMeal(Math.round(totalKcal * 0.4), Math.round(protein * 0.4), Math.round(carbs * 0.4), Math.round(fat * 0.4));
  const meal2 = halfMeal(totalKcal - meal1.calories, protein - meal1.protein, carbs - meal1.carbs, fat - meal1.fat);
  const raw = {
    summary: 'ok',
    dailyCalories: totalKcal,
    macros: { protein, carbs, fat },
    mealPlan: [{ day: 'Pondělí', meals: [meal1, meal2] }],
    trainingPlan: [],
    recommendations: [],
    warnings: [],
  };
  const res = validateAIPlanOutput(raw, target);
  if (!res.ok) console.error(res.errors);
  expect(res.ok).toBe(true);
});

function halfMeal(kcal, p, c, f) {
  // Dorovnej kcal přesně na p*4+c*4+f*9
  const exact = p * 4 + c * 4 + f * 9;
  return {
    name: 'Snídaně', title: 'Test', ingredients: ['x'], steps: ['y'],
    calories: exact, protein: p, carbs: c, fat: f, prepTimeMinutes: 10,
  };
}

test('validateAIPlanOutput: detekuje vnitřně nekonzistentní makra', () => {
  const raw = {
    summary: 'x',
    dailyCalories: target.kcal,
    macros: { protein: target.proteinG, carbs: target.carbsG, fat: target.fatG },
    mealPlan: [{
      day: 'Pondělí',
      meals: [{
        name: 'Snídaně', title: 'x', ingredients: ['x'], steps: ['y'],
        calories: 800, protein: 10, carbs: 10, fat: 10, prepTimeMinutes: 5,
        // 10*4+10*4+10*9 = 170, ale calories 800 — neplatí
      }],
    }],
    trainingPlan: [],
    recommendations: [], warnings: [],
  };
  const res = validateAIPlanOutput(raw, target);
  expect(res.ok).toBe(false);
});
