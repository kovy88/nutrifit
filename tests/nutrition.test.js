import {
  calcBMR,
  calcTDEE,
  calcMacroTargets,
  adjustForDay,
  planWeeklyAdjustment,
  validateMealPlanMacros,
  primaryGoalToNutritionKind,
  SAFETY,
} from '../js/domain/nutrition.js';
import { GOAL_CONSTRAINTS } from '../js/domain/types.js';

const baseProfile = {
  sex: 'male',
  ageYears: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'moderate',
};

test('BMR Mifflin-St Jeor — muž 30/180/80', () => {
  // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
  expect(calcBMR(baseProfile)).toBe(1780);
});

test('BMR Mifflin-St Jeor — žena 28/165/65', () => {
  // 10*65 + 6.25*165 - 5*28 - 161 = 650 + 1031.25 - 140 - 161 = 1380.25
  expect(calcBMR({ ...baseProfile, sex: 'female', ageYears: 28, heightCm: 165, weightKg: 65 })).toBe(1380);
});

test('TDEE = BMR × activity factor (moderate ≈ 1.55)', () => {
  const tdee = calcTDEE(baseProfile);
  expect(tdee).toBeCloseTo(Math.round(1780 * 1.55), 1);
});

test('fat_loss: kalorický deficit, neklesne pod safe minimum', () => {
  const out = calcMacroTargets(baseProfile, { kind: 'fat_loss' });
  expect(out.kcal).toBeLessThan(out.tdee);
  expect(out.kcal).toBeGreaterThanOrEqual(SAFETY.MIN_KCAL_MALE);
});

test('fat_loss: tempo přes 1 % tělesné hmotnosti se omezí na safe', () => {
  const out = calcMacroTargets(baseProfile, { kind: 'fat_loss', weeklyRateKg: 1.5 });
  // 1 % z 80 kg = 0.8 kg → max safe ~880 kcal/den deficit
  const deficit = out.tdee - out.kcal;
  expect(deficit).toBeLessThanOrEqual(880);
  expect(out.note).toContain('1 %');
});

test('muscle_gain: mírný surplus ~12 %', () => {
  const out = calcMacroTargets(baseProfile, { kind: 'muscle_gain' });
  expect(out.kcal).toBeGreaterThan(out.tdee);
  expect(out.kcal).toBeLessThanOrEqual(Math.round(out.tdee * 1.15));
});

test('maintenance = TDEE', () => {
  const out = calcMacroTargets(baseProfile, { kind: 'maintenance' });
  expect(out.kcal).toBe(out.tdee);
});

test('endurance: mírný surplus + poznámka', () => {
  const out = calcMacroTargets(baseProfile, { kind: 'endurance' });
  expect(out.kcal).toBeGreaterThan(out.tdee);
  expect(out.note).toContain('vytrvalost');
});

test('makra mají internal konzistenci (kcal ≈ p*4 + c*4 + f*9)', () => {
  const m = calcMacroTargets(baseProfile, { kind: 'fat_loss' });
  const sum = m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
  expect(Math.abs(sum - m.kcal)).toBeLessThanOrEqual(10);
});

test('protein 2.2 g/kg pro fat_loss', () => {
  const m = calcMacroTargets(baseProfile, { kind: 'fat_loss' });
  expect(m.proteinG).toBe(Math.round(80 * 2.2));
});

test('protein 1.4 g/kg pro general_fitness', () => {
  const m = calcMacroTargets(baseProfile, { kind: 'general_fitness' });
  expect(m.proteinG).toBe(Math.round(80 * 1.4));
});

test('rest day: méně sacharidů, víc tuků, kcal beze změny', () => {
  const baseline = calcMacroTargets(baseProfile, { kind: 'maintenance' });
  const day = adjustForDay(baseline, { date: '2026-01-05', kind: 'rest', intensity: 'rest', title: '' }, baseProfile);
  expect(day.carbsG).toBeLessThan(baseline.carbsG);
  expect(day.fatG).toBeGreaterThan(baseline.fatG);
});

test('long-run day: navýšení sacharidů (refuel + pre-fuel)', () => {
  const baseline = calcMacroTargets(baseProfile, { kind: 'endurance' });
  const day = adjustForDay(
    baseline,
    { date: '2026-01-05', kind: 'long_run', intensity: 'moderate', title: '', distanceKm: 18, durationMinutes: 110 },
    baseProfile,
  );
  expect(day.carbsG).toBeGreaterThan(baseline.carbsG + 60);
  expect(day.note).toContain('Long run');
});

test('training day: kcal narostou, protein zůstává', () => {
  const baseline = calcMacroTargets(baseProfile, { kind: 'maintenance' });
  const day = adjustForDay(
    baseline,
    { date: '2026-01-05', kind: 'intervals', intensity: 'hard', title: '', durationMinutes: 45 },
    baseProfile,
  );
  expect(day.kcal).toBeGreaterThan(baseline.kcal);
  expect(day.proteinG).toBe(baseline.proteinG);
});

test('weekly adjustment: stagnace u fat_loss → −150 kcal', () => {
  const baseline = calcMacroTargets(baseProfile, { kind: 'fat_loss' });
  const adj = planWeeklyAdjustment(baseline, { kind: 'fat_loss' }, [
    { weekStartISO: '2026-01-05', weightKg: 80, adherence: 0.85 },
    { weekStartISO: '2026-01-12', weightKg: 80.0, adherence: 0.85 },
  ]);
  expect(adj.kcalDelta).toBe(-150);
});

test('weekly adjustment: rychlé hubnutí varuje + zvýší kcal', () => {
  const baseline = calcMacroTargets(baseProfile, { kind: 'fat_loss' });
  const adj = planWeeklyAdjustment(baseline, { kind: 'fat_loss' }, [
    { weekStartISO: '2026-01-05', weightKg: 80, adherence: 0.9 },
    { weekStartISO: '2026-01-12', weightKg: 78.5, adherence: 0.9 },
  ]);
  expect(adj.kcalDelta).toBeGreaterThan(0);
  expect(adj.warnings.length).toBeGreaterThan(0);
});

test('validateMealPlanMacros: detekuje nesedící meal', () => {
  const target = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 70 };
  const meals = [
    { kcal: 500, proteinG: 30, carbsG: 60, fatG: 15 },  // 30*4+60*4+15*9 = 495 ok
    { kcal: 900, proteinG: 50, carbsG: 30, fatG: 10 },  // 50*4+30*4+10*9 = 410 vs 900 — mimo
  ];
  const res = validateMealPlanMacros(meals, target);
  expect(res.ok).toBe(false);
  expect(res.errors.length).toBeGreaterThan(0);
});

// ── PRIMARY GOAL → NUTRITION KIND ──────────────────────────────────────────

test('primaryGoalToNutritionKind: lose_weight → fat_loss', () => {
  expect(primaryGoalToNutritionKind('lose_weight')).toBe('fat_loss');
});

test('primaryGoalToNutritionKind: gain_muscle → muscle_gain', () => {
  expect(primaryGoalToNutritionKind('gain_muscle')).toBe('muscle_gain');
});

test('primaryGoalToNutritionKind: run_race / triathlon / hyrox_ocr → endurance', () => {
  expect(primaryGoalToNutritionKind('run_race')).toBe('endurance');
  expect(primaryGoalToNutritionKind('triathlon')).toBe('endurance');
  expect(primaryGoalToNutritionKind('hyrox_ocr')).toBe('endurance');
});

test('primaryGoalToNutritionKind: ostatní → maintenance', () => {
  expect(primaryGoalToNutritionKind('get_fit')).toBe('maintenance');
  expect(primaryGoalToNutritionKind('maintain_weight')).toBe('maintenance');
  expect(primaryGoalToNutritionKind('sport_conditioning')).toBe('maintenance');
});

// ── GOAL_CONSTRAINTS ────────────────────────────────────────────────────────

test('GOAL_CONSTRAINTS: každý PrimaryGoal má neprázdné pole TrainingGoalKind hodnot', () => {
  const primaryGoals = ['lose_weight', 'maintain_weight', 'gain_muscle', 'run_race', 'triathlon', 'hyrox_ocr', 'get_fit', 'sport_conditioning'];
  for (const pg of primaryGoals) {
    expect(Array.isArray(GOAL_CONSTRAINTS[pg])).toBe(true);
    expect(GOAL_CONSTRAINTS[pg].length).toBeGreaterThan(0);
  }
});

test('GOAL_CONSTRAINTS: triatlon obsahuje všechny 4 vzdálenosti', () => {
  const tri = GOAL_CONSTRAINTS['triathlon'];
  expect(tri).toContain('sprint_triathlon');
  expect(tri).toContain('olympic_triathlon');
  expect(tri).toContain('half_ironman');
  expect(tri).toContain('full_ironman');
});

test('GOAL_CONSTRAINTS: hyrox_ocr neobsahuje běžecké cíle', () => {
  const hyrox = GOAL_CONSTRAINTS['hyrox_ocr'];
  expect(hyrox.every(k => !['run_5k', 'run_10k', 'half_marathon', 'marathon'].includes(k))).toBe(true);
});
