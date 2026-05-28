// ── TRAINING PLAN SERVICE
//
// Orchestrace nad [[training]] doménou + propojení s health providerem.

import { generateTrainingPlan } from '../domain/training.js';

/** @typedef {import('../domain/types.js').TrainingGoal} TrainingGoal */
/** @typedef {import('../domain/types.js').TrainingPlan} TrainingPlan */
/** @typedef {import('./health-provider.js').HealthDataProvider} HealthDataProvider */

export class TrainingPlanService {
  /**
   * @param {TrainingGoal} goal
   * @param {HealthDataProvider} healthProvider
   */
  constructor(goal, healthProvider) {
    this.goal = goal;
    this.health = healthProvider;
  }

  /**
   * @param {{ weekStartISO:string, weekIndex?:number }} opts
   * @returns {Promise<TrainingPlan>}
   */
  async generate({ weekStartISO, weekIndex = 0 }) {
    const lookbackStart = addDaysISO(weekStartISO, -14);
    const lookbackEnd = addDaysISO(weekStartISO, -1);
    const [workouts, sleep, hr] = await Promise.all([
      this.health.getWorkoutSummaries(lookbackStart, lookbackEnd),
      this.health.getSleepSummary(lookbackStart, lookbackEnd),
      this.health.getHeartRateMetrics(addDaysISO(weekStartISO, -28), lookbackEnd),
    ]);
    const hrv = hr.filter(m => m.kind === 'hrv').map(m => m.value);
    const hrvLatest = hrv.length ? hrv[hrv.length - 1] : undefined;
    const hrvBaseline = hrv.length >= 7
      ? Math.round(hrv.slice(0, Math.max(1, hrv.length - 7)).reduce((s, v) => s + v, 0) / Math.max(1, hrv.length - 7))
      : undefined;
    return generateTrainingPlan({
      goal: this.goal,
      weekStartISO,
      weekIndex,
      recentWorkouts: workouts,
      recentSleep: sleep,
      hrvLatest,
      hrvBaseline,
    });
  }
}

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
