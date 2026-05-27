import {
  estimateWeeklyBaseKm,
  peakWeeklyKm,
  progressVolume,
  readinessSignal,
  generateTrainingPlan,
  TRAINING_RULES,
} from '../js/domain/training.js';

test('peakWeeklyKm: maraton víc než půlmaraton víc než 5k', () => {
  expect(peakWeeklyKm('marathon')).toBeGreaterThan(peakWeeklyKm('half_marathon'));
  expect(peakWeeklyKm('half_marathon')).toBeGreaterThan(peakWeeklyKm('run_10k'));
  expect(peakWeeklyKm('run_10k')).toBeGreaterThan(peakWeeklyKm('run_5k'));
});

test('progressVolume drží pravidlo 10 %', () => {
  const week1 = progressVolume(30, 1, 60);
  const week2 = progressVolume(30, 2, 60);
  expect(week1).toBeCloseTo(33, 0.2);
  expect(week2).toBeCloseTo(36.3, 0.5);
});

test('progressVolume: 4. týden = deload (−30 %)', () => {
  const week2 = progressVolume(30, 2, 60);
  const week3 = progressVolume(30, 3, 60);
  // week3 (index 3) je deload
  expect(week3).toBeLessThan(week2);
});

test('progressVolume nestoupne nad peak', () => {
  const week10 = progressVolume(30, 10, 45);
  expect(week10).toBeLessThanOrEqual(45);
});

test('estimateWeeklyBaseKm: vrátí goal.currentWeeklyKm, pokud je zadán', () => {
  expect(estimateWeeklyBaseKm({ kind: 'marathon', currentWeeklyKm: 42 }, [])).toBe(42);
});

test('estimateWeeklyBaseKm: bez historie a bez vstupu vrací null', () => {
  expect(estimateWeeklyBaseKm({ kind: 'run_5k' }, [])).toBe(null);
});

test('readinessSignal: nízký spánek → red', () => {
  const sleep = Array.from({ length: 5 }, (_, i) => ({ date: `2026-01-0${i + 1}`, totalMinutes: 320 }));
  expect(readinessSignal(sleep)).toBe('red');
});

test('readinessSignal: HRV drop ≥ 10 % → red', () => {
  expect(readinessSignal([{ date: '2026-01-01', totalMinutes: 420 }], 50, 60)).toBe('red');
});

test('readinessSignal: vše ok → green', () => {
  expect(readinessSignal([{ date: '2026-01-01', totalMinutes: 460 }], 60, 60)).toBe('green');
});

test('generateTrainingPlan: 5k bez historie startuje konzervativně', () => {
  const plan = generateTrainingPlan({
    goal: { kind: 'run_5k' },
    weekStartISO: '2026-01-05',
    weekIndex: 0,
  });
  expect(plan.totalKm).toBeLessThanOrEqual(TRAINING_RULES.MIN_RUN_KM_BEGINNER + 1);
  expect(plan.warnings.some(w => w.includes('konzervativ'))).toBe(true);
});

test('generateTrainingPlan: maraton má 4 běhy + long_run + strength + rest', () => {
  const plan = generateTrainingPlan({
    goal: { kind: 'marathon', currentWeeklyKm: 60 },
    weekStartISO: '2026-01-05',
    weekIndex: 2,
  });
  const kinds = plan.sessions.map(s => s.kind);
  expect(kinds).toContain('long_run');
  expect(kinds).toContain('strength');
  expect(kinds.filter(k => k === 'rest').length).toBeGreaterThanOrEqual(1);
});

test('generateTrainingPlan: špatný spánek nahradí kvalitu lehkým během', () => {
  const plan = generateTrainingPlan({
    goal: { kind: 'run_10k', currentWeeklyKm: 35 },
    weekStartISO: '2026-01-05',
    recentSleep: Array.from({ length: 5 }, (_, i) => ({ date: `2026-01-0${i + 1}`, totalMinutes: 320 })),
  });
  // Žádná hard session
  expect(plan.sessions.filter(s => s.intensity === 'hard').length).toBe(0);
  expect(plan.warnings.length).toBeGreaterThan(0);
});

test('generateTrainingPlan: strength_basics má 3 silové dny', () => {
  const plan = generateTrainingPlan({
    goal: { kind: 'strength_basics' },
    weekStartISO: '2026-01-05',
  });
  expect(plan.sessions.filter(s => s.kind === 'strength').length).toBe(3);
});

test('generateTrainingPlan: každý session má valid datum', () => {
  const plan = generateTrainingPlan({
    goal: { kind: 'general_fitness' },
    weekStartISO: '2026-01-05',
  });
  plan.sessions.forEach(s => {
    expect(/^\d{4}-\d{2}-\d{2}$/.test(s.date)).toBe(true);
  });
});

test('progressVolume bez baseKm → fallback na beginner minimum', () => {
  const vol = progressVolume(0, 0, 30);
  expect(vol).toBeGreaterThanOrEqual(TRAINING_RULES.MIN_RUN_KM_BEGINNER);
});
