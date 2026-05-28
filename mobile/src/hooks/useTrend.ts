// ── useTrend
//
// Hook pro načítání denních hodnot zvolené metriky za posledních N dní.
// Vrací data ve tvaru { date, value | null } seřazené chronologicky
// (nejstarší první), připravené pro MiniTrendChart.
//
// Hodnoty se získávají z aktivního HealthDataProvideru (Composite v auto módu),
// takže můžou pocházet z Apple Health / Strava / Whoop / Manual najednou.

import { useEffect, useState, useCallback } from 'react';
import { useHealthDataProvider } from './useHealthDataProvider';
import type { TrendPoint } from '../components/MiniTrendChart';

export type TrendMetric =
  | 'weight'           // BodyWeightSample.weightKg (uses getLatestBodyWeight per day via Manual store fallback)
  | 'sleep'            // SleepSummary.totalMinutes
  | 'rhr'              // RestingHeartRateSample.bpm
  | 'hrv'              // HrvSample.ms
  | 'steps'            // DailyActivitySummary.steps
  | 'activeEnergy';    // DailyActivitySummary.activeEnergyKcal

export type TrendState = {
  data: TrendPoint[];
  isLoading: boolean;
};

/**
 * Načte denní hodnoty zvolené metriky za posledních `days` dní.
 *
 * Pro `weight` provider nemá per-den endpoint (`getLatestBodyWeight` je
 * single-shot), takže weight trend se musí dostat jiným kanálem — buď
 * přes `weightsByDate` z NutriFitContext (manual entries), nebo později
 * přes provider extension. Zatím necháváme volajícího aby data dodal.
 */
export function useTrend(metric: TrendMetric, days = 14): TrendState {
  const provider = useHealthDataProvider();
  const [state, setState] = useState<TrendState>({ data: [], isLoading: true });

  const refresh = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true }));
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));

    try {
      const data = await fetchTrend(provider, metric, start, end);
      setState({ data, isLoading: false });
    } catch {
      setState({ data: [], isLoading: false });
    }
  }, [provider, metric, days]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return state;
}

async function fetchTrend(
  provider: ReturnType<typeof useHealthDataProvider>,
  metric: TrendMetric,
  start: Date,
  end: Date,
): Promise<TrendPoint[]> {
  const out: TrendPoint[] = [];

  if (metric === 'sleep') {
    const list = await provider.getSleepSummary(start, end);
    return fillRange(start, end, dateKey => {
      const s = list.find(x => x.date === dateKey);
      return s ? s.totalMinutes : null;
    });
  }

  if (metric === 'steps' || metric === 'activeEnergy') {
    const list = await provider.getDailyActivityRange(start, end);
    return fillRange(start, end, dateKey => {
      const a = list.find(x => x.date === dateKey);
      if (!a) return null;
      return metric === 'steps' ? a.steps : a.activeEnergyKcal;
    });
  }

  if (metric === 'rhr' || metric === 'hrv') {
    // Per-day queries; query in parallel.
    const dates = enumerateDates(start, end);
    const results = await Promise.all(
      dates.map(d => (metric === 'rhr' ? provider.getRestingHeartRate(d) : provider.getHrv(d))),
    );
    dates.forEach((d, i) => {
      const sample: any = results[i];
      const value = sample ? (metric === 'rhr' ? sample.bpm : sample.ms) : null;
      out.push({ date: toDateKey(d), value });
    });
    return out;
  }

  // weight not supported by the provider per-day; caller should pass weights map.
  return [];
}

function enumerateDates(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(0, 0, 0, 0);
  while (d <= stop) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function fillRange(start: Date, end: Date, picker: (dateKey: string) => number | null): TrendPoint[] {
  return enumerateDates(start, end).map(d => {
    const key = toDateKey(d);
    return { date: key, value: picker(key) };
  });
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Convert a `Record<DateKey, number>` (e.g. `weightsByDate` z NutriFitContext)
 * na TrendPoint[] pro daný rozsah. Slouží jako most pro metriky, které
 * neprochází přes HealthDataProvider (váha, pocity z check-inu, atd.).
 */
export function buildTrendFromRecord(
  record: Record<string, number>,
  days: number,
  endDate: Date = new Date(),
): TrendPoint[] {
  const start = new Date(endDate);
  start.setDate(start.getDate() - (days - 1));
  return fillRange(start, endDate, dateKey => {
    const v = record[dateKey];
    return v != null ? v : null;
  });
}
