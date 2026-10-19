// ── TRAINING MODULE PUBLIC API
//
// Progresivní tréninkový planner (port z js/domain/training.js) + adaptér,
// který nahrazuje statický `buildTrainingSessionForDate` z utils/nutrition.ts.
// Generuje TÝDENNÍ plán a vrátí jednotku pro konkrétní den.

import type { TrainingSession, UserProfile , TrainingCompletionRecordMap } from '../../types';
import type { SleepSummary, WorkoutSummary } from '../../types/health';
import { adjustTrainingAfterMissedSession, generateTrainingPlan, type TrainingGoal, type TrainingPlan } from './plan';
import { localizeTrainingText, localizeSessionTitles } from './localizeTitle';
import { hasCustomSchedule, materializeWeeklyTemplate } from './customSchedule';

export { hasCustomSchedule, materializeWeeklyTemplate, nextMatchInfo } from './customSchedule';

export * from './plan';
export * from './feasibility';
export { localizeTrainingText } from './localizeTitle';

/** Localize a generated plan's titles + warnings for display. No-op for cs. */
function localizePlan(plan: TrainingPlan, locale: string): TrainingPlan {
  if (locale !== 'en') return plan;
  return {
    ...plan,
    sessions: localizeSessionTitles(plan.sessions, locale),
    warnings: (plan.warnings ?? []).map(w => localizeTrainingText(w, locale)),
    ...(plan.safetyWarnings ? { safetyWarnings: plan.safetyWarnings.map(w => localizeTrainingText(w, locale)) } : {}),
  };
}

/** Kontext z health providera, který planner volitelně využije. */
export type PlanContext = {
  recentWorkouts?: WorkoutSummary[];
  recentSleep?: SleepSummary[];
  hrvLatest?: number;
  hrvBaseline?: number;
};

type PlannerProfile = Partial<UserProfile> & Pick<UserProfile, 'trainingGoal'>;

function toDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Pondělí týdne obsahujícího `date` jako YYYY-MM-DD (lokální TZ). */
export function mondayOf(date: Date): string {
  const d = new Date(date);
  const dow = d.getDay() || 7; // Ne=0 → 7
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - (dow - 1));
  return toDateKey(d);
}

/** weekIndex = počet celých tývnů od programStartISO do daného pondělí (>= 0). */
export function weekIndexFor(programStartISO: string | undefined, weekStartISO: string): number {
  if (!programStartISO) return 0;
  const startMonday = mondayOf(new Date(`${programStartISO}T12:00:00`));
  const a = new Date(`${startMonday}T12:00:00`).getTime();
  const b = new Date(`${weekStartISO}T12:00:00`).getTime();
  const weeks = Math.floor((b - a) / (7 * 24 * 3600 * 1000));
  return Math.max(0, weeks);
}

/** Vygeneruje týdenní plán pro týden obsahující `date`, na základě profilu. */
export function planForDate(profile: PlannerProfile, date: Date, ctx: PlanContext = {}, locale: string = 'en'): TrainingPlan {
  const weekStartISO = mondayOf(date);
  // "Můj týden" custom režim: materializuj uživatelskou šablonu místo generování plánu.
  if (hasCustomSchedule(profile)) {
    return materializeWeeklyTemplate(profile, weekStartISO, locale);
  }
  const goal: TrainingGoal = {
    kind: profile.trainingGoal,
    currentWeeklyKm: profile.currentWeeklyKm,
    longestRecentRunKm: profile.longestRecentRunKm,
    runsPerWeek: profile.runsPerWeek,
    experience: profile.experience,
    raceDateISO: profile.raceDateISO,
    targetTimeSeconds: profile.targetTimeSeconds,
    availableTrainingDays: profile.availableTrainingDays,
    preferredRestDays: profile.preferredRestDays,
    injuryFlag: profile.injuryFlag,
    runWalkPreferred: profile.runWalkPreferred,
    desiredWeightChangeKg: profile.goalProfile?.desiredWeightChangeKg,
    timelineWeeks: profile.goalProfile?.timelineWeeks,
    primaryGoal: profile.primaryGoal,
  };
  const generated = generateTrainingPlan({
    goal,
    weekStartISO,
    weekIndex: weekIndexFor(profile.programStartISO, weekStartISO),
    recentWorkouts: ctx.recentWorkouts,
    recentSleep: ctx.recentSleep,
    hrvLatest: ctx.hrvLatest,
    hrvBaseline: ctx.hrvBaseline,
  });
  return localizePlan(fitPlanToSessionsPerWeek(generated, profile.sessionsPerWeek), locale);
}

/** Kinds that are optional light extras, not one of the user's chosen sessions. */
const LIGHT_EXTRA_KINDS = new Set<TrainingSession['kind']>(['mobility', 'recovery', 'rest']);
const KEEP_PRIORITY: Partial<Record<TrainingSession['kind'], number>> = { long_run: 3, race: 3, match: 3 };
const INTENSITY_PRIORITY: Record<TrainingSession['intensity'], number> = { hard: 2, moderate: 1, easy: 0, rest: -1 };

/**
 * Templates are fixed weeks; trim them to the sessions/week the user picked so
 * "2x week" doesn't still schedule four workouts. The least important sessions
 * (key sessions like the long run last, then easiest first, then later in the
 * week first) become rest days. Light mobility days stay as optional extras.
 */
export function fitPlanToSessionsPerWeek(plan: TrainingPlan, sessionsPerWeek: number | undefined): TrainingPlan {
  if (!sessionsPerWeek || sessionsPerWeek < 1) return plan;
  const main = plan.sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => !LIGHT_EXTRA_KINDS.has(session.kind) && session.intensity !== 'rest');
  const excess = main.length - sessionsPerWeek;
  if (excess <= 0) return plan;
  const dropIndexes = new Set(
    [...main]
      .sort((a, b) =>
        (KEEP_PRIORITY[a.session.kind] ?? 0) - (KEEP_PRIORITY[b.session.kind] ?? 0)
        || INTENSITY_PRIORITY[a.session.intensity] - INTENSITY_PRIORITY[b.session.intensity]
        || b.index - a.index)
      .slice(0, excess)
      .map(({ index }) => index),
  );
  return {
    ...plan,
    sessions: plan.sessions.map((session, index) => (dropIndexes.has(index)
      ? { date: session.date, kind: 'rest', title: 'Volno', durationMinutes: 0, intensity: 'rest' }
      : session)),
  };
}

/** Drop-in náhrada za buildTrainingSessionForDate — jednotka pro konkrétní den. */
export function planSessionForDate(profile: PlannerProfile, date: Date, ctx: PlanContext = {}, locale: string = 'en'): TrainingSession {
  const plan = planForDate(profile, date, ctx, locale);
  const key = toDateKey(date);
  return (
    plan.sessions.find(s => s.date === key) ?? {
      date: key,
      kind: 'rest',
      title: localizeTrainingText('Volno', locale),
      durationMinutes: 0,
      intensity: 'rest',
    }
  );
}

export type AdjustedTrainingPlan = {
  plan: TrainingPlan;
  skippedDates: string[];
  adjustedDates: string[];
};

export function adjustPlanForTrainingCompletions(
  plan: TrainingPlan,
  completions: TrainingCompletionRecordMap,
  locale: string = 'en',
): AdjustedTrainingPlan {
  const originalByDate = new Map(plan.sessions.map(session => [session.date, session]));
  const skippedDates = plan.sessions
    .filter(session => session.kind !== 'rest' && session.durationMinutes > 0)
    .map(session => session.date)
    .filter(date => completions[date]?.status === 'skipped')
    .sort();

  if (!skippedDates.length) {
    return { plan: localizePlan(plan, locale), skippedDates: [], adjustedDates: [] };
  }

  const adjusted = skippedDates.reduce(
    (currentPlan, skippedDate) => adjustTrainingAfterMissedSession(currentPlan, skippedDate),
    plan,
  );

  const adjustedDates = adjusted.sessions
    .filter(session => !skippedDates.includes(session.date))
    .filter(session => {
      const original = originalByDate.get(session.date);
      if (!original) return false;
      return (
        original.kind !== session.kind ||
        original.title !== session.title ||
        original.durationMinutes !== session.durationMinutes ||
        original.intensity !== session.intensity ||
        original.distanceKm !== session.distanceKm
      );
    })
    .map(session => session.date);

  return { plan: localizePlan(adjusted, locale), skippedDates, adjustedDates };
}

export function adjustedPlanForDate(
  profile: PlannerProfile,
  date: Date,
  completions: TrainingCompletionRecordMap,
  ctx: PlanContext = {},
  locale: string = 'en',
): AdjustedTrainingPlan {
  const plan = planForDate(profile, date, ctx, locale);
  // Custom týden je uživatelův pevný rytmus — nepřeskupuj ho po vynechání tréninku.
  if (hasCustomSchedule(profile)) {
    return { plan, skippedDates: [], adjustedDates: [] };
  }
  return adjustPlanForTrainingCompletions(plan, completions, locale);
}

export function adjustedPlanSessionForDate(
  profile: PlannerProfile,
  date: Date,
  completions: TrainingCompletionRecordMap,
  ctx: PlanContext = {},
  locale: string = 'en',
): TrainingSession {
  const adjusted = adjustedPlanForDate(profile, date, completions, ctx, locale);
  const key = toDateKey(date);
  return (
    adjusted.plan.sessions.find(session => session.date === key) ?? {
      date: key,
      kind: 'rest',
      title: localizeTrainingText('Volno', locale),
      durationMinutes: 0,
      intensity: 'rest',
    }
  );
}
