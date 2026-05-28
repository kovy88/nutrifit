// ── MACRO ADHERENCE TREND
//
// Spočítá kolik % z plánovaných kalorií uživatel snědl každý den.
// Vstup: plans + logs z NutriFitContext (oba indexed by DateKey).
//
// Algoritmus:
//   - Pro každý den v rozsahu: sum kcal plan vs. sum kcal log
//   - Vrátíme:
//       1.0  = přesně cíl (skvělé)
//       0.95 = -5% pod cílem
//       1.05 = +5% nad cílem
//   - null = ani plán ani log → neukazuj jako nulu
//
// UI použije pro MiniTrendChart — pokud chce barevné zóny:
//       < 0.85 nebo > 1.15 = red (mimo)
//       0.85–0.95 / 1.05–1.15 = yellow
//       0.95–1.05 = green

import type { Meal, FoodLogItem, DailyPlanRecord, DailyFoodLogRecord } from '../../types';
import type { TrendPoint } from '../../components/MiniTrendChart';

export type AdherenceDay = {
  date: string;
  plannedKcal: number;
  loggedKcal: number;
  /** ratio logged/planned, null pokud plán = 0 (uživatel nevygeneroval). */
  ratio: number | null;
};

export type AdherenceSummary = {
  /** Posledních N dní podrobně. */
  days: AdherenceDay[];
  /** Průměr ratio přes dny, které mají plán i log. null pokud žádný. */
  averageRatio: number | null;
  /** Kolik dní mělo log (uživatel se aktivně zapsal). */
  loggedDays: number;
  /** Kolik dní mělo plán. */
  plannedDays: number;
};

export function computeAdherenceTrend(
  plans: DailyPlanRecord,
  logs: DailyFoodLogRecord,
  days = 14,
  endDate: Date = new Date(),
): AdherenceSummary {
  const dayList: AdherenceDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const date = toDateKey(d);
    const planMeals = plans[date] || [];
    const logItems = logs[date] || [];
    const plannedKcal = sumKcal(planMeals);
    const loggedKcal = sumKcalLog(logItems);
    const ratio = plannedKcal > 0 ? loggedKcal / plannedKcal : null;
    dayList.push({ date, plannedKcal, loggedKcal, ratio });
  }
  const ratios = dayList.map(d => d.ratio).filter((r): r is number => r != null);
  const averageRatio = ratios.length
    ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) / 100
    : null;
  const loggedDays = dayList.filter(d => d.loggedKcal > 0).length;
  const plannedDays = dayList.filter(d => d.plannedKcal > 0).length;
  return { days: dayList, averageRatio, loggedDays, plannedDays };
}

/** Helper: AdherenceDay[] → TrendPoint[] pro MiniTrendChart. */
export function adherenceToTrendPoints(days: AdherenceDay[]): TrendPoint[] {
  return days.map(d => ({
    date: d.date,
    value: d.ratio != null ? Math.round(d.ratio * 100) : null,  // procenta 85, 100, 110, ...
  }));
}

/** Vrátí lidský popisek pro průměrné ratio. */
export function describeAdherence(averageRatio: number | null): string {
  if (averageRatio == null) return 'Zatím dost dat ne. Pro adherence trend potřebujeme alespoň jeden den s plánem + zápisem.';
  const pct = Math.round(averageRatio * 100);
  if (averageRatio >= 0.95 && averageRatio <= 1.05) {
    return `Skvělé! V průměru jíš ${pct} % cíle — přesně tam, kde má být.`;
  }
  if (averageRatio < 0.85) {
    return `Jíš v průměru ${pct} % cíle — to je výrazně méně. Pokud cíl je hubnutí, pozor na crash deficit; jinak doplň makra.`;
  }
  if (averageRatio < 0.95) {
    return `Jíš ${pct} % cíle. Pokud chceš udržet váhu, doplň ~${Math.round((1 - averageRatio) * 100)} % více.`;
  }
  if (averageRatio <= 1.15) {
    return `Jíš ${pct} % cíle. Lehký surplus — pokud nabíráš, OK. Pokud hubneš, zvaž korekci.`;
  }
  return `Jíš ${pct} % cíle — výrazný surplus. Při hubnutí brzda, při udržování riziko přibrání.`;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function sumKcal(meals: Meal[]): number {
  return meals.reduce((sum, m) => sum + (m.kcal || 0), 0);
}

function sumKcalLog(items: FoodLogItem[]): number {
  return items.reduce((sum, item) => sum + (item.kcal || 0), 0);
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
