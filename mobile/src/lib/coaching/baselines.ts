// ── PERSONAL HEALTH BASELINES
//
// Spočítá uživatelův typický klidový tep (RHR) a HRV za posledních N dní.
// Tyto hodnoty potom slouží jako reference pro readiness — místo absolutních
// thresholdů ("HRV < 25ms = red") porovnáváme s vlastním průměrem
// ("HRV < 70 % typického průměru = red"). Tím se appka přizpůsobí jak
// sportovci (HRV 80ms, RHR 48), tak kancelářskému pracovníkovi (HRV 35, RHR 70).
//
// Statistika je jednoduchá — průměr + směrodatná odchylka. Žádný outlier
// filter; pokud uživatel nahraje extrém, dostane do baseline. To je
// férové — extrémy ovlivňují skutečnou regeneraci.

import type { HealthDataProvider } from '../health/HealthDataProvider';

export type PersonalBaselines = {
  /** Klidová tepová frekvence — průměr za posledních N dní. */
  rhrMeanBpm: number | null;
  rhrStdBpm: number | null;
  /** Heart rate variability (SDNN ms) — průměr. */
  hrvMeanMs: number | null;
  hrvStdMs: number | null;
  /** Délka spánku v minutách — průměr (pro budoucí použití). */
  sleepMeanMinutes: number | null;
  /** Kolik dní reálně přispělo k baseline (≤ requestedDays). */
  sampleCount: { rhr: number; hrv: number; sleep: number };
  /** Kdy byl baseline spočítaný — pro TTL invalidaci. */
  computedAt: string;
};

export type ComputeBaselineOptions = {
  /** Kolik dní zpět agregovat. Default 14 — kompromis mezi citlivostí
   *  na nedávné změny a stabilitou (Whoop používá 30, Garmin 28). */
  days?: number;
  /** Referenční datum — default dnes. Užitečné pro testy. */
  endDate?: Date;
};

/**
 * Načte RHR + HRV + spánek za posledních N dní z providera a spočítá průměr.
 * Provider může vracet null pro dny, kdy nemá data — ty se přeskočí.
 *
 * Pokud sampleCount < 3 pro daný signál, vrátíme null (málo dat = nedělej
 * relativní readiness, použij absolutní thresholdy).
 */
export async function computePersonalBaselines(
  provider: HealthDataProvider,
  options: ComputeBaselineOptions = {},
): Promise<PersonalBaselines> {
  const days = options.days ?? 14;
  const endDate = options.endDate ?? new Date();

  const dayDates: Date[] = [];
  for (let i = days - 1; i >= 1; i--) {
    // Skipping i=0 (today) — readiness asks "how does today compare to history?"
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    dayDates.push(d);
  }

  const start = dayDates[0] ?? endDate;
  const end = dayDates[dayDates.length - 1] ?? endDate;

  // RHR + HRV are per-day — batch them concurrently per date.
  // Sleep comes from a range query in one shot.
  const [rhrSamples, hrvSamples, sleepList] = await Promise.all([
    Promise.all(dayDates.map(d => provider.getRestingHeartRate(d).catch(() => null))),
    Promise.all(dayDates.map(d => provider.getHrv(d).catch(() => null))),
    provider.getSleepSummary(start, end).catch(() => []),
  ]);

  const rhrValues = rhrSamples.filter(Boolean).map(s => s!.bpm);
  const hrvValues = hrvSamples.filter(Boolean).map(s => s!.ms);
  const sleepValues = sleepList.map(s => s.totalMinutes);

  return {
    rhrMeanBpm: meanOrNull(rhrValues, 3),
    rhrStdBpm: stdOrNull(rhrValues, 3),
    hrvMeanMs: meanOrNull(hrvValues, 3),
    hrvStdMs: stdOrNull(hrvValues, 3),
    sleepMeanMinutes: meanOrNull(sleepValues, 3),
    sampleCount: {
      rhr: rhrValues.length,
      hrv: hrvValues.length,
      sleep: sleepValues.length,
    },
    computedAt: new Date().toISOString(),
  };
}

/** True pokud baseline byl spočítaný před víc než `maxAgeHours` (default 24). */
export function isBaselineStale(baseline: PersonalBaselines, maxAgeHours = 24): boolean {
  const ageMs = Date.now() - new Date(baseline.computedAt).getTime();
  return ageMs > maxAgeHours * 3600 * 1000;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function meanOrNull(values: number[], minSamples: number): number | null {
  if (values.length < minSamples) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

function stdOrNull(values: number[], minSamples: number): number | null {
  if (values.length < minSamples) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - m) * (v - m), 0) / values.length;
  return Math.round(Math.sqrt(variance) * 100) / 100;
}
