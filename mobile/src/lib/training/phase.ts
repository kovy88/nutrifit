// ── TRAINING PHASE (periodizace — viditelný štítek na Plan)
//
// Z týdne programu (weekIndex) + data závodu odvodí fázi: Build → Peak → Taper →
// Race week, plus Deload (každý 4. týden). Custom „Můj týden" rytmus periodizaci
// nemá → null. Pohání jen viditelný štítek; samotnou úpravu objemu řeší generátor.

import type { TrainingGoalKind } from '../../types';

export type TrainingPhase = 'build' | 'peak' | 'deload' | 'taper' | 'race_week';

function weeksUntil(raceISO: string | undefined, weekStartISO: string): number | null {
  if (!raceISO || !/^\d{4}-\d{2}-\d{2}$/.test(raceISO)) return null;
  const race = new Date(`${raceISO}T12:00:00`).getTime();
  const wk = new Date(`${weekStartISO}T12:00:00`).getTime();
  return Math.floor((race - wk) / (7 * 24 * 3600 * 1000));
}

/** Kolik týdnů taperu má daný cíl před závodem. */
function taperWeeksFor(goal: TrainingGoalKind): number {
  if (goal === 'full_ironman' || goal === 'marathon') return 3;
  if (goal === 'half_ironman' || goal === 'half_marathon') return 2;
  return 1;
}

export function trainingPhase(input: {
  weekIndex: number;
  weekStartISO: string;
  raceDateISO?: string;
  goalKind: TrainingGoalKind;
}): TrainingPhase | null {
  const { weekIndex, weekStartISO, raceDateISO, goalKind } = input;
  if (goalKind === 'none' || goalKind === 'play_sport') return null;

  const wtr = weeksUntil(raceDateISO, weekStartISO);
  if (wtr != null && wtr >= 0) {
    const taper = taperWeeksFor(goalKind);
    if (wtr === 0) return 'race_week';
    if (wtr < taper) return 'taper';
    if (wtr <= taper + 1) return 'peak'; // 1–2 týdny před taperem = vrchol objemu
  }

  if (weekIndex > 0 && weekIndex % 4 === 3) return 'deload';
  return 'build';
}
