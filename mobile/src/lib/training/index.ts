// ── TRAINING MODULE PUBLIC API
//
// Progresivní tréninkový planner (port z js/domain/training.js) + adaptér,
// který nahrazuje statický `buildTrainingSessionForDate` z utils/nutrition.ts.
// Generuje TÝDENNÍ plán a vrátí jednotku pro konkrétní den.

import type { TrainingSession, UserProfile } from '../../types';
import type { TrainingCompletionRecordMap } from '../../types';
import type { SleepSummary, WorkoutSummary } from '../../types/health';
import { adjustTrainingAfterMissedSession, generateTrainingPlan, type TrainingGoal, type TrainingPlan } from './plan';

export * from './plan';
export * from './feasibility';

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
export function planForDate(profile: PlannerProfile, date: Date, ctx: PlanContext = {}): TrainingPlan {
  const weekStartISO = mondayOf(date);
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
  return generateTrainingPlan({
    goal,
    weekStartISO,
    weekIndex: weekIndexFor(profile.programStartISO, weekStartISO),
    recentWorkouts: ctx.recentWorkouts,
    recentSleep: ctx.recentSleep,
    hrvLatest: ctx.hrvLatest,
    hrvBaseline: ctx.hrvBaseline,
  });
}

/** Drop-in náhrada za buildTrainingSessionForDate — jednotka pro konkrétní den. */
export function planSessionForDate(profile: PlannerProfile, date: Date, ctx: PlanContext = {}): TrainingSession {
  const plan = planForDate(profile, date, ctx);
  const key = toDateKey(date);
  return (
    plan.sessions.find(s => s.date === key) ?? {
      date: key,
      kind: 'rest',
      title: 'Volno',
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
): AdjustedTrainingPlan {
  const originalByDate = new Map(plan.sessions.map(session => [session.date, session]));
  const skippedDates = plan.sessions
    .filter(session => session.kind !== 'rest' && session.durationMinutes > 0)
    .map(session => session.date)
    .filter(date => completions[date]?.status === 'skipped')
    .sort();

  if (!skippedDates.length) {
    return { plan, skippedDates: [], adjustedDates: [] };
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

  return { plan: adjusted, skippedDates, adjustedDates };
}

export function adjustedPlanForDate(
  profile: PlannerProfile,
  date: Date,
  completions: TrainingCompletionRecordMap,
  ctx: PlanContext = {},
): AdjustedTrainingPlan {
  return adjustPlanForTrainingCompletions(planForDate(profile, date, ctx), completions);
}

export function adjustedPlanSessionForDate(
  profile: PlannerProfile,
  date: Date,
  completions: TrainingCompletionRecordMap,
  ctx: PlanContext = {},
): TrainingSession {
  const adjusted = adjustedPlanForDate(profile, date, completions, ctx);
  const key = toDateKey(date);
  return (
    adjusted.plan.sessions.find(session => session.date === key) ?? {
      date: key,
      kind: 'rest',
      title: 'Volno',
      durationMinutes: 0,
      intensity: 'rest',
    }
  );
}
