// ── SLEEP & RECOVERY DEBT TRACKER
//
// Kumulativní tracker:
//   - Sleep debt = Σ (target − actual) minutes přes N dní; jen pozitivní hodnoty
//                  (přespání se NEzapočítává jako negativní debt — extra spánek
//                   nedoplácí historii, jen pomáhá v aktuálním cyklu)
//   - Recovery debt = počet dní red/yellow readiness za N dní (kumulativní stress)
//
// Klíčové: debt JE NULOVANÝ jakmile uživatel dosáhne 2 zelených dní v řadě.
// Jinak by se neúprosně hromadil a uživatel by ho viděl jako depresivní
// counter. Reset reflektuje, že tělo se zotavilo.

import type { Locale } from '../i18n';
import type { SleepSummary } from '../../types/health';

export type SleepDebtInput = {
  sleeps: SleepSummary[];
  /** Cíl v minutách (default 480 = 8h). */
  targetMinutes?: number;
  /** Délka okna ve dnech (default 14). */
  days?: number;
};

export type SleepDebtSummary = {
  totalDebtMinutes: number;
  /** V hodinách, zaokrouhleno na desetinu. */
  totalDebtHours: number;
  /** Průměrný spánek za N dní (min). null pokud žádná data. */
  averageMinutes: number | null;
  /** Počet dní v okně. */
  totalDays: number;
  /** Počet dní s daty. */
  daysWithData: number;
};

export function computeSleepDebt(input: SleepDebtInput): SleepDebtSummary {
  const target = input.targetMinutes ?? 480;
  const days = input.days ?? 14;
  const totalsWithData = input.sleeps.slice(0, days);

  let debt = 0;
  let totalMinutes = 0;
  let daysWithData = 0;

  for (const s of totalsWithData) {
    if (s.totalMinutes > 0) {
      daysWithData++;
      totalMinutes += s.totalMinutes;
      if (s.totalMinutes < target) {
        debt += target - s.totalMinutes;
      }
    }
  }

  return {
    totalDebtMinutes: debt,
    totalDebtHours: Math.round((debt / 60) * 10) / 10,
    averageMinutes: daysWithData > 0 ? Math.round(totalMinutes / daysWithData) : null,
    totalDays: days,
    daysWithData,
  };
}

export type RecoveryDebtInput = {
  /** Pole levelů ('green' | 'yellow' | 'red') chronologicky nejstarší → nejnovější. */
  readinessLevels: ('green' | 'yellow' | 'red')[];
  /** Délka okna (default 14). */
  days?: number;
};

export type RecoveryDebtSummary = {
  /** Σ recovery debt points. Red = 2pts, Yellow = 1pt, Green = 0pts. */
  totalDebt: number;
  /** Aktuální debt — nulovaný 2× green v řadě v posledních dnech. */
  currentDebt: number;
  redDays: number;
  yellowDays: number;
  greenDays: number;
  totalDays: number;
};

export function computeRecoveryDebt(input: RecoveryDebtInput): RecoveryDebtSummary {
  const levels = input.readinessLevels.slice(0, input.days ?? 14);
  let redDays = 0;
  let yellowDays = 0;
  let greenDays = 0;
  let totalDebt = 0;

  for (const lvl of levels) {
    if (lvl === 'red') { redDays++; totalDebt += 2; }
    else if (lvl === 'yellow') { yellowDays++; totalDebt += 1; }
    else greenDays++;
  }

  // Current debt: scan z nejnovějšího dne dozadu. Reset jakmile narazíme na
  // 2× green v řadě. Jinak akumuluj.
  const newest = levels.slice().reverse();
  let currentDebt = 0;
  let consecutiveGreens = 0;
  for (const lvl of newest) {
    if (lvl === 'green') {
      consecutiveGreens++;
      if (consecutiveGreens >= 2) break; // reset triggered
    } else {
      consecutiveGreens = 0;
      currentDebt += lvl === 'red' ? 2 : 1;
    }
  }

  return {
    totalDebt,
    currentDebt,
    redDays,
    yellowDays,
    greenDays,
    totalDays: levels.length,
  };
}

/** Human-readable sleep debt summary. */
export function describeSleepDebt(summary: SleepDebtSummary, locale: Locale = 'en'): string {
  const en = locale === 'en';
  if (summary.daysWithData < 3) {
    return en
      ? 'Sleep debt needs at least 3 nights of data.'
      : 'Pro spánkový dluh potřebujeme alespoň 3 noci dat.';
  }
  if (summary.totalDebtHours < 1) {
    return en
      ? `Sleep is on track — ${formatHours(summary.averageMinutes!)} on average. Debt ${summary.totalDebtHours}h over ${summary.totalDays} days.`
      : `Spánek v normě — ${formatHours(summary.averageMinutes!)} v průměru. Dluh ${summary.totalDebtHours}h za ${summary.totalDays} dní.`;
  }
  if (summary.totalDebtHours < 5) {
    return en
      ? `Mild sleep debt: ${summary.totalDebtHours}h over ${summary.totalDays} days. Try adding 30 min per night this week.`
      : `Mírný dluh ${summary.totalDebtHours}h za ${summary.totalDays} dní. Snaž se přidat 30 min týdně.`;
  }
  if (summary.totalDebtHours < 10) {
    return en
      ? `Larger sleep debt: ${summary.totalDebtHours}h. Plan a weekend catch-up and longer nights this week.`
      : `Větší dluh ${summary.totalDebtHours}h. Plánuj víkendový catch-up + delší noci tento týden.`;
  }
  return en
    ? `High sleep debt: ${summary.totalDebtHours}h — it can affect performance and mood. Sleep is priority 1 right now.`
    : `Vysoký spánkový dluh ${summary.totalDebtHours}h — projevuje se na výkonu i náladě. Spánek je teď priorita 1.`;
}

/** Human-readable recovery debt summary. */
export function describeRecoveryDebt(summary: RecoveryDebtSummary, locale: Locale = 'en'): string {
  const en = locale === 'en';
  if (summary.totalDays < 3) {
    return en
      ? 'Recovery debt needs at least 3 days of readiness data.'
      : 'Pro recovery debt potřebujeme alespoň 3 dny readiness dat.';
  }
  if (summary.currentDebt === 0) {
    return en
      ? `Your body is in a good place — ${summary.greenDays} green day${summary.greenDays === 1 ? '' : 's'} over ${summary.totalDays} days.`
      : `Tělo je v pohodě — ${summary.greenDays}× green za ${summary.totalDays} dní.`;
  }
  if (summary.currentDebt <= 2) {
    return en
      ? `Mild recovery debt (${summary.currentDebt} pts). Keep training lighter and get to bed early.`
      : `Mírný recovery debt (${summary.currentDebt} bodů). Lehčí trénink + brzo spát.`;
  }
  if (summary.currentDebt <= 5) {
    return en
      ? `Recovery debt is rising (${summary.currentDebt}). Add one rest day this week and watch HRV.`
      : `Recovery debt roste (${summary.currentDebt}). Jeden rest day tento týden + sleduj HRV.`;
  }
  return en
    ? `High recovery debt (${summary.currentDebt}). We recommend 2 full rest days.`
    : `Vysoký recovery debt (${summary.currentDebt}). Doporučujeme 2 dny úplné pauzy.`;
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
