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
import type { ConfidenceLevel, ReadinessBand, ReadinessScore, RecommendedIntensity, RecoveryInputs } from '../../types/coach';

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
  /** How complete the objective recovery signals are. Missing data is not the same as green readiness. */
  confidence: ConfidenceLevel;
  dataStatus: 'missing' | 'partial' | 'complete';
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
        message: L(loc, `HRV ${v} ms — ${pct} % tvého průměru (${avg} ms). Tělo je výrazně pod regenerací.`,
                        `HRV ${v} ms — ${pct}% of your average (${avg} ms). Your body is well under-recovered.`) });
    } else if (ratio < HRV_RATIO_OK) {
      factors.push({ key: 'hrv_moderate', severity: 'yellow',
        message: L(loc, `HRV mírně snížené (${v} ms vs. ${avg} ms průměr).`, `HRV slightly down (${v} ms vs. ${avg} ms average).`) });
    } else {
      factors.push({ key: 'hrv_ok', severity: 'green', message: L(loc, `HRV v normě (${v} ms).`, `HRV on track (${v} ms).`) });
    }
  } else {
    const v = Math.round(input.todayHrvMs);
    if (input.todayHrvMs < HRV_MIN_BORDERLINE) {
      factors.push({ key: 'hrv_low', severity: 'red', message: L(loc, `HRV velmi nízké (${v} ms) — zvaž únavu nebo stres.`, `HRV very low (${v} ms) — consider fatigue or stress.`) });
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
        message: L(loc, `Klidový tep ${input.todayRhrBpm} bpm — ${pct} % tvého průměru (${avg} bpm). Výrazně zvýšený, zvaž víc odpočinku.`,
                        `Resting HR ${input.todayRhrBpm} bpm — ${pct}% of your average (${avg} bpm). Notably elevated, consider more rest.`) });
    } else if (ratio > RHR_RATIO_OK) {
      factors.push({ key: 'rhr_elevated', severity: 'yellow',
        message: L(loc, `Klidový tep zvýšený (${input.todayRhrBpm} bpm vs. ${avg} bpm průměr).`, `Resting HR elevated (${input.todayRhrBpm} bpm vs. ${avg} bpm average).`) });
    } else {
      factors.push({ key: 'rhr_ok', severity: 'green', message: L(loc, `Klidový tep v normě (${input.todayRhrBpm} bpm).`, `Resting HR on track (${input.todayRhrBpm} bpm).`) });
    }
  } else {
    if (input.todayRhrBpm > RHR_MAX_BORDERLINE) {
      factors.push({ key: 'rhr_high', severity: 'red', message: L(loc, `Klidový tep vysoký (${input.todayRhrBpm} bpm) — zvaž víc odpočinku.`, `Resting HR high (${input.todayRhrBpm} bpm) — consider more rest.`) });
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
  const confidence = confidenceFromDataCount(dataCount);
  const dataStatus = dataCount === 0 ? 'missing' : dataCount >= 3 ? 'complete' : 'partial';

  if (reds > 0) {
    return { level: 'red', factors, confidence, dataStatus, trainingAdjustment: 'reduce_to_easy',
      recommendation: L(loc, 'Doporučujeme dnes regeneraci. Pokud trénuješ, drž jen lehkou aktivitu a přidej spánek.',
                             'Recovery recommended today. If you train, keep it light and add sleep.') };
  }
  if (yellows >= 2) {
    return { level: 'red', factors, confidence, dataStatus, trainingAdjustment: 'reduce_to_easy',
      recommendation: L(loc, 'Více faktorů pod normou. Zkrať trénink nebo sniž intenzitu.',
                             'Multiple factors below normal. Shorten the workout or lower intensity.') };
  }
  if (yellows === 1) {
    return { level: 'yellow', factors, confidence, dataStatus, trainingAdjustment: 'reduce_to_moderate',
      recommendation: L(loc, 'Mírně snížená připravenost. Naplánovaný trénink zvládneš, ale poslouchej tělo.',
                             'Slightly reduced readiness. You can do the planned workout, but listen to your body.') };
  }
  if (dataCount === 0) {
    return { level: 'green', factors, confidence, dataStatus, trainingAdjustment: null,
      recommendation: L(loc, 'Nemáme dnes data o spánku, HRV ani klidovém tepu. Ber readiness jako orientační a řiď se pocitem.',
                             'No sleep, HRV or resting-HR data today. Treat readiness as guidance and go by feel.') };
  }
  return { level: 'green', factors, confidence, dataStatus, trainingAdjustment: null,
    recommendation: L(loc, 'Připraven na trénink. Můžeš jet podle plánu.', 'Ready to train. Go by your plan.') };
}

function confidenceFromDataCount(dataCount: number): ConfidenceLevel {
  if (dataCount >= 3) return 'high';
  if (dataCount >= 2) return 'medium';
  return 'low';
}

function formatHours(minutes: number, locale: Locale): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── NUMERIC READINESS SCORE (0–100) ─────────────────────────────────────────
//
// Koučovací skóre, NE medicínské. Skládá sleep/HRV/RHR sub-skóre (každé 0–100,
// vyšší = lepší), zváží je přes DOSTUPNÉ vstupy a aplikuje modifikátory (ACWR,
// spánkový/recovery dluh, subjektivní energie). Degraduje gracefully — když
// nejsou objektivní data, vrátí konzervativní střed (55) s confidence 'low'.
// Nikdy nethrowuje. Existující `evaluateReadiness` (green/yellow/red) zůstává
// beze změny; tohle je samostatný číselný pohled pro Today dashboard.

const SCORE_WEIGHTS = { sleep: 0.4, hrv: 0.3, rhr: 0.3 };

export function scoreReadiness(input: RecoveryInputs, locale: Locale = 'cs'): ReadinessScore {
  const loc = locale;
  const baseline = input.baseline ?? {};
  const drivers: string[] = [];
  const parts: Array<{ w: number; v: number }> = [];

  if (input.todaySleepMinutes != null) {
    const s = sleepSubScore(input.todaySleepMinutes, baseline.sleepMeanMinutes);
    parts.push({ w: SCORE_WEIGHTS.sleep, v: s });
    if (s < 50) drivers.push(L(loc, `Málo spánku (${formatHours(input.todaySleepMinutes, loc)})`, `Low sleep (${formatHours(input.todaySleepMinutes, loc)})`));
  }
  if (input.todayHrvMs != null) {
    const s = hrvSubScore(input.todayHrvMs, baseline.hrvMeanMs);
    parts.push({ w: SCORE_WEIGHTS.hrv, v: s });
    if (s < 50) drivers.push(L(loc, `Snížené HRV (${Math.round(input.todayHrvMs)} ms)`, `Low HRV (${Math.round(input.todayHrvMs)} ms)`));
  }
  if (input.todayRhrBpm != null) {
    const s = rhrSubScore(input.todayRhrBpm, baseline.rhrMeanBpm);
    parts.push({ w: SCORE_WEIGHTS.rhr, v: s });
    if (s < 50) drivers.push(L(loc, `Zvýšený klidový tep (${input.todayRhrBpm} bpm)`, `Elevated resting HR (${input.todayRhrBpm} bpm)`));
  }

  const objectiveCount = parts.length;
  let score: number;
  if (objectiveCount > 0) {
    const totalW = parts.reduce((acc, p) => acc + p.w, 0);
    score = parts.reduce((acc, p) => acc + p.v * p.w, 0) / totalW;
  } else {
    score = 55; // neutral-conservative default when we have no wearable data
    drivers.push(L(loc, 'Chybí data spánku, HRV a klidového tepu', 'Missing sleep, HRV and resting-HR data'));
  }

  // ── Modifiers ──────────────────────────────────────────────────────────────
  if (input.acwr != null) {
    if (input.acwr > 1.5) { score -= 12; drivers.push(L(loc, 'Zátěž roste rychleji než obvykle', 'Training load is rising faster than usual')); }
    else if (input.acwr > 1.3) { score -= 6; }
  }
  if (input.sleepDebtHours != null) {
    if (input.sleepDebtHours >= 10) { score -= 10; drivers.push(L(loc, `Spánkový dluh ${Math.round(input.sleepDebtHours)} h`, `Sleep debt ${Math.round(input.sleepDebtHours)} h`)); }
    else if (input.sleepDebtHours >= 5) { score -= 5; }
  }
  if (input.recoveryDebt != null) {
    if (input.recoveryDebt >= 6) { score -= 8; }
    else if (input.recoveryDebt >= 3) { score -= 4; }
  }
  if (input.subjectiveEnergy != null) {
    const e = input.subjectiveEnergy;
    score += e === 1 ? -10 : e === 2 ? -5 : e === 4 ? 3 : e === 5 ? 6 : 0;
    if (e <= 2) drivers.push(L(loc, 'Nízká subjektivní energie', 'Low subjective energy'));
  }
  if (input.subjectiveSoreness != null) {
    const s = input.subjectiveSoreness;
    score += s === 5 ? -10 : s === 4 ? -6 : s === 3 ? -2 : s === 1 ? 2 : 0;
    if (s >= 4) drivers.push(L(loc, 'Vysoká bolest nebo svalovka', 'High soreness or pain'));
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const band: ReadinessBand = score >= 67 ? 'high' : score >= 40 ? 'medium' : 'low';
  const recommendedIntensity: RecommendedIntensity =
    score >= 70 ? 'hard' : score >= 55 ? 'moderate' : score >= 35 ? 'easy' : 'rest';
  const confidence: ReadinessScore['confidence'] =
    objectiveCount >= 3 ? 'high' : objectiveCount >= 2 ? 'medium' : 'low';

  if (objectiveCount > 0 && objectiveCount < 3) {
    drivers.push(L(loc, `Nízká jistota: ${objectiveCount}/3 recovery signálů`, `Low confidence: ${objectiveCount}/3 recovery signals`));
  }

  if (drivers.length === 0) {
    drivers.push(score >= 67
      ? L(loc, 'Dobrá připravenost', 'Good readiness')
      : L(loc, 'Průměrná připravenost', 'Average readiness'));
  }

  return { score, band, recommendedIntensity, drivers, confidence };
}

/** Sleep sub-score 0–100 (higher = better). Ratio-based when baseline known. */
function sleepSubScore(minutes: number, baselineMean?: number | null): number {
  if (baselineMean && baselineMean > 0) {
    const r = minutes / baselineMean;
    if (r >= 1.0) return 92;
    if (r >= 0.9) return 78;
    if (r >= 0.8) return 60;
    if (r >= 0.7) return 45;
    return 28;
  }
  if (minutes >= 480) return 92;
  if (minutes >= 420) return 80;
  if (minutes >= 360) return 55;
  if (minutes >= 300) return 38;
  return 25;
}

/** HRV sub-score 0–100 (higher = better). */
function hrvSubScore(ms: number, baselineMean?: number | null): number {
  if (baselineMean && baselineMean > 0) {
    const r = ms / baselineMean;
    if (r >= 1.0) return 92;
    if (r >= 0.85) return 75;
    if (r >= 0.7) return 50;
    return 28;
  }
  if (ms >= 50) return 85;
  if (ms >= 35) return 65;
  if (ms >= 25) return 45;
  return 25;
}

/** Resting-HR sub-score 0–100 (LOWER bpm = better). */
function rhrSubScore(bpm: number, baselineMean?: number | null): number {
  if (baselineMean && baselineMean > 0) {
    const r = bpm / baselineMean;
    if (r <= 1.0) return 90;
    if (r <= 1.1) return 70;
    if (r <= 1.2) return 45;
    return 25;
  }
  if (bpm <= 60) return 90;
  if (bpm <= 75) return 70;
  if (bpm <= 85) return 45;
  return 25;
}
