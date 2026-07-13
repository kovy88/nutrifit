// ── ENERGY BALANCE (kcal deficit/surplus tracking)
//
// Spočítá týdenní/měsíční energy balance ze SKUTEČNĚ snědených kalorií
// vs TDEE (nikoli vs plánovaného cíle). To je rozdíl, který skutečně
// hýbe váhou.
//
// Formula:
//   dailyBalance = loggedKcal - estimatedTDEE
//   weeklyBalance = Σ dailyBalance
//   theoreticalKgChange = weeklyBalance / 7700  (1 kg tuku ≈ 7700 kcal)
//
// Caveats:
//   - TDEE proxy ze BMR × activityFactor (nemáme HR-based daily calorimetry)
//   - 7700 kcal/kg je aproximace — záleží na složení (svaly / voda)
//   - Skutečná změna váhy závisí na hydrataci, glycogenu, atd.
// Tahle metrika je INDIKATIVNÍ, ne lékařsky přesná.

import type { FoodLogItem, DailyFoodLogRecord } from '../../types';
import type { Locale } from '../i18n';

export type EnergyBalanceDay = {
  date: string;
  loggedKcal: number;
  estimatedTdee: number;
  /** logged - tdee. Záporné = deficit, kladné = surplus. */
  balance: number;
};

export type EnergyBalanceSummary = {
  days: EnergyBalanceDay[];
  /** Σ balance přes všechny dny s logem (dny bez logu se přeskočí). */
  totalBalance: number;
  /** Průměrný daily balance (přes dny s logem). */
  averageDailyBalance: number | null;
  /** Teoretická změna váhy (kg) za období. Záporné = váhový úbytek. */
  theoreticalKgChange: number;
  /** Kolik dní mělo log. */
  loggedDays: number;
  /** Délka okna. */
  totalDays: number;
};

export type EnergyBalanceInput = {
  /** Mapa loggedKcal per day. */
  logs: DailyFoodLogRecord;
  /** Konstantní TDEE (z profilu). Pro pokročilejší verzi by se mohl
   *  počítat per-den s training-day bonusem, ale pro start stačí baseline. */
  tdee: number;
  /** Délka okna ve dnech (default 14). */
  days?: number;
  /** Referenční datum (default dnes). */
  endDate?: Date;
};

export function computeEnergyBalance(input: EnergyBalanceInput): EnergyBalanceSummary {
  const days = input.days ?? 14;
  const endDate = input.endDate ?? new Date();
  const tdee = input.tdee;

  const dayList: EnergyBalanceDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const date = toDateKey(d);
    const items = input.logs[date] || [];
    const loggedKcal = sumKcal(items);
    dayList.push({
      date,
      loggedKcal,
      estimatedTdee: tdee,
      balance: loggedKcal > 0 ? loggedKcal - tdee : 0,
    });
  }

  const loggedOnlyDays = dayList.filter(d => d.loggedKcal > 0);
  const totalBalance = loggedOnlyDays.reduce((s, d) => s + d.balance, 0);
  const averageDailyBalance = loggedOnlyDays.length > 0
    ? Math.round(totalBalance / loggedOnlyDays.length)
    : null;
  const theoreticalKgChange = Math.round((totalBalance / 7700) * 100) / 100;

  return {
    days: dayList,
    totalBalance,
    averageDailyBalance,
    theoreticalKgChange,
    loggedDays: loggedOnlyDays.length,
    totalDays: days,
  };
}

/** Lidský popis výsledku — kontextový dle goal. */
export function describeEnergyBalance(
  summary: EnergyBalanceSummary,
  goal: 'fat_loss' | 'maintenance' | 'muscle_gain' | 'endurance' | 'general_fitness',
  locale: Locale = 'en',
): string {
  const en = locale === 'en';
  if (summary.loggedDays < 3) {
    return en ? 'Log at least 3 days for a reliable estimate.' : 'Pro spolehlivý odhad zaznamenej alespoň 3 dny.';
  }
  const kg = summary.theoreticalKgChange;
  const balance = summary.averageDailyBalance!;
  const direction = en
    ? (kg < 0 ? 'drop' : kg > 0 ? 'gain' : 'stable')
    : (kg < 0 ? 'pokles' : kg > 0 ? 'nárůst' : 'stabilita');
  const kgAbs = Math.abs(kg).toFixed(2);
  const balanceStr = en ? `${balance >= 0 ? '+' : ''}${balance} kcal/day` : `${balance >= 0 ? '+' : ''}${balance} kcal/den`;

  // Per-goal kontext
  if (goal === 'fat_loss') {
    if (en) {
      if (kg <= -0.4) return `Great deficit — ${balanceStr}, theoretical ${direction} ~${kgAbs} kg over the period. Keep it up.`;
      if (kg <= -0.1) return `Mild deficit (${balanceStr}). A pace of ~${kgAbs} kg/period is safe.`;
      if (kg < 0.1)   return `Energy balance is near zero (${balanceStr}). Add a deficit to lose weight.`;
      return `Watch out — energy surplus (${balanceStr}). With a fat-loss goal this slows progress.`;
    }
    if (kg <= -0.4) return `Skvělý deficit — ${balanceStr}, teoretický ${direction} ~${kgAbs} kg za období. Drž to.`;
    if (kg <= -0.1) return `Mírný deficit (${balanceStr}). Tempo ~${kgAbs} kg/období je bezpečné.`;
    if (kg < 0.1)   return `Energy balance je téměř nulový (${balanceStr}). Pro hubnutí přidej deficit.`;
    return `Pozor — energy surplus (${balanceStr}). Při fat_loss cíli to brzdí pokrok.`;
  }
  if (goal === 'muscle_gain') {
    if (en) {
      if (kg >= 0.2)  return `Solid surplus (${balanceStr}), theoretical ${direction} ~${kgAbs} kg. Fine for muscle — just don't overdo it.`;
      if (kg >= 0.05) return `Mild surplus (${balanceStr}). Muscle grows slowly but cleanly.`;
      return `Muscle gain needs a surplus — currently ${balanceStr}. Add ~200–300 kcal.`;
    }
    if (kg >= 0.2)  return `Solidní surplus (${balanceStr}), teoretický ${direction} ~${kgAbs} kg. Pro svaly OK, hlídej, ať to není moc.`;
    if (kg >= 0.05) return `Mírný surplus (${balanceStr}). Sval poroste pomalu, ale čistě.`;
    return `Pro muscle_gain potřebuješ surplus — aktuálně ${balanceStr}. Přidej ~200–300 kcal.`;
  }
  if (goal === 'endurance') {
    if (en) {
      if (Math.abs(kg) < 0.1) return `Stable (${balanceStr}). Ideal for endurance performance.`;
      if (kg < -0.3) return `Large deficit (${balanceStr}) — risk of performance drop. Refill glycogen.`;
      return `Currently ${balanceStr}. For endurance the goal is stable weight.`;
    }
    if (Math.abs(kg) < 0.1) return `Stabilní (${balanceStr}). Ideální pro vytrvalostní výkon.`;
    if (kg < -0.3) return `Velký deficit (${balanceStr}) — riziko poklesu výkonu. Doplň glykogen.`;
    return `Aktuálně ${balanceStr}. Pro vytrvalost cíl je stabilní váha.`;
  }
  // maintenance / general_fitness
  if (en) {
    if (Math.abs(kg) < 0.1) return `Energy balance is in equilibrium (${balanceStr}). Stable weight.`;
    return `Currently ${balanceStr}, theoretical ${direction} ~${kgAbs} kg over the period.`;
  }
  if (Math.abs(kg) < 0.1) return `Energy balance v rovnováze (${balanceStr}). Stabilní váha.`;
  return `Aktuálně ${balanceStr}, teoretický ${direction} ~${kgAbs} kg za období.`;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function sumKcal(items: FoodLogItem[]): number {
  return items.reduce((sum, i) => sum + (i.kcal || 0), 0);
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
