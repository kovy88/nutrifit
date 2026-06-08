// ── useUnits — UI helper nad lib/units, navázaný na profil uživatele.
// Úložiště je metrické; tyhle helpery převádějí pro zobrazení/vstup.

import { useTrenr } from '../context/TrenrContext';
import {
  displayWeight, parseWeightToKg, displayDistance, parseDistanceToKm,
  weightUnitLabel, distanceUnitLabel, convertDistanceInText, type UnitSystem,
} from '../lib/units';

export function useUnits() {
  const { profile } = useTrenr();
  const u: UnitSystem = profile?.units ?? 'metric';
  return {
    units: u,
    isImperial: u === 'imperial',
    weightUnit: weightUnitLabel(u),
    distanceUnit: distanceUnitLabel(u),
    /** kg → číslo v jednotce uživatele. */
    showWeight: (kg: number, decimals = 1) => displayWeight(kg, u, decimals),
    /** vstup (v jednotce uživatele) → kg pro úložiště. */
    toKg: (v: number) => parseWeightToKg(v, u),
    /** km → číslo v jednotce uživatele. */
    showDistance: (km: number, decimals = 1) => displayDistance(km, u, decimals),
    /** vstup (v jednotce uživatele) → km pro úložiště. */
    toKm: (v: number) => parseDistanceToKm(v, u),
    /** převede „N km" v libovolném textu (názvy tréninků) na míle (imperial). */
    showText: (s: string) => convertDistanceInText(s, u),
  };
}
