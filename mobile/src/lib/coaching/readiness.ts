// ── READINESS ASSESSMENT
//
// Vyhodnotí, jestli je dnes uživatel připravený na plánovaný trénink,
// na základě spánku + HRV + klidového tepu. Inspirace: Whoop "Recovery",
// Garmin "Body Battery", Oura "Readiness".
//
// Pravidla (absolutní prahy, ne personalizované — to přidáme s backendem):
//   Spánek < 6 h         → red   (akutní spánkový deficit)
//   Spánek 6–7 h         → yellow
//   Spánek 7+ h          → green
//
//   HRV SDNN < 25 ms     → red   (chronický stres / nemoc / přetrénování)
//   HRV SDNN 25–35 ms    → yellow
//   HRV SDNN 35+ ms      → green
//
//   Klidový tep > 75 bpm → yellow (zvýšený = stres/dehydratace/nemoc)
//   Klidový tep > 85 bpm → red
//   Klidový tep ≤ 75 bpm → green
//
// Agregace:
//   - jakýkoli red         → red
//   - dva nebo víc yellow  → red
//   - jeden yellow         → yellow
//   - vše green nebo data nedostupná → green
//
// Když nejsou dostupná data (Manual provider, prázdná lednice), vrátíme
// 'green' s informativní zprávou — appka nemůže blokovat trénink jen
// kvůli chybějícím datům.

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
  /** Krátká doporučující věta v češtině — co dnes dělat. */
  recommendation: string;
  /** Doporučená úprava intenzity tréninku. null = beze změny. */
  trainingAdjustment: 'reduce_to_easy' | 'reduce_to_moderate' | null;
};

export type ReadinessInput = {
  todaySleepMinutes?: number | null;
  todayRhrBpm?: number | null;
  todayHrvMs?: number | null;
};

// ── Thresholds (named constants — easy to tune from a single place) ─────────

const SLEEP_MIN_OK = 420;          // 7 h
const SLEEP_MIN_BORDERLINE = 360;  // 6 h
const HRV_MIN_OK = 35;
const HRV_MIN_BORDERLINE = 25;
const RHR_MAX_OK = 75;
const RHR_MAX_BORDERLINE = 85;

export function evaluateReadiness(input: ReadinessInput): ReadinessAssessment {
  const factors: ReadinessFactor[] = [];

  // ── Sleep ──────────────────────────────────────────────────────────────────
  if (input.todaySleepMinutes == null) {
    factors.push({ key: 'sleep_missing', severity: 'green', message: 'Spánek dnes nemáme.' });
  } else if (input.todaySleepMinutes < SLEEP_MIN_BORDERLINE) {
    factors.push({
      key: 'sleep_short',
      severity: 'red',
      message: `Spal jsi méně než 6 h (${formatHours(input.todaySleepMinutes)}).`,
    });
  } else if (input.todaySleepMinutes < SLEEP_MIN_OK) {
    factors.push({
      key: 'sleep_moderate',
      severity: 'yellow',
      message: `Spánek pod optimem (${formatHours(input.todaySleepMinutes)}).`,
    });
  } else {
    factors.push({
      key: 'sleep_ok',
      severity: 'green',
      message: `Spánek v normě (${formatHours(input.todaySleepMinutes)}).`,
    });
  }

  // ── HRV ────────────────────────────────────────────────────────────────────
  if (input.todayHrvMs == null) {
    factors.push({ key: 'hrv_missing', severity: 'green', message: 'HRV dnes nemáme.' });
  } else if (input.todayHrvMs < HRV_MIN_BORDERLINE) {
    factors.push({
      key: 'hrv_low',
      severity: 'red',
      message: `HRV velmi nízké (${Math.round(input.todayHrvMs)} ms) — možná stres nebo nemoc.`,
    });
  } else if (input.todayHrvMs < HRV_MIN_OK) {
    factors.push({
      key: 'hrv_moderate',
      severity: 'yellow',
      message: `HRV mírně snížené (${Math.round(input.todayHrvMs)} ms).`,
    });
  } else {
    factors.push({
      key: 'hrv_ok',
      severity: 'green',
      message: `HRV v normě (${Math.round(input.todayHrvMs)} ms).`,
    });
  }

  // ── RHR ────────────────────────────────────────────────────────────────────
  if (input.todayRhrBpm == null) {
    factors.push({ key: 'rhr_missing', severity: 'green', message: 'Klidový tep nemáme.' });
  } else if (input.todayRhrBpm > RHR_MAX_BORDERLINE) {
    factors.push({
      key: 'rhr_high',
      severity: 'red',
      message: `Klidový tep vysoký (${input.todayRhrBpm} bpm) — možná nemoc.`,
    });
  } else if (input.todayRhrBpm > RHR_MAX_OK) {
    factors.push({
      key: 'rhr_elevated',
      severity: 'yellow',
      message: `Klidový tep zvýšený (${input.todayRhrBpm} bpm).`,
    });
  } else {
    factors.push({
      key: 'rhr_ok',
      severity: 'green',
      message: `Klidový tep v normě (${input.todayRhrBpm} bpm).`,
    });
  }

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const reds = factors.filter(f => f.severity === 'red').length;
  const yellows = factors.filter(f => f.severity === 'yellow').length;
  const dataCount = factors.filter(f => !f.key.endsWith('_missing')).length;

  if (reds > 0) {
    return {
      level: 'red',
      factors,
      recommendation: 'Doporučujeme dnes regeneraci. Pokud trénuješ, drž jen lehkou aktivitu a přidej spánek.',
      trainingAdjustment: 'reduce_to_easy',
    };
  }
  if (yellows >= 2) {
    return {
      level: 'red',
      factors,
      recommendation: 'Více faktorů pod normou. Zkrať trénink nebo sniž intenzitu.',
      trainingAdjustment: 'reduce_to_easy',
    };
  }
  if (yellows === 1) {
    return {
      level: 'yellow',
      factors,
      recommendation: 'Mírně snížená připravenost. Naplánovaný trénink zvládneš, ale poslouchej tělo.',
      trainingAdjustment: 'reduce_to_moderate',
    };
  }
  if (dataCount === 0) {
    return {
      level: 'green',
      factors,
      recommendation: 'Nemáme dnes data o spánku ani HRV. Trénuj podle plánu.',
      trainingAdjustment: null,
    };
  }
  return {
    level: 'green',
    factors,
    recommendation: 'Připraven na trénink. Můžeš jet podle plánu.',
    trainingAdjustment: null,
  };
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
