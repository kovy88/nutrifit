// ── READINESS ASSESSMENT
//
// Vyhodnotí, jestli je dnes uživatel připravený na plánovaný trénink,
// na základě spánku + HRV + klidového tepu. Inspirace: Whoop "Recovery",
// Garmin "Body Battery", Oura "Readiness".
//
// Pravidla (absolutní prahy fallback; relativní když je baseline):
//   Spánek < 6 h → red · 6–7 h → yellow · 7+ → green
//   HRV SDNN < 25 ms → red · 25–35 → yellow · 35+ → green
//   RHR > 85 → red · > 75 → yellow · ≤ 75 → green
// Agregace: any red → red · 2+ yellow → red · 1 yellow → yellow · else green.
//
// Lokalizace: messages + recommendation respektují `input.locale` (default 'cs').
// Logika (severity, level, trainingAdjustment) je jazykově nezávislá, takže
// stávající testy bez locale zůstávají zelené.

import type { Locale } from '../i18n';

export type ReadinessLevel = 'green' | 'yellow' | 'red';

export type ReadinessFactorKey =
  | 'sleep_short'
  | 'sleep_moderate'
  | 'sleep_ok'
  | 'sleep_missing'
  | 'hrv_low'
  | 'hrv_moderate'
  | 'hrv_ok'
  | 'hrv_missing'
  | 'rhr_high'
  | 'rhr_elevated'
  | 'rhr_ok'
  | 'rhr_missing';

export type ReadinessFactor = {
  key: ReadinessFactorKey;
  severity: ReadinessLevel;
  message: string;
};

export type ReadinessAssessment = {
  level: ReadinessLevel;
  factors: ReadinessFactor[];
  recommendation: string;
  trainingAdjustment: 'reduce_to_easy' | 'reduce_to_moderate' | null;
};

export type ReadinessInput = {
  todaySleepMinutes?: number | null;
  todayRhrBpm?: number | null;
  todayHrvMs?: number | null;
  baseline?: {
    rhrMeanBpm?: number | null;
    hrvMeanMs?: number | null;
    sleepMeanMinutes?: number | null;
  };
  /** Jazyk výstupních textů. Default 'cs'. */
  locale?: Locale;
};

// ── Thresholds ──────────────────────────────────────────────────────────────
const SLEEP_MIN_OK = 420;
const SLEEP_MIN_BORDERLINE = 360;
const HRV_MIN_OK = 35;
const HRV_MIN_BORDERLINE = 25;
const RHR_MAX_OK = 75;
const RHR_MAX_BORDERLINE = 85;
const HRV_RATIO_OK = 0.85;
const HRV_RATIO_RED = 0.70;
const RHR_RATIO_OK = 1.10;
const RHR_RATIO_RED = 1.20;
const SLEEP_RATIO_OK = 0.90;
const SLEEP_RATIO_RED = 0.70;

/** Pick localized string. */
function L(locale: Locale, cs: string, en: string): string {
  return locale === 'en' ? en : cs;
}

export function evaluateReadiness(input: ReadinessInput): ReadinessAssessment {
  const factors: ReadinessFactor[] = [];
  const baseline = input.baseline ?? {};
  const loc: Locale = input.locale ?? 'cs';
  const hrs = (m: number) => formatHours(m, loc);

  // ── Sleep ──────────────────────────────────────────────────────────────────
  if (input.todaySleepMinutes == null) {
    factors.push({ key: 'sleep_missing', severity: 'green', message: L(loc, 'Spánek dnes nemáme.', 'No sleep data today.') });
  } else if (baseline.sleepMeanMinutes && baseline.sleepMeanMinutes > 0) {
    const ratio = input.todaySleepMinutes / baseline.sleepMeanMinutes;
    const pct = Math.round(ratio * 100);
    if (ratio < SLEEP_RATIO_RED) {
      factors.push({ key: 'sleep_short', severity: 'red',
        message: L(loc, `Spal jsi ${hrs(input.todaySleepMinutes)} — ${pct} % tvého průměru (${hrs(baseline.sleepMeanMinutes)}).`,
                        `You slept ${hrs(input.todaySleepMinutes)} — ${pct}% of your average (${hrs(baseline.sleepMeanMinutes)}).`) });
    } else if (ratio < SLEEP_RATIO_OK) {
      factors.push({ key: 'sleep_moderate', severity: 'yellow',
        message: L(loc, `Spánek pod průměrem (${hrs(input.todaySleepMinutes)} vs. ${hrs(baseline.sleepMeanMinutes)}).`,
                        `Sleep below average (${hrs(input.todaySleepMinutes)} vs. ${hrs(baseline.sleepMeanMinutes)}).`) });
    } else {
      factors.push({ key: 'sleep_ok', severity: 'green',
        message: L(loc, `Spánek v normě (${hrs(input.todaySleepMinutes)}).`, `Sleep on track (${hrs(input.todaySleepMinutes)}).`) });
    }
  } else {
    if (input.todaySleepMinutes < SLEEP_MIN_BORDERLINE) {
      factors.push({ key: 'sleep_short', severity: 'red', message: L(loc, `Spal jsi méně než 6 h (${hrs(input.todaySleepMinutes)}).`, `You slept under 6 h (${hrs(input.todaySleepMinutes)}).`) });
    } else if (input.todaySleepMinutes < SLEEP_MIN_OK) {
      factors.push({ key: 'sleep_moderate', severity: 'yellow', message: L(loc, `Spánek pod optimem (${hrs(input.todaySleepMinutes)}).`, `Sleep below optimum (${hrs(input.todaySleepMinutes)}).`) });
    } else {
      factors.push({ key: 'sleep_ok', severity: 'green', message: L(loc, `Spánek v normě (${hrs(input.todaySleepMinutes)}).`, `Sleep on track (${hrs(input.todaySleepMinutes)}).`) });
    }
  }

  // ── HRV ────────────────────────────────────────────────────────────────────
  if (input.todayHrvMs == null) {
    factors.push({ key: 'hrv_missing', severity: 'green', message: L(loc, 'HRV dnes nemáme.', 'No HRV data today.') });
  } else if (baseline.hrvMeanMs && baseline.hrvMeanMs > 0) {
    const ratio = input.todayHrvMs / baseline.hrvMeanMs;
    const pct = Math.round(ratio * 100);
    const v = Math.round(input.todayHrvMs);
    const avg = Math.round(baseline.hrvMeanMs);
    if (ratio < HRV_RATIO_RED) {
      factors.push({ key: 'hrv_low', severity: 'red',
        message: L(loc, `HRV ${v} ms — ${pct} % průměru (${avg} ms). Vysoký stres nebo nemoc.`,
                        `HRV ${v} ms — ${pct}% of average (${avg} ms). High stress or illness.`) });
    } else if (ratio < HRV_RATIO_OK) {
      factors.push({ key: 'hrv_moderate', severity: 'yellow',
        message: L(loc, `HRV mírně snížené (${v} ms vs. ${avg} ms průměr).`, `HRV slightly down (${v} ms vs. ${avg} ms average).`) });
    } else {
      factors.push({ key: 'hrv_ok', severity: 'green', message: L(loc, `HRV v normě (${v} ms).`, `HRV on track (${v} ms).`) });
    }
  } else {
    const v = Math.round(input.todayHrvMs);
    if (input.todayHrvMs < HRV_MIN_BORDERLINE) {
      factors.push({ key: 'hrv_low', severity: 'red', message: L(loc, `HRV velmi nízké (${v} ms) — možná stres nebo nemoc.`, `HRV very low (${v} ms) — possible stress or illness.`) });
    } else if (input.todayHrvMs < HRV_MIN_OK) {
      factors.push({ key: 'hrv_moderate', severity: 'yellow', message: L(loc, `HRV mírně snížené (${v} ms).`, `HRV slightly down (${v} ms).`) });
    } else {
      factors.push({ key: 'hrv_ok', severity: 'green', message: L(loc, `HRV v normě (${v} ms).`, `HRV on track (${v} ms).`) });
    }
  }

  // ── RHR ────────────────────────────────────────────────────────────────────
  if (input.todayRhrBpm == null) {
    factors.push({ key: 'rhr_missing', severity: 'green', message: L(loc, 'Klidový tep nemáme.', 'No resting HR data.') });
  } else if (baseline.rhrMeanBpm && baseline.rhrMeanBpm > 0) {
    const ratio = input.todayRhrBpm / baseline.rhrMeanBpm;
    const pct = Math.round(ratio * 100);
    const avg = Math.round(baseline.rhrMeanBpm);
    if (ratio > RHR_RATIO_RED) {
      factors.push({ key: 'rhr_high', severity: 'red',
        message: L(loc, `Klidový tep ${input.todayRhrBpm} bpm — ${pct} % průměru (${avg} bpm). Možná nemoc.`,
                        `Resting HR ${input.todayRhrBpm} bpm — ${pct}% of average (${avg} bpm). Possible illness.`) });
    } else if (ratio > RHR_RATIO_OK) {
      factors.push({ key: 'rhr_elevated', severity: 'yellow',
        message: L(loc, `Klidový tep zvýšený (${input.todayRhrBpm} bpm vs. ${avg} bpm průměr).`, `Resting HR elevated (${input.todayRhrBpm} bpm vs. ${avg} bpm average).`) });
    } else {
      factors.push({ key: 'rhr_ok', severity: 'green', message: L(loc, `Klidový tep v normě (${input.todayRhrBpm} bpm).`, `Resting HR on track (${input.todayRhrBpm} bpm).`) });
    }
  } else {
    if (input.todayRhrBpm > RHR_MAX_BORDERLINE) {
      factors.push({ key: 'rhr_high', severity: 'red', message: L(loc, `Klidový tep vysoký (${input.todayRhrBpm} bpm) — možná nemoc.`, `Resting HR high (${input.todayRhrBpm} bpm) — possible illness.`) });
    } else if (input.todayRhrBpm > RHR_MAX_OK) {
      factors.push({ key: 'rhr_elevated', severity: 'yellow', message: L(loc, `Klidový tep zvýšený (${input.todayRhrBpm} bpm).`, `Resting HR elevated (${input.todayRhrBpm} bpm).`) });
    } else {
      factors.push({ key: 'rhr_ok', severity: 'green', message: L(loc, `Klidový tep v normě (${input.todayRhrBpm} bpm).`, `Resting HR on track (${input.todayRhrBpm} bpm).`) });
    }
  }

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const reds = factors.filter(f => f.severity === 'red').length;
  const yellows = factors.filter(f => f.severity === 'yellow').length;
  const dataCount = factors.filter(f => !f.key.endsWith('_missing')).length;

  if (reds > 0) {
    return { level: 'red', factors, trainingAdjustment: 'reduce_to_easy',
      recommendation: L(loc, 'Doporučujeme dnes regeneraci. Pokud trénuješ, drž jen lehkou aktivitu a přidej spánek.',
                             'Recovery recommended today. If you train, keep it light and add sleep.') };
  }
  if (yellows >= 2) {
    return { level: 'red', factors, trainingAdjustment: 'reduce_to_easy',
      recommendation: L(loc, 'Více faktorů pod normou. Zkrať trénink nebo sniž intenzitu.',
                             'Multiple factors below normal. Shorten the workout or lower intensity.') };
  }
  if (yellows === 1) {
    return { level: 'yellow', factors, trainingAdjustment: 'reduce_to_moderate',
      recommendation: L(loc, 'Mírně snížená připravenost. Naplánovaný trénink zvládneš, ale poslouchej tělo.',
                             'Slightly reduced readiness. You can do the planned workout, but listen to your body.') };
  }
  if (dataCount === 0) {
    return { level: 'green', factors, trainingAdjustment: null,
      recommendation: L(loc, 'Nemáme dnes data o spánku ani HRV. Trénuj podle plánu.',
                             'No sleep or HRV data today. Train as planned.') };
  }
  return { level: 'green', factors, trainingAdjustment: null,
    recommendation: L(loc, 'Připraven na trénink. Můžeš jet podle plánu.', 'Ready to train. Go by your plan.') };
}

function formatHours(minutes: number, locale: Locale): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
