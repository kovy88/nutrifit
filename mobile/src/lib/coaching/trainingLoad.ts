// ── TRAINING LOAD (ACWR)
//
// Acute:Chronic Workload Ratio — sportovně-vědecký koncept, kterým hodnotíme
// jestli uživatel rychle nezvyšuje objem (risk zranění) nebo naopak nepoddtrenoval
// (ztráta formy). Používá Whoop, Garmin Training Status, Athletica.io.
//
// Definice:
//   acute   = průměrná denní zátěž za 7 dní
//   chronic = průměrná denní zátěž za 28 dní
//   ACWR    = acute / chronic
//
// Rozsahy (Gabbett 2016 et al.):
//   ACWR < 0.8       — detraining (forma klesá)
//   ACWR 0.8 – 1.3   — sweet spot (optimum)
//   ACWR 1.3 – 1.5   — zvýšené riziko zranění
//   ACWR > 1.5       — vysoké riziko
//
// Zátěž = "training impulse" (TRIMP). Pro běh běžně proxy přes
// km × MET. Pro mix sportů použijeme: durationMinutes × intensityFactor.
//   easy:1.0  moderate:1.5  hard:2.0  rest:0
// (Banister-style TRIMP zjednodušený, bez HR zone breakdown — to vyžaduje
// max HR data, která nemáme garantovaná.)

import type { WorkoutSummary } from '../../types/health';
import type { Locale } from '../i18n';

export type LoadStatus = 'detraining' | 'optimal' | 'overreaching' | 'high_risk';

export type TrainingLoadAssessment = {
  acute: number;
  chronic: number;
  /** acute / chronic; null pokud chronic < 1 (mladý dataset). */
  acwr: number | null;
  status: LoadStatus;
  /** Lidský popis stavu v češtině. */
  message: string;
  /** Doporučení pro plánování nadcházejícího týdne. */
  recommendation: string;
  /** Pomocná data pro UI. */
  workoutCountAcute: number;
  workoutCountChronic: number;
};

export type TrainingLoadInput = {
  workouts: WorkoutSummary[];
  /** Referenční datum (default dnes). */
  endDate?: Date;
  /** Jazyk message + recommendation. Default 'cs'. */
  locale?: Locale;
};

const INTENSITY_FACTOR: Record<'easy' | 'moderate' | 'hard' | 'rest' | 'unknown', number> = {
  easy: 1.0,
  moderate: 1.5,
  hard: 2.0,
  rest: 0,
  unknown: 1.2,
};

const ACUTE_DAYS = 7;
const CHRONIC_DAYS = 28;

/**
 * Spočítá TRIMP-style zátěž z workout listu a vrátí ACWR + status.
 * Workouts mimo časové okno [endDate - 28 dní, endDate] se ignorují.
 *
 * Pokud chronic average je menší než 1 (málo dat), vrátíme acwr=null
 * a status 'optimal' — nebudeme uživateli říkat "high risk" jen proto,
 * že má 3 dny záznamů.
 */
export function computeTrainingLoad(input: TrainingLoadInput): TrainingLoadAssessment {
  const endDate = input.endDate ?? new Date();
  const endMs = endDate.getTime();
  const acuteStartMs = endMs - ACUTE_DAYS * 86_400_000;
  const chronicStartMs = endMs - CHRONIC_DAYS * 86_400_000;

  let acuteLoad = 0;
  let chronicLoad = 0;
  let acuteCount = 0;
  let chronicCount = 0;

  for (const w of input.workouts) {
    const t = new Date(w.startedAt).getTime();
    if (t < chronicStartMs || t > endMs) continue;
    const load = trimp(w);
    if (load === 0) continue;
    chronicLoad += load;
    chronicCount++;
    if (t >= acuteStartMs) {
      acuteLoad += load;
      acuteCount++;
    }
  }

  const acuteAvgPerDay = acuteLoad / ACUTE_DAYS;
  const chronicAvgPerDay = chronicLoad / CHRONIC_DAYS;
  // Need at least 4 workouts in the 28-day window AND meaningful daily load
  // before we trust the ratio. With less than that we'd produce nonsense
  // ("ACWR 4.0 high risk!" for a user who's just done 2 workouts).
  const hasMeaningfulBaseline = chronicCount >= 4 && chronicAvgPerDay >= 1;
  const acwr = hasMeaningfulBaseline ? acuteAvgPerDay / chronicAvgPerDay : null;

  const { status, message, recommendation } = classify(acwr, acuteCount, input.locale ?? 'en');

  return {
    acute: Math.round(acuteAvgPerDay * 10) / 10,
    chronic: Math.round(chronicAvgPerDay * 10) / 10,
    acwr: acwr != null ? Math.round(acwr * 100) / 100 : null,
    status,
    message,
    recommendation,
    workoutCountAcute: acuteCount,
    workoutCountChronic: chronicCount,
  };
}

function trimp(workout: WorkoutSummary): number {
  const factor = INTENSITY_FACTOR[(workout as any).intensity as keyof typeof INTENSITY_FACTOR] ?? INTENSITY_FACTOR.unknown;
  // WorkoutSummary (z provider) nenese intensitu — odhadneme z avgHR vs maxHR
  // nebo z duration (delší = obecně lehčí). Pro start: použij durationMinutes × 1.2
  // (unknown factor) a override pokud HR data ukáží jinak.
  let intensityFactor = factor;
  if (workout.avgHeartRate && workout.maxHeartRate) {
    const hrRatio = workout.avgHeartRate / workout.maxHeartRate;
    if (hrRatio < 0.7) intensityFactor = INTENSITY_FACTOR.easy;
    else if (hrRatio < 0.85) intensityFactor = INTENSITY_FACTOR.moderate;
    else intensityFactor = INTENSITY_FACTOR.hard;
  } else if (workout.avgHeartRate) {
    // Bez maxHR použijeme age-based proxy (assume 180 = HRmax pro dospělé 40 let)
    const ratio = workout.avgHeartRate / 180;
    if (ratio < 0.7) intensityFactor = INTENSITY_FACTOR.easy;
    else if (ratio < 0.85) intensityFactor = INTENSITY_FACTOR.moderate;
    else intensityFactor = INTENSITY_FACTOR.hard;
  }
  return workout.durationMinutes * intensityFactor;
}

function classify(acwr: number | null, acuteCount: number, loc: Locale): { status: LoadStatus; message: string; recommendation: string } {
  const en = loc === 'en';
  if (acuteCount === 0) {
    return {
      status: 'detraining',
      message: en ? 'No training this week.' : 'Tento týden žádný trénink.',
      recommendation: en ? 'To keep your fitness, plan 2–3 easy sessions this week.' : 'Pokud chceš udržet formu, naplánuj 2–3 lehké jednotky tento týden.',
    };
  }
  if (acwr == null) {
    return {
      status: 'optimal',
      message: en ? "Learning your usual rhythm. Keep your current pace." : 'Učíme se tvůj běžný rytmus. Pokračuj v aktuálním tempu.',
      recommendation: en ? 'In a few weeks we can give more precise guidance.' : 'Za pár týdnů budeme schopni ti dát přesnější doporučení.',
    };
  }
  if (acwr < 0.8) {
    return {
      status: 'detraining',
      message: en ? 'This week is clearly lighter than your usual rhythm.' : 'Tento týden je výrazně lehčí než tvůj běžný rytmus.',
      recommendation: en ? 'Fitness is slowly declining. Add 1–2 easy sessions to maintain.' : 'Forma postupně klesá. Přidej 1–2 lehké jednotky pro udržení.',
    };
  }
  if (acwr <= 1.3) {
    return {
      status: 'optimal',
      message: en ? 'Training load is in a steady range.' : 'Tréninková zátěž je ve stabilním rozsahu.',
      recommendation: en ? 'Keep this rhythm — fitness builds safely.' : 'Pokračuj v tomto rytmu, forma roste bezpečně.',
    };
  }
  if (acwr <= 1.5) {
    return {
      status: 'overreaching',
      message: en ? 'This week is well above your usual rhythm.' : 'Tento týden je výrazně nad tvým běžným rytmem.',
      recommendation: en ? 'Add a deload — cut weekly volume ~20% next week and watch your sleep.' : 'Zařaď deload — sniž týdenní objem o ~20 % příští týden a hlídej spánek.',
    };
  }
  return {
    status: 'high_risk',
    message: en ? 'Training load jumped very fast this week.' : 'Tréninková zátěž tento týden vyskočila velmi rychle.',
    recommendation: en ? 'We recommend easing off this week. Cut volume ~30% and no new sports.' : 'Doporučujeme tento týden uvolnit. Sniž objem o ~30 % a žádné nové sporty.',
  };
}
