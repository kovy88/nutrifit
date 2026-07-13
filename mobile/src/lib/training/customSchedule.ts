// ── CUSTOM WEEKLY SCHEDULE ("Můj týden")
//
// Materializuje uživatelskou opakující se týdenní šablonu (`profile.weeklyActivities`)
// do TrainingPlan pro daný týden — místo aby engine diktoval předepsaný plán.
// Aktivity řídí fueling/regeneraci přes `kind` + `intensity` (stejně jako
// generovaný plán), takže kouč funguje beze změny.
//
// Konvence: klíč šablony = offset od pondělí (0=Po … 6=Ne).
// Jeden "primary" session na den (match > nejvyšší intenzita > první); ostatní
// aktivity dne se připojí do `notes` (např. „Sauna").

import type { PlannedActivity, SessionKind, TrainingSession, UserProfile, WeeklyActivityTemplate } from '../../types';
import type { TrainingPlan } from './training-core';
import { localizeTrainingText } from './localizeTitle';
import { sportName } from './sports';

const INTENSITY_RANK: Record<PlannedActivity['intensity'], number> = { rest: 0, easy: 1, moderate: 2, hard: 3 };

const DEFAULT_DURATION: Partial<Record<SessionKind, number>> = {
  rest: 0, mobility: 20, recovery: 25, recovery_walk: 30, strength: 45,
  easy_run: 35, tempo: 40, intervals: 40, long_run: 70, recovery_run: 30,
  cross_training: 45, functional: 50, swim: 40, bike: 60, brick: 75,
  sport: 60, match: 70, combat: 60, race: 60,
};

/** Lokalizovaný výchozí název podle typu (když uživatel nezadal vlastní label). */
function defaultLabel(kind: SessionKind, locale: string): string {
  const en = locale === 'en';
  const map: Partial<Record<SessionKind, [string, string]>> = {
    sport: ['Sport', 'Sport'],
    match: ['Zápas', 'Match'],
    combat: ['Bojový trénink', 'Combat training'],
    recovery: ['Regenerace', 'Recovery'],
    strength: ['Silový trénink', 'Strength'],
    mobility: ['Mobilita', 'Mobility'],
    easy_run: ['Lehký běh', 'Easy run'],
    tempo: ['Tempo běh', 'Tempo run'],
    intervals: ['Intervaly', 'Intervals'],
    long_run: ['Dlouhý běh', 'Long run'],
    recovery_run: ['Regenerační běh', 'Recovery run'],
    recovery_walk: ['Regenerační chůze', 'Recovery walk'],
    cross_training: ['Kros-trénink', 'Cross training'],
    functional: ['Funkční trénink', 'Functional'],
    swim: ['Plavání', 'Swim'],
    bike: ['Kolo', 'Bike'],
    rest: ['Volno', 'Rest'],
  };
  const pair = map[kind];
  return pair ? (en ? pair[1] : pair[0]) : kind;
}

function activityLabel(a: PlannedActivity, locale: string, sportLbl?: string): string {
  const t = a.title?.trim();
  if (t && t.length) return t;
  // Dny hlavního sportu (bez vlastního titulku) pojmenuj jménem sportu.
  if (a.kind === 'sport' && sportLbl) return sportLbl;
  return defaultLabel(a.kind, locale);
}

/** Z aktivit dne vybere "primary" session: match > nejvyšší intenzita > první. */
function pickPrimary(acts: PlannedActivity[]): PlannedActivity {
  const match = acts.find(a => a.isMatch || a.kind === 'match');
  if (match) return match;
  return [...acts].sort((a, b) => INTENSITY_RANK[b.intensity] - INTENSITY_RANK[a.intensity])[0];
}

/** True, pokud profil má neprázdnou „Můj týden" šablonu = custom režim. */
export function hasCustomSchedule(profile: { weeklyActivities?: WeeklyActivityTemplate; trainingGoal?: string } | null | undefined): boolean {
  // 'play_sport' = custom režim i s prázdnou šablonou (uživatel si týden teprve postaví).
  if (profile?.trainingGoal === 'play_sport') return true;
  const tpl = profile?.weeklyActivities;
  return !!tpl && Object.values(tpl).some(list => Array.isArray(list) && list.length > 0);
}

/** Poskládá týdenní plán z uživatelské šablony pro týden začínající `weekStartISO` (pondělí). */
export function materializeWeeklyTemplate(
  profile: Pick<UserProfile, 'weeklyActivities' | 'mainSport' | 'trainingGoal'>,
  weekStartISO: string,
  locale: string = 'en',
): TrainingPlan {
  const template = profile.weeklyActivities ?? {};
  const sportLbl = sportName(profile.mainSport?.id, profile.mainSport?.label, locale);
  const sessions: TrainingSession[] = [];

  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(weekStartISO, offset);
    const acts = template[offset as 0 | 1 | 2 | 3 | 4 | 5 | 6] ?? [];

    if (!acts.length) {
      sessions.push({ date, kind: 'rest', title: localizeTrainingText('Volno', locale), durationMinutes: 0, intensity: 'rest' });
      continue;
    }

    const primary = pickPrimary(acts);
    const rest = acts.filter(a => a !== primary);
    const secondAct = rest.length
      ? [...rest].sort((a, b) => INTENSITY_RANK[b.intensity] - INTENSITY_RANK[a.intensity])[0]
      : null;
    const others = rest.filter(a => a !== secondAct).map(a => activityLabel(a, locale, sportLbl));
    sessions.push({
      date,
      kind: primary.kind,
      title: activityLabel(primary, locale, sportLbl),
      durationMinutes: primary.durationMinutes ?? DEFAULT_DURATION[primary.kind] ?? 30,
      intensity: primary.intensity,
      ...(primary.distanceKm ? { distanceKm: primary.distanceKm } : {}),
      ...(secondAct ? {
        second: {
          kind: secondAct.kind,
          title: activityLabel(secondAct, locale, sportLbl),
          intensity: secondAct.intensity,
          durationMinutes: secondAct.durationMinutes ?? DEFAULT_DURATION[secondAct.kind] ?? 30,
          ...(secondAct.distanceKm ? { distanceKm: secondAct.distanceKm } : {}),
        },
      } : {}),
      ...(others.length ? { notes: others.join(' · ') } : {}),
    });
  }

  return {
    goalKind: profile.trainingGoal ?? 'none',
    weekStartISO,
    weekIndex: 0,
    sessions,
    totalKm: Math.round(sessions.reduce((s, x) => s + (x.distanceKm ?? 0), 0) * 10) / 10,
    warnings: [],
  };
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Příští zápas z opakující se šablony (kterýkoli den s isMatch/match), relativně k dnešku. */
export function nextMatchInfo(
  weeklyActivities: WeeklyActivityTemplate | undefined,
  todayISO: string,
): { date: string; daysUntil: number } | null {
  const tpl = weeklyActivities ?? {};
  const matchOffsets: number[] = [];
  for (let d = 0; d < 7; d++) {
    const acts = tpl[d as 0 | 1 | 2 | 3 | 4 | 5 | 6] ?? [];
    if (acts.some(a => a.isMatch || a.kind === 'match')) matchOffsets.push(d);
  }
  if (!matchOffsets.length) return null;

  const today = new Date(`${todayISO}T12:00:00`);
  const dow = (today.getDay() + 6) % 7; // Po=0 … Ne=6
  let best: { date: string; daysUntil: number } | null = null;
  for (const off of matchOffsets) {
    const delta = (off - dow + 7) % 7;
    if (!best || delta < best.daysUntil) best = { date: addDays(todayISO, delta), daysUntil: delta };
  }
  return best;
}
