// ── UNITS (metric ↔ imperial)
//
// Úložiště je VŽDY metrické (kg, km). Tenhle modul převádí jen pro ZOBRAZENÍ
// a VSTUP podle uživatelovy preference (`profile.units`). Čisté funkce —
// plně testovatelné bez Reactu. UI je obaluje přes hook `useUnits`.

import type { UnitSystem } from '../types';
export type { UnitSystem };

const LB_PER_KG = 2.2046226218;
const MI_PER_KM = 0.6213711922;

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function kgToLb(kg: number): number { return kg * LB_PER_KG; }
export function lbToKg(lb: number): number { return lb / LB_PER_KG; }
export function kmToMi(km: number): number { return km * MI_PER_KM; }
export function miToKm(mi: number): number { return mi / MI_PER_KM; }

export function weightUnitLabel(u: UnitSystem): string { return u === 'imperial' ? 'lb' : 'kg'; }
export function distanceUnitLabel(u: UnitSystem): string { return u === 'imperial' ? 'mi' : 'km'; }

/** kg (úložiště) → číslo v uživatelově jednotce, zaokrouhleno. */
export function displayWeight(kg: number, u: UnitSystem, decimals = 1): number {
  return round(u === 'imperial' ? kgToLb(kg) : kg, decimals);
}

/** Hodnota zadaná uživatelem (v jeho jednotce) → kg pro úložiště. */
export function parseWeightToKg(value: number, u: UnitSystem): number {
  return round(u === 'imperial' ? lbToKg(value) : value, 2);
}

/** km (úložiště) → číslo v uživatelově jednotce, zaokrouhleno. */
export function displayDistance(km: number, u: UnitSystem, decimals = 1): number {
  return round(u === 'imperial' ? kmToMi(km) : km, decimals);
}

/** Hodnota zadaná uživatelem (v jeho jednotce) → km pro úložiště. */
export function parseDistanceToKm(value: number, u: UnitSystem): number {
  return round(u === 'imperial' ? miToKm(value) : value, 2);
}

/** „72 kg" / „159 lb" — pohotový formát váhy. */
export function formatWeight(kg: number, u: UnitSystem, decimals = 1): string {
  return `${displayWeight(kg, u, decimals)} ${weightUnitLabel(u)}`;
}

/** „5 km" / „3.1 mi" — pohotový formát vzdálenosti. */
export function formatDistance(km: number, u: UnitSystem, decimals = 1): string {
  return `${displayDistance(km, u, decimals)} ${distanceUnitLabel(u)}`;
}
