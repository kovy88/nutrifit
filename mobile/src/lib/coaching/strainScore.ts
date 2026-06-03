// ── DAILY STRAIN SCORE
//
// Whoop-style 0–21 score, který shrnuje dnešní cumulative training stress.
// Whoop ho počítá z HR zones × time. My nemáme HR zone breakdown napříč
// všemi providery, takže používáme zjednodušenou variantu: součet TRIMP
// hodnot ze všech workoutů za den, namapovaný na 0–21 logaritmickou škálou
// (běžný uživatel dosáhne 8–14, hard trénink 15–18, racing 19+).
//
// Důvod log škály: rozdíl mezi 100 a 200 TRIMP je velký (běžný den ↔ hard),
// rozdíl mezi 400 a 500 TRIMP je marginální (oba jsou exhausting). Lineární
// mapping by sportovce-amatéry navalil na max příliš rychle.

import type { TrainingSession } from '../../types';
import type { WorkoutSummary } from '../../types/health';
import type { Locale } from '../i18n';

export type StrainBand = 'recovery' | 'light' | 'moderate' | 'high' | 'all_out';

export type StrainAssessment = {
  /** 0..21, zaokrouhleno na 0.1. */
  score: number;
  band: StrainBand;
  /** Lidský popis stavu v češtině. */
  label: string;
  /** Celkový TRIMP, ze kterého se score odvodil. */
  trimp: number;
  /** Kolik workoutů do skóre přispělo. */
  workoutCount: number;
  /** Doporučení pro zbytek dne / zítřek. */
  recommendation: string;
};

export type StrainInput = {
  /** Plánovaný session — započítá se TRIMPem, pokud uživatel ještě nezalogoval workout. */
  plannedSession?: TrainingSession | null;
  /** Skutečně absolvované workouty (z provideru) — pro daný den. */
  todaysWorkouts: WorkoutSummary[];
  /** Jazyk label + recommendation. Default 'cs'. */
  locale?: Locale;
};

const INTENSITY_FACTOR: Record<TrainingSession['intensity'], number> = {
  rest: 0,
  easy: 1.0,
  moderate: 1.5,
  hard: 2.0,
};

/**
 * Mapuje TRIMP na 0..21 logaritmicky.
 *   TRIMP = 0    → 0
 *   TRIMP = 30   → ~4.6  (easy 30 min)
 *   TRIMP = 120  → ~13.2 (hard 60 min)
 *   TRIMP = 200  → ~17   (very hard / long)
 *   TRIMP = 360+ → ~20+  (multi-hour endurance event)
 * Curve calibrated so a typical "good training day" lands in 9–13 range.
 */
function trimpToScore(trimp: number): number {
  if (trimp <= 0) return 0;
  // y = 21 * (1 - exp(-trimp / 120))
  const raw = 21 * (1 - Math.exp(-trimp / 120));
  return Math.min(21, Math.max(0, Math.round(raw * 10) / 10));
}

function bandFromScore(score: number): StrainBand {
  if (score < 3) return 'recovery';
  if (score < 7) return 'light';
  if (score < 14) return 'moderate';
  if (score < 18) return 'high';
  return 'all_out';
}

function labelForBand(band: StrainBand, loc: Locale): string {
  const cs: Record<StrainBand, string> = {
    recovery: 'Regenerační den', light: 'Lehká aktivita', moderate: 'Středně náročné',
    high: 'Vysoká zátěž', all_out: 'Extrémní zátěž',
  };
  const en: Record<StrainBand, string> = {
    recovery: 'Recovery day', light: 'Light activity', moderate: 'Moderate',
    high: 'High strain', all_out: 'All-out',
  };
  return (loc === 'en' ? en : cs)[band];
}

function recommendationForBand(band: StrainBand, loc: Locale): string {
  const cs: Record<StrainBand, string> = {
    recovery: 'Dnes málo. Pokud nemáš deload, zařaď zítra lehkou aktivitu.',
    light: 'Zdravá udržovací zátěž. Pokud trénuješ cíl, můžeš si dovolit jednu kvalitnější jednotku tento týden.',
    moderate: 'Tělo se po dnešku potřebuje regenerovat. Spánek 7–9 h, hydratace, 30 g bílkovin do 30 min po tréninku.',
    high: 'Velká zátěž. Zítra easy + extra spánek + carb refuel. Sleduj klidový tep + HRV.',
    all_out: 'Extrém. Zítra rest day NEBO max 30 min recovery walk. Vyšší energetický příjem, vyšší příjem solí.',
  };
  const en: Record<StrainBand, string> = {
    recovery: 'Light day. Unless this is a deload, add some easy activity tomorrow.',
    light: 'Healthy maintenance load. If you train for a goal, you can afford one quality session this week.',
    moderate: 'Your body needs to recover after today. 7–9 h sleep, hydration, 30 g protein within 30 min post-workout.',
    high: 'Big load. Tomorrow go easy + extra sleep + carb refuel. Watch resting HR + HRV.',
    all_out: 'Extreme. Tomorrow take a rest day OR max 30 min recovery walk. Higher energy + salt intake.',
  };
  return (loc === 'en' ? en : cs)[band];
}

function trimpFromWorkout(w: WorkoutSummary): number {
  // Reuse same heuristic jako trainingLoad.ts: HR-based když dostupné, jinak proxy.
  let factor = 1.2;
  if (w.avgHeartRate && w.maxHeartRate) {
    const ratio = w.avgHeartRate / w.maxHeartRate;
    if (ratio < 0.7) factor = 1.0;
    else if (ratio < 0.85) factor = 1.5;
    else factor = 2.0;
  } else if (w.avgHeartRate) {
    const ratio = w.avgHeartRate / 180;
    if (ratio < 0.7) factor = 1.0;
    else if (ratio < 0.85) factor = 1.5;
    else factor = 2.0;
  }
  return w.durationMinutes * factor;
}

function trimpFromPlannedSession(s: TrainingSession): number {
  if (s.kind === 'rest' || s.intensity === 'rest') return 0;
  return s.durationMinutes * (INTENSITY_FACTOR[s.intensity] ?? 1.2);
}

export function computeDailyStrain(input: StrainInput): StrainAssessment {
  const workoutTrimp = input.todaysWorkouts.reduce((sum, w) => sum + trimpFromWorkout(w), 0);
  // Pokud uživatel ještě nemá zalogovaný workout, použij plán (forecasted strain).
  const plannedTrimp = workoutTrimp === 0 && input.plannedSession
    ? trimpFromPlannedSession(input.plannedSession)
    : 0;
  const totalTrimp = workoutTrimp + plannedTrimp;

  const score = trimpToScore(totalTrimp);
  const band = bandFromScore(score);
  const loc: Locale = input.locale ?? 'cs';

  return {
    score,
    band,
    label: labelForBand(band, loc),
    trimp: Math.round(totalTrimp),
    workoutCount: input.todaysWorkouts.length,
    recommendation: recommendationForBand(band, loc),
  };
}
