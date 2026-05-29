// ── WORKOUT FUELING ADVISOR
//
// Pure function pro výpočet doporučeného pre/intra/post-workout fuelu
// z workout summary. Implementace následuje sport-nutrition guidelines
// (Burke & Cox 2010, Thomas et al. 2016 IOC Consensus):
//
//   Pre (1–4h):    1–4 g carbs/kg + 20 g protein
//   During:        30–60 g carbs/h pro endurance > 60 min
//   Post (0–30m):  1.2 g carbs/kg + 20–40 g protein
//
// Volume scaling per workout kind:
//   easy run / walk   → minimal — water + light snack stačí
//   moderate cardio   → pre + post
//   hard intervals    → pre + post + možná intra pokud > 60 min
//   long_run / brick  → pre + intra + post (intra 30–60g carbs/h)
//   strength          → primárně post (protein focus)

import type { WorkoutKind, WorkoutSummary } from '../../types/health';
import type { Locale } from '../i18n';

export type FuelingRecommendation = {
  /** Krátký popis fuel strategy. */
  summary: string;
  pre: { carbsG: number; proteinG: number; timingMinBefore: number; note: string } | null;
  intra: { carbsGPerHour: number; note: string } | null;
  post: { carbsG: number; proteinG: number; timingMinAfter: number; note: string } | null;
};

export type FuelingInput = {
  workout: Pick<WorkoutSummary, 'kind' | 'durationMinutes' | 'avgHeartRate' | 'maxHeartRate'>;
  /** Tělesná hmotnost pro per-kg dávkování. */
  weightKg: number;
  /** Jazyk výstupních textů. Default 'cs'. */
  locale?: Locale;
};

/** Pick localized string. */
function L(locale: Locale, cs: string, en: string): string {
  return locale === 'en' ? en : cs;
}

export function computeFueling(input: FuelingInput): FuelingRecommendation {
  const { workout, weightKg } = input;
  const loc: Locale = input.locale ?? 'cs';
  const kind = workout.kind;
  const minutes = workout.durationMinutes;
  const intensity = inferIntensity(workout);

  // Easy / light krátké aktivity — žádné explicitní fueling
  if ((kind === 'walk' || kind === 'yoga') && minutes < 60) {
    return {
      summary: L(loc, 'Krátká nízká intenzita — voda stačí.', 'Short low intensity — water is enough.'),
      pre: null, intra: null, post: null,
    };
  }

  // Long endurance: pre + intra + post
  if (minutes >= 90 && (kind === 'run' || kind === 'cycle' || kind === 'swim' || kind === 'rowing')) {
    return {
      summary: L(loc, 'Dlouhý vytrvalostní výkon — fueling klíčový.', 'Long endurance effort — fueling is key.'),
      pre: {
        carbsG: Math.round(weightKg * 2),       // ~2 g/kg
        proteinG: 20,
        timingMinBefore: 90,
        note: L(loc, 'Lehce stravitelné sacharidy (ovesné kaše, banán, toast).', 'Easily digestible carbs (oatmeal, banana, toast).'),
      },
      intra: {
        carbsGPerHour: 45,
        note: L(loc, 'Gel/iontový nápoj každých 30 min.', 'Gel/sports drink every 30 min.'),
      },
      post: {
        carbsG: Math.round(weightKg * 1.0),
        proteinG: 30,
        timingMinAfter: 30,
        note: L(loc, 'Refuel + protein do 30 min — glykogen + svalová obnova.', 'Refuel + protein within 30 min — glycogen + muscle recovery.'),
      },
    };
  }

  // Hard cardio / intervals: pre + post
  if (intensity === 'hard' && (kind === 'run' || kind === 'cycle' || kind === 'hiit' || kind === 'functional')) {
    return {
      summary: L(loc, 'Vysoká intenzita — pre + post fueling pro výkon a regeneraci.', 'High intensity — pre + post fueling for performance and recovery.'),
      pre: {
        carbsG: Math.round(weightKg * 1),
        proteinG: 15,
        timingMinBefore: 60,
        note: L(loc, 'Sacharidy + bílkoviny ~1h předem.', 'Carbs + protein ~1h before.'),
      },
      intra: null,
      post: {
        carbsG: Math.round(weightKg * 0.8),
        proteinG: 25,
        timingMinAfter: 30,
        note: L(loc, 'Refuel glykogenu + protein pro regeneraci.', 'Glycogen refuel + protein for recovery.'),
      },
    };
  }

  // Strength / functional: primárně post (protein)
  if (kind === 'strength' || kind === 'functional') {
    return {
      summary: L(loc, 'Silový trénink — protein focus pro hypertrofii.', 'Strength training — protein focus for hypertrophy.'),
      pre: {
        carbsG: 30,
        proteinG: 15,
        timingMinBefore: 60,
        note: L(loc, 'Lehčí svačina pro energii bez tíže v žaludku.', 'A lighter snack for energy without stomach heaviness.'),
      },
      intra: null,
      post: {
        carbsG: Math.round(weightKg * 0.5),
        proteinG: 35,
        timingMinAfter: 30,
        note: L(loc, '20–40 g protein během "anabolic window" pro hypertrofii.', '20–40 g protein during the "anabolic window" for hypertrophy.'),
      },
    };
  }

  // Moderate / default
  return {
    summary: L(loc, 'Středně náročný trénink — lehký pre + post.', 'Moderate workout — light pre + post.'),
    pre: {
      carbsG: 30,
      proteinG: 15,
      timingMinBefore: 45,
      note: L(loc, 'Banán + jogurt nebo lehká svačina.', 'Banana + yogurt or a light snack.'),
    },
    intra: null,
    post: {
      carbsG: Math.round(weightKg * 0.5),
      proteinG: 20,
      timingMinAfter: 60,
      note: L(loc, 'Vyvážená svačina nebo jídlo do hodiny.', 'A balanced snack or meal within the hour.'),
    },
  };
}

function inferIntensity(w: { avgHeartRate?: number; maxHeartRate?: number }): 'easy' | 'moderate' | 'hard' {
  if (!w.avgHeartRate) return 'moderate';
  const ratio = w.maxHeartRate ? w.avgHeartRate / w.maxHeartRate : w.avgHeartRate / 180;
  if (ratio < 0.7) return 'easy';
  if (ratio < 0.85) return 'moderate';
  return 'hard';
}
