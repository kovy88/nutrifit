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
import type { Locale } from '../i18n';

export type AdherenceDay = {
  date: string;
  plannedKcal: number;
  loggedKcal: number;
  plannedProtein: number;
  loggedProtein: number;
  plannedCarbs: number;
  loggedCarbs: number;
  plannedFat: number;
  loggedFat: number;
  /** ratio logged/planned for kcal, null pokud plán = 0. */
  ratio: number | null;
  /** Per-macro ratios — null pokud daná plánovaná hodnota = 0. */
  proteinRatio: number | null;
  carbsRatio: number | null;
  fatRatio: number | null;
};

export type MacroAverages = {
  /** Průměr poměrů (logged/planned) za dny s plánem. null = žádná data. */
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type AdherenceSummary = {
  /** Posledních N dní podrobně. */
  days: AdherenceDay[];
  /** Průměr ratio přes dny, které mají plán i log. null pokud žádný. */
  averageRatio: number | null;
  /** Per-macro průměry. */
  averages: MacroAverages;
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
    const plannedKcal = sumMeals(planMeals, 'kcal');
    const loggedKcal = sumLog(logItems, 'kcal');
    const plannedProtein = sumMeals(planMeals, 'protein');
    const loggedProtein = sumLog(logItems, 'protein');
    const plannedCarbs = sumMeals(planMeals, 'carbs');
    const loggedCarbs = sumLog(logItems, 'carbs');
    const plannedFat = sumMeals(planMeals, 'fat');
    const loggedFat = sumLog(logItems, 'fat');
    dayList.push({
      date,
      plannedKcal, loggedKcal,
      plannedProtein, loggedProtein,
      plannedCarbs, loggedCarbs,
      plannedFat, loggedFat,
      ratio: plannedKcal > 0 ? loggedKcal / plannedKcal : null,
      proteinRatio: plannedProtein > 0 ? loggedProtein / plannedProtein : null,
      carbsRatio: plannedCarbs > 0 ? loggedCarbs / plannedCarbs : null,
      fatRatio: plannedFat > 0 ? loggedFat / plannedFat : null,
    });
  }
  const averages: MacroAverages = {
    kcal: avg(dayList.map(d => d.ratio)),
    protein: avg(dayList.map(d => d.proteinRatio)),
    carbs: avg(dayList.map(d => d.carbsRatio)),
    fat: avg(dayList.map(d => d.fatRatio)),
  };
  const loggedDays = dayList.filter(d => d.loggedKcal > 0).length;
  const plannedDays = dayList.filter(d => d.plannedKcal > 0).length;
  return { days: dayList, averageRatio: averages.kcal, averages, loggedDays, plannedDays };
}

function avg(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v != null);
  if (xs.length === 0) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;
}

/** Helper: AdherenceDay[] → TrendPoint[] pro daný makro (kcal default). */
export function adherenceToTrendPoints(
  days: AdherenceDay[],
  macro: 'kcal' | 'protein' | 'carbs' | 'fat' = 'kcal',
): TrendPoint[] {
  return days.map(d => {
    const r = macro === 'kcal' ? d.ratio
      : macro === 'protein' ? d.proteinRatio
      : macro === 'carbs' ? d.carbsRatio
      : d.fatRatio;
    return {
      date: d.date,
      value: r != null ? Math.round(r * 100) : null,
    };
  });
}

/** Krátký label statusu pro per-macro průměr — používá UI pro chip color. */
export function macroAdherenceBand(ratio: number | null): 'unknown' | 'low' | 'on_target' | 'high' {
  if (ratio == null) return 'unknown';
  if (ratio < 0.85) return 'low';
  if (ratio > 1.15) return 'high';
  return 'on_target';
}

/** Vrátí lidský popisek pro průměrné ratio. */
export function describeAdherence(averageRatio: number | null, locale: Locale = 'cs'): string {
  const en = locale === 'en';
  if (averageRatio == null) {
    return en
      ? 'Not enough data yet. The adherence trend needs at least one day with a plan + log.'
      : 'Zatím dost dat ne. Pro adherence trend potřebujeme alespoň jeden den s plánem + zápisem.';
  }
  const pct = Math.round(averageRatio * 100);
  if (averageRatio >= 0.95 && averageRatio <= 1.05) {
    return en
      ? `Great! On average you eat ${pct}% of your target — right where it should be.`
      : `Skvělé! V průměru jíš ${pct} % cíle — přesně tam, kde má být.`;
  }
  if (averageRatio < 0.85) {
    return en
      ? `You eat ${pct}% of your target on average — that's significantly less. If your goal is weight loss, watch for a crash deficit; otherwise top up your macros.`
      : `Jíš v průměru ${pct} % cíle — to je výrazně méně. Pokud cíl je hubnutí, pozor na crash deficit; jinak doplň makra.`;
  }
  if (averageRatio < 0.95) {
    return en
      ? `You eat ${pct}% of your target. To maintain weight, add ~${Math.round((1 - averageRatio) * 100)}% more.`
      : `Jíš ${pct} % cíle. Pokud chceš udržet váhu, doplň ~${Math.round((1 - averageRatio) * 100)} % více.`;
  }
  if (averageRatio <= 1.15) {
    return en
      ? `You eat ${pct}% of your target. A slight surplus — fine if you're bulking. If you're cutting, consider a correction.`
      : `Jíš ${pct} % cíle. Lehký surplus — pokud nabíráš, OK. Pokud hubneš, zvaž korekci.`;
  }
  return en
    ? `You eat ${pct}% of your target — a significant surplus. A brake when cutting, risk of gaining when maintaining.`
    : `Jíš ${pct} % cíle — výrazný surplus. Při hubnutí brzda, při udržování riziko přibrání.`;
}

// ── helpers ──────────────────────────────────────────────────────────────────

type MacroKey = 'kcal' | 'protein' | 'carbs' | 'fat';

function sumMeals(meals: Meal[], key: MacroKey): number {
  return meals.reduce((sum, m) => sum + (m[key] || 0), 0);
}

function sumLog(items: FoodLogItem[], key: MacroKey): number {
  return items.reduce((sum, item) => sum + (item[key] || 0), 0);
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
