import {
  MockHealthDataProvider,
  ManualHealthDataProvider,
  AppleHealthProvider,
  createHealthDataProvider,
} from '../js/services/health-provider.js';

test('Mock: deterministický pro stejný seed', async () => {
  const a = new MockHealthDataProvider({ seed: 'test', weightKg: 70 });
  const b = new MockHealthDataProvider({ seed: 'test', weightKg: 70 });
  const dayA = await a.getDailyActivityRange('2026-01-05', '2026-01-07');
  const dayB = await b.getDailyActivityRange('2026-01-05', '2026-01-07');
  expect(JSON.stringify(dayA)).toBe(JSON.stringify(dayB));
});

test('Mock: vrací realistický rozsah kroků', async () => {
  const p = new MockHealthDataProvider({ seed: 'test' });
  const days = await p.getDailyActivityRange('2026-01-05', '2026-01-11');
  expect(days.length).toBe(7);
  days.forEach(d => {
    expect(d.steps).toBeGreaterThanOrEqual(0);
    expect(d.steps).toBeLessThan(20000);
    expect(d.activeEnergyKcal).toBeGreaterThanOrEqual(0);
  });
});

test('Mock: vrací běžecké workouty se vzdáleností a tempem', async () => {
  const p = new MockHealthDataProvider({ seed: 'test' });
  const w = await p.getWorkoutSummaries('2026-01-05', '2026-01-18');
  const runs = w.filter(x => x.kind === 'run');
  expect(runs.length).toBeGreaterThan(0);
  runs.forEach(r => {
    expect(r.distanceKm).toBeGreaterThan(0);
    expect(r.avgPaceSecPerKm).toBeGreaterThan(0);
  });
});

test('Mock: vrací spánková data v rozumném rozsahu (4–10 h)', async () => {
  const p = new MockHealthDataProvider({ seed: 'test' });
  const sleep = await p.getSleepSummary('2026-01-05', '2026-01-11');
  sleep.forEach(s => {
    expect(s.totalMinutes).toBeGreaterThan(240);
    expect(s.totalMinutes).toBeLessThan(600);
  });
});

test('Manual: filtruje pouze v rozsahu', async () => {
  const p = new ManualHealthDataProvider({
    activities: [
      { date: '2026-01-04', steps: 1000, activeEnergyKcal: 100 },
      { date: '2026-01-06', steps: 2000, activeEnergyKcal: 200 },
      { date: '2026-01-10', steps: 3000, activeEnergyKcal: 300 },
    ],
  });
  const range = await p.getDailyActivityRange('2026-01-05', '2026-01-09');
  expect(range.length).toBe(1);
  expect(range[0].steps).toBe(2000);
});

test('Manual: latestBodyWeight bere nejnovější', async () => {
  const p = new ManualHealthDataProvider({
    weights: [
      { date: '2026-01-01', weightKg: 80 },
      { date: '2026-01-10', weightKg: 79.2 },
      { date: '2026-01-05', weightKg: 79.5 },
    ],
  });
  expect(await p.getLatestBodyWeight()).toBe(79.2);
});

test('AppleHealth placeholder: isAvailable=false, ale fallback funguje', async () => {
  const p = new AppleHealthProvider();
  expect(await p.isAvailable()).toBe(false);
  const days = await p.getDailyActivityRange('2026-01-05', '2026-01-07');
  expect(days.length).toBe(3);
});

test('createHealthDataProvider: mode=mock vrací mock', async () => {
  const p = createHealthDataProvider({ mode: 'mock', weightKg: 70 });
  expect(p.name).toBe('mock');
  expect(await p.isAvailable()).toBe(true);
});

test('createHealthDataProvider: mode=apple_health vrací placeholder', () => {
  const p = createHealthDataProvider({ mode: 'apple_health' });
  expect(p.name).toBe('apple_health_placeholder');
});
