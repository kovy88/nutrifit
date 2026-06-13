import type { Translate, TranslationKey } from '../i18n';
import type { GoalProfile, PrimaryGoal, RaceGoal } from '../../types/goal-types';

const PRIMARY_GOAL_LABELS: Record<PrimaryGoal, TranslationKey> = {
  lose_fat: 'goal.lose_fat',
  build_muscle: 'onb.quickBuildMuscle',
  run_race: 'goal.improve_running',
  improve_fitness: 'goal.improve_fitness',
  eat_healthier: 'onb.quickEatHealthier',
  recover_better: 'goal.improve_recovery',
  build_consistency: 'goal.build_consistency',
};

const RACE_GOAL_LABELS: Record<Exclude<RaceGoal, 'none'>, TranslationKey> = {
  run_5k: 'trainingGoal.run_5k',
  run_10k: 'trainingGoal.run_10k',
  half_marathon: 'trainingGoal.half_marathon',
  marathon: 'onb.tgMarathon',
};

export function formatGoalProfileSummary(goal: GoalProfile, t: Translate): string {
  const raceLabel = formatRaceGoalLabel(goal.raceGoal, t);
  const primaryLabel = goal.primaryGoal === 'run_race' && raceLabel
    ? null
    : t(PRIMARY_GOAL_LABELS[goal.primaryGoal]);
  const parts = [primaryLabel, raceLabel].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(' + ') : goal.summary;
}

function formatRaceGoalLabel(raceGoal: RaceGoal, t: Translate): string | null {
  if (raceGoal === 'none') return null;
  return t(RACE_GOAL_LABELS[raceGoal]);
}
