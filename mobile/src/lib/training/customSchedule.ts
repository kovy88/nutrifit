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

function activityLabel(a: PlannedActivity, locale: string): string {
  const t = a.title?.trim();
  return t && t.length ? t : defaultLabel(a.kind, locale);
}

/** Z aktivit dne vybere "primary" session: match > nejvyšší intenzita > první. */
function pickPrimary(acts: PlannedActivity[]): PlannedActivity {
  const match = acts.find(a => a.isMatch || a.kind === 'match');
  if (match) return match;
  return [...acts].sort((a, b) => INTENSITY_RANK[b.intensity] - INTENSITY_RANK[a.intensity])[0];
}

/** True, pokud profil má neprázdnou „Můj týden" šablonu = custom režim. */
export function hasCustomSchedule(profile: { weeklyActivities?: WeeklyActivityTemplate } | null | undefined): boolean {
  const tpl = profile?.weeklyActivities;
  return !!tpl && Object.values(tpl).some(list => Array.isArray(list) && list.length > 0);
}

/** Poskládá týdenní plán z uživatelské šablony pro týden začínající `weekStartISO` (pondělí). */
export function materializeWeeklyTemplate(
  profile: Pick<UserProfile, 'weeklyActivities' | 'mainSport' | 'trainingGoal'>,
  weekStartISO: string,
  locale: string = 'cs',
): TrainingPlan {
  const template = profile.weeklyActivities ?? {};
  const sessions: TrainingSession[] = [];

  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(weekStartISO, offset);
    const acts = template[offset as 0 | 1 | 2 | 3 | 4 | 5 | 6] ?? [];

    if (!acts.length) {
      sessions.push({ date, kind: 'rest', title: localizeTrainingText('Volno', locale), durationMinutes: 0, intensity: 'rest' });
      continue;
    }

    const primary = pickPrimary(acts);
    const extras = acts.filter(a => a !== primary).map(a => activityLabel(a, locale));
    sessions.push({
      date,
      kind: primary.kind,
      title: activityLabel(primary, locale),
      durationMinutes: primary.durationMinutes ?? DEFAULT_DURATION[primary.kind] ?? 30,
      intensity: primary.intensity,
      ...(primary.distanceKm ? { distanceKm: primary.distanceKm } : {}),
      ...(extras.length ? { notes: extras.join(' · ') } : {}),
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
