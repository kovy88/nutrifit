import { buildTrainingSessionForDate, startOfWeekISO } from '../js/services/daily-training-session.js';
import { calcMacroTargets, adjustForDay } from '../js/domain/nutrition.js';

const profile = {
  sex: 'male',
  ageYears: 35,
  heightCm: 180,
  weightKg: 82,
  activityLevel: 'moderate',
};

test('startOfWeekISO: vrací pondělí pro datum uprostřed týdne', () => {
  expect(startOfWeekISO('2026-05-27')).toBe('2026-05-25');
});

test('buildTrainingSessionForDate: wizard běžecký cíl vrací session pro vybraný den', () => {
  const session = buildTrainingSessionForDate('2026-05-30', {
    trainingGoal: 'run_10k',
    sessionsPerWeek: 4,
  });
  expect(session.date).toBe('2026-05-30');
  expect(session.kind).toBe('long_run');
});

test('buildTrainingSessionForDate: ruční denní plánovač má přednost před wizardem', () => {
  const session = buildTrainingSessionForDate(
    '2026-05-30',
    { trainingGoal: 'run_10k', sessionsPerWeek: 4 },
    {
      used: true,
      activities: [
        { type: 'rest', isRest: true },
        { type: 'rest', isRest: true },
        { type: 'rest', isRest: true },
        { type: 'rest', isRest: true },
        { type: 'rest', isRest: true },
        { type: 'cardio', durationMinutes: 100, isRest: false },
        { type: 'rest', isRest: true },
      ],
    },
  );
  expect(session.kind).toBe('long_run');
  expect(session.durationMinutes).toBe(100);
});

test('daily adjustment: long-run zvedne kcal a sacharidy', () => {
  const baseline = calcMacroTargets(profile, { kind: 'endurance' });
  const adjusted = adjustForDay(baseline, {
    date: '2026-05-30',
    kind: 'long_run',
    title: 'Long run',
    durationMinutes: 100,
    intensity: 'moderate',
  }, profile);
  expect(adjusted.kcal).toBeGreaterThan(baseline.kcal);
  expect(adjusted.carbsG).toBeGreaterThan(baseline.carbsG);
});

test('daily adjustment: rest day sníží sacharidy bez změny kcal', () => {
  const baseline = calcMacroTargets(profile, { kind: 'maintenance' });
  const adjusted = adjustForDay(baseline, {
    date: '2026-05-31',
    kind: 'rest',
    title: 'Volno',
    durationMinutes: 0,
    intensity: 'rest',
  }, profile);
  expect(adjusted.kcal).toBe(baseline.kcal);
  expect(adjusted.carbsG).toBeLessThan(baseline.carbsG);
});
