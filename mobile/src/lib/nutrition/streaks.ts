// ── STREAK TRACKING
//
// Spočítá série úspěšných dní (streaky). Dva typy:
//   1. Log streak       — kolik dní v řadě uživatel zaznamenal jakékoli jídlo
//   2. Adherence streak — kolik dní v řadě dosáhl 85–115 % kcal cíle
//
// Streaky se počítají zpětně od `endDate` (default dnes). První přerušení
// → streak končí. Pokud dnes ještě nebylo nic zalogováno, používáme streak
// "ke včerejšku" (aby tlačítko ráno neukazovalo 0).

import type { AdherenceDay } from './adherenceTrend';

export type StreakInfo = {
  /** Aktuální streak ke dnešnímu / včerejšímu dni. */
  current: number;
  /** Nejdelší streak v zobrazeném okně. */
  longest: number;
  /** Datum kdy streak začal (pokud current > 0). */
  startDate: string | null;
};

/**
 * Day-by-day od nejnovějšího po nejstarší. Vrátí délku trvajícího
 * "true" suffix-streaku a nejdelší podsekvenci.
 */
function computeStreak(daysNewestFirst: { date: string; ok: boolean }[]): StreakInfo {
  let current = 0;
  let longest = 0;
  let temp = 0;
  let startDate: string | null = null;
  let foundCurrent = false;

  for (let i = 0; i < daysNewestFirst.length; i++) {
    const day = daysNewestFirst[i];
    if (day.ok) {
      temp++;
      longest = Math.max(longest, temp);
      if (!foundCurrent) {
        current = temp;
        startDate = day.date;
      }
    } else {
      // Pokud jsme zatím nenarazili na FALSE den, current se ustálil
      foundCurrent = true;
      temp = 0;
    }
  }

  // Pokud byly všechny dny ok, current = temp
  if (!foundCurrent) current = temp;

  return { current, longest, startDate };
}

/**
 * Log streak — kolik dní v řadě uživatel zalogoval alespoň jedno jídlo.
 * Pokud dnešek je prázdný, počítáme od včerejška (uživatel se ráno otevře
 * appku a nemá ještě nic zalogováno — neukázat 0).
 */
export function computeLogStreak(days: AdherenceDay[], todayDate: string = todayKey()): StreakInfo {
  // Sort newest first
  const sorted = days.slice().sort((a, b) => b.date.localeCompare(a.date));
  // Pokud dnešek nemá log, začni od včerejška
  const todayHasLog = sorted[0]?.date === todayDate && sorted[0]?.loggedKcal > 0;
  const startIdx = (sorted[0]?.date === todayDate && !todayHasLog) ? 1 : 0;
  const mapped = sorted.slice(startIdx).map(d => ({ date: d.date, ok: d.loggedKcal > 0 }));
  return computeStreak(mapped);
}

/**
 * Adherence streak — kolik dní v řadě uživatel zasáhl 85–115 % kcal cíle.
 * Stejně jako log streak: pokud dnešek je prázdný, počítej od včerejška.
 */
export function computeAdherenceStreak(
  days: AdherenceDay[],
  todayDate: string = todayKey(),
  band: { low: number; high: number } = { low: 0.85, high: 1.15 },
): StreakInfo {
  const sorted = days.slice().sort((a, b) => b.date.localeCompare(a.date));
  const todayPartial = sorted[0]?.date === todayDate && (sorted[0]?.ratio == null || sorted[0]?.loggedKcal === 0);
  const startIdx = todayPartial ? 1 : 0;
  const mapped = sorted.slice(startIdx).map(d => ({
    date: d.date,
    ok: d.ratio != null && d.ratio >= band.low && d.ratio <= band.high,
  }));
  return computeStreak(mapped);
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lidský label pro streak — 🔥 zazní jen pokud current >= 3. */
export function describeStreak(streak: StreakInfo, kind: 'log' | 'adherence'): string {
  if (streak.current === 0) {
    return kind === 'log'
      ? 'Začni zapisovat dnes a postav si streak.'
      : 'Cíl 85–115 % cíle dnes — start nové série.';
  }
  if (streak.current < 3) {
    return kind === 'log'
      ? `${streak.current} ${pluralDay(streak.current)} v řadě zapsáno. Pokračuj!`
      : `${streak.current} ${pluralDay(streak.current)} v cíli. Tlač dál.`;
  }
  return kind === 'log'
    ? `🔥 ${streak.current} ${pluralDay(streak.current)} v řadě. ${streak.current >= streak.longest ? 'Tvůj nejdelší!' : `Nejdelší: ${streak.longest}.`}`
    : `🔥 ${streak.current} ${pluralDay(streak.current)} v cíli. ${streak.current >= streak.longest ? 'Tvůj nejdelší!' : `Rekord: ${streak.longest}.`}`;
}

function pluralDay(n: number): string {
  if (n === 1) return 'den';
  if (n >= 2 && n <= 4) return 'dny';
  return 'dní';
}
