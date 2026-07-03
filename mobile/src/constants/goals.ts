import type { PrimaryGoal, TrainingGoalKind } from '../types';
import type { TranslationKey } from '../lib/i18n';

export type PrimaryGoalOption = {
  value: PrimaryGoal;
  labelKey: TranslationKey;
  subtitleKey: TranslationKey;
  trainingGoal: TrainingGoalKind;
};

export const USER_PRIMARY_GOALS: PrimaryGoalOption[] = [
  {
    value: 'lose_fat',
    labelKey: 'onb.goalLoseFat',
    subtitleKey: 'onb.goalLoseFatSub',
    trainingGoal: 'general_fitness',
  },
  {
    value: 'gain_muscle',
    labelKey: 'onb.goalGainMuscle',
    subtitleKey: 'onb.goalGainMuscleSub',
    trainingGoal: 'strength_basics',
  },
  {
    value: 'improve_fitness',
    labelKey: 'goal.improve_fitness',
    subtitleKey: 'onb.goalImproveFitnessSub',
    trainingGoal: 'general_fitness',
  },
  {
    value: 'improve_running',
    labelKey: 'goal.improve_running',
    subtitleKey: 'onb.goalImproveRunningSub',
    trainingGoal: 'couch_to_5k',
  },
  {
    value: 'build_consistency',
    labelKey: 'goal.build_consistency',
    subtitleKey: 'onb.goalBuildConsistencySub',
    trainingGoal: 'general_fitness',
  },
];

export const NUTRITION_PRIMARY_GOALS: Pick<PrimaryGoalOption, 'value' | 'labelKey' | 'subtitleKey'>[] = [
  {
    value: 'lose_fat',
    labelKey: 'onb.goalLoseFat',
    subtitleKey: 'onb.goalLoseFatSub',
  },
  {
    value: 'maintain_weight',
    labelKey: 'onb.goalMaintainWeight',
    subtitleKey: 'onb.goalMaintainWeightSub',
  },
  {
    value: 'gain_muscle',
    labelKey: 'onb.goalGainMuscle',
    subtitleKey: 'onb.goalGainMuscleSub',
  },
];

export type TrainingGoalOption = {
  value: TrainingGoalKind;
  labelKey: TranslationKey;
};

export function trainingGoalsFor(primaryGoal: PrimaryGoal): TrainingGoalOption[] {
  if (primaryGoal === 'improve_running') return [
    { value: 'couch_to_5k', labelKey: 'onb.tgCouch' },
    { value: 'run_5k', labelKey: 'onb.tgRun5k' },
    { value: 'run_10k', labelKey: 'onb.tgRun10k' },
    { value: 'half_marathon', labelKey: 'onb.tgHalf' },
    { value: 'marathon', labelKey: 'onb.tgMarathon' },
  ];
  if (primaryGoal === 'gain_muscle') return [
    { value: 'strength_basics', labelKey: 'onb.tgStrengthBasics' },
    { value: 'general_fitness', labelKey: 'onb.tgGeneralFitnessAlt' },
  ];
  if (primaryGoal === 'improve_fitness') return [
    { value: 'play_sport', labelKey: 'onb.tgPlaySport' },
    { value: 'sports_conditioning', labelKey: 'onb.tgSportsConditioning' },
    { value: 'hyrox', labelKey: 'onb.tgHyrox' },
    { value: 'sprint_triathlon', labelKey: 'onb.tgSprintTri' },
    { value: 'general_fitness', labelKey: 'onb.tgGeneralFitness' },
  ];
  return [
    { value: 'play_sport', labelKey: 'onb.tgPlaySport' },
    { value: 'walking_more', labelKey: 'onb.tgWalking' },
    { value: 'couch_to_5k', labelKey: 'onb.tgCouch' },
    { value: 'general_fitness', labelKey: 'onb.tgGeneralFitness' },
    { value: 'sports_conditioning', labelKey: 'onb.tgSportsConditioning' },
  ];
}

export const RUNNING_GOALS: TrainingGoalKind[] = [
  'couch_to_5k',
  'run_5k',
  'run_10k',
  'half_marathon',
  'marathon',
  'hyrox',
  'ocr',
  'sprint_triathlon',
  'olympic_triathlon',
  'half_ironman',
  'full_ironman',
];

export function isRunningGoal(goal: TrainingGoalKind): boolean {
  return RUNNING_GOALS.includes(goal);
}

export function isRunRaceGoal(goal: TrainingGoalKind): boolean {
  return ['run_5k', 'run_10k', 'half_marathon', 'marathon'].includes(goal);
}
