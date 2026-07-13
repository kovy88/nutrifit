import type { NutritionMode, TrainingGoalKind } from '../../types';
import type { TranslationKey } from '../i18n';

export const PROFILE_TRAINING_GOALS: Array<{ value: TrainingGoalKind; labelKey: TranslationKey }> = [
  { value: 'general_fitness', labelKey: 'trainingGoal.general_fitness' },
  { value: 'walking_more', labelKey: 'trainingGoal.walking_more' },
  { value: 'couch_to_5k', labelKey: 'trainingGoal.couch_to_5k' },
  { value: 'run_5k', labelKey: 'trainingGoal.run_5k' },
  { value: 'run_10k', labelKey: 'trainingGoal.run_10k' },
  { value: 'half_marathon', labelKey: 'trainingGoal.half_marathon' },
  { value: 'strength_basics', labelKey: 'trainingGoal.strength_basics' },
];

export const PROFILE_NUTRITION_MODES: Array<{ value: NutritionMode; labelKey: TranslationKey }> = [
  { value: 'balanced', labelKey: 'nutritionMode.balanced' },
  { value: 'fat_loss_friendly', labelKey: 'nutritionMode.fat_loss_friendly' },
  { value: 'muscle_gain_friendly', labelKey: 'nutritionMode.muscle_gain_friendly' },
  { value: 'simple_meal_prep', labelKey: 'nutritionMode.simple_meal_prep' },
];
