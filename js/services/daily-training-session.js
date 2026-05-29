// ── DAILY TRAINING SESSION ADAPTER
//
// Překládá wizard goal nebo ruční denní plánovač na TrainingSession pro
// konkrétní datum. Bez DOM přístupů, aby šel použít v UI i testech.

import { generateTrainingPlan } from '../domain/training.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const TYPE_META = {
  rest:       { kind: 'rest',           title: 'Volno', intensity: 'rest' },
  gym:        { kind: 'strength',       title: 'Silový trénink', intensity: 'moderate' },
  cardio:     { kind: 'easy_run',       title: 'Běh / kardio', intensity: 'moderate' },
  hiit:       { kind: 'intervals',      title: 'HIIT trénink', intensity: 'hard' },
  functional: { kind: 'functional',     title: 'Funkční trénink', intensity: 'hard' },
  boxing:     { kind: 'cross_training', title: 'Box / bojový sport', intensity: 'hard' },
  triathlon:  { kind: 'brick',          title: 'Triatlonový trénink', intensity: 'moderate' },
  bike:       { kind: 'bike',           title: 'Cyklistika', intensity: 'moderate' },
  sport:      { kind: 'cross_training', title: 'Sportovní trénink', intensity: 'moderate' },
  yoga:       { kind: 'mobility',       title: 'Jóga / mobilita', intensity: 'easy' },
  walk:       { kind: 'recovery_run',   title: 'Chůze / turistika', intensity: 'easy' },
  swim:       { kind: 'swim',           title: 'Plavání', intensity: 'moderate' },
  work:       { kind: 'cross_training', title: 'Fyzická práce', intensity: 'moderate' },
};

/**
 * @param {string} selectedDate YYYY-MM-DD
 * @param {{ trainingGoal?:string, sessionsPerWeek?:number, experience?:string }|null} wizardGoal
 * @param {{ used?:boolean, activities?:Array<{ type:string, durationMinutes?:number, isRest?:boolean }> }} [dayPlannerState]
 * @returns {import('../domain/types.js').TrainingSession|null}
 */
export function buildTrainingSessionForDate(selectedDate, wizardGoal, dayPlannerState = {}) {
  if (!selectedDate) return null;
  const weekStartISO = startOfWeekISO(selectedDate);
  const dayIndex = daysBetween(weekStartISO, selectedDate);

  if (dayPlannerState.used && Array.isArray(dayPlannerState.activities) && dayPlannerState.activities[dayIndex]) {
    return manualActivityToSession(selectedDate, dayPlannerState.activities[dayIndex]);
  }

  if (!wizardGoal?.trainingGoal) return null;
  const plan = generateTrainingPlan({
    goal: {
      kind: wizardGoal.trainingGoal,
      sessionsPerWeek: Number(wizardGoal.sessionsPerWeek || 0) || undefined,
    },
    weekStartISO,
    weekIndex: 0,
    recentWorkouts: [],
    recentSleep: [],
  });
  return plan.sessions.find(session => session.date === selectedDate) || null;
}

export function startOfWeekISO(dateISO) {
  const date = new Date(`${dateISO}T12:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startISO, endISO) {
  const start = new Date(`${startISO}T12:00:00`);
  const end = new Date(`${endISO}T12:00:00`);
  return Math.round((end - start) / DAY_MS);
}

function manualActivityToSession(date, activity) {
  const type = activity?.isRest ? 'rest' : (activity?.type || 'rest');
  const durationMinutes = Number(activity?.durationMinutes || 0);
  const meta = TYPE_META[type] || TYPE_META.cardio;
  const kind = type === 'cardio' && durationMinutes >= 90 ? 'long_run' : meta.kind;
  const title = kind === 'long_run' ? 'Dlouhý běh / kardio' : meta.title;
  return {
    date,
    kind,
    title,
    durationMinutes: kind === 'rest' ? 0 : (durationMinutes || 45),
    intensity: kind === 'rest' ? 'rest' : meta.intensity,
  };
}
