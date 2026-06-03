import type {
  CoachScope,
  NutritionMode,
  PlanIntensity,
  UserProfile,
} from '../../types';
import { scopeHasNutrition } from '../../types';
import type { TranslationKey, TranslateParams } from '../i18n';
import { isRunningGoal, isRunRaceGoal } from '../../constants/goals';
import type { RaceFeasibilityVerdict } from '../training/feasibility';

export type StepId =
  | 'focus' | 'goal' | 'trainingGoal' | 'nutritionGoal'
  | 'sessions' | 'experience' | 'weeklyKm' | 'longestRun' | 'runFrequency' | 'runLimits'
  | 'raceDate' | 'raceTarget' | 'raceSchedule' | 'raceFeasibility'
  | 'body' | 'nutritionMode' | 'planIntensity' | 'diet';

export type OnboardingField =
  | keyof Pick<UserProfile,
    'coachScope' |
    'primaryGoal' |
    'trainingGoal' |
    'sessionsPerWeek' |
    'experience' |
    'currentWeeklyKm' |
    'longestRecentRunKm' |
    'runsPerWeek' |
    'injuryFlag' |
    'runWalkPreferred' |
    'raceDateISO' |
    'targetTimeSeconds' |
    'currentPaceSecPerKm' |
    'availableTrainingDays' |
    'preferredRestDays' |
    'gender' |
    'age' |
    'height' |
    'weight' |
    'diet' |
    'nutritionMode' |
    'planIntensity'
  >;

export type TouchedOnboardingFields = Partial<Record<OnboardingField, boolean>>;

export type StepValidation = {
  valid: boolean;
  messageKey: TranslationKey;
  params?: TranslateParams;
};

export function buildOnboardingSteps(scope: CoachScope, trainingGoal: UserProfile['trainingGoal']): StepId[] {
  if (scope === 'nutrition') {
    return ['focus', 'nutritionGoal', 'body', 'nutritionMode', 'planIntensity', 'diet'];
  }
  const running = isRunningGoal(trainingGoal);
  const race = isRunRaceGoal(trainingGoal);
  const training: StepId[] = [
    'focus',
    'goal',
    'trainingGoal',
    'sessions',
    'experience',
    ...(running ? ['weeklyKm' as StepId, 'longestRun' as StepId, 'runFrequency' as StepId, 'runLimits' as StepId] : []),
    ...(race ? ['raceDate' as StepId, 'raceTarget' as StepId, 'raceSchedule' as StepId, 'raceFeasibility' as StepId] : []),
  ];
  if (scope === 'training') return training;
  return [...training, 'body', 'nutritionMode', 'planIntensity', 'diet'];
}

export function validateOnboardingStep(
  step: StepId,
  draft: UserProfile,
  scope: CoachScope,
  touched: TouchedOnboardingFields = {},
  feasibilityVerdict?: RaceFeasibilityVerdict | null,
): StepValidation {
  switch (step) {
    case 'focus':
      return touched.coachScope ? ok('onb.help.focus') : missing('onb.required.focus');
    case 'goal':
    case 'nutritionGoal':
      return touched.primaryGoal ? ok(helpKeyFor(step)) : missing('onb.required.goal');
    case 'trainingGoal':
      return touched.trainingGoal ? ok('onb.help.trainingGoal') : missing('onb.required.trainingGoal');
    case 'sessions':
      return touched.sessionsPerWeek && draft.sessionsPerWeek >= 1 ? ok('onb.help.sessions') : missing('onb.required.sessions');
    case 'experience':
      return touched.experience ? ok('onb.help.experience') : missing('onb.required.experience');
    case 'weeklyKm':
      return numberInRange(touched.currentWeeklyKm, draft.currentWeeklyKm, 1, 250, 'onb.help.weeklyKm', 'onb.required.weeklyKm');
    case 'longestRun':
      return numberInRange(touched.longestRecentRunKm, draft.longestRecentRunKm, 1, 100, 'onb.help.longestRun', 'onb.required.longestRun');
    case 'runFrequency':
      return numberInRange(touched.runsPerWeek, draft.runsPerWeek, 1, 7, 'onb.help.runFrequency', 'onb.required.runFrequency');
    case 'runLimits':
      if (!touched.injuryFlag) return missing('onb.required.injuryFlag');
      if (!touched.runWalkPreferred) return missing('onb.required.runWalkPreferred');
      return ok('onb.help.runLimits');
    case 'raceDate':
      return touched.raceDateISO && isFutureISODate(draft.raceDateISO) ? ok('onb.help.raceDate') : missing('onb.required.raceDate');
    case 'raceTarget':
      return ok('onb.help.raceTarget');
    case 'raceSchedule':
      return touched.availableTrainingDays && (draft.availableTrainingDays ?? 0) >= 2
        ? ok('onb.help.raceSchedule')
        : missing('onb.required.availableDays');
    case 'raceFeasibility':
      if (feasibilityVerdict === 'unrealistic') return missing('onb.required.feasibility');
      return ok('onb.help.raceFeasibility');
    case 'body':
      if (!scopeHasNutrition(scope)) return ok('onb.help.body');
      if (!touched.gender) return missing('onb.required.gender');
      if (!touched.age || draft.age < 16 || draft.age > 100) return missing('onb.required.age');
      if (!touched.height || draft.height < 100 || draft.height > 250) return missing('onb.required.height');
      if (!touched.weight || draft.weight < 30 || draft.weight > 300) return missing('onb.required.weight');
      return ok('onb.help.body');
    case 'nutritionMode':
      return touched.nutritionMode && isNutritionMode(draft.nutritionMode)
        ? ok('onb.help.nutritionMode')
        : missing('onb.required.nutritionMode');
    case 'planIntensity':
      return touched.planIntensity && isPlanIntensity(draft.planIntensity)
        ? ok('onb.help.planIntensity')
        : missing('onb.required.planIntensity');
    case 'diet':
      return touched.diet ? ok('onb.help.diet') : missing('onb.required.diet');
  }
}

function ok(messageKey: TranslationKey): StepValidation {
  return { valid: true, messageKey };
}

function missing(messageKey: TranslationKey): StepValidation {
  return { valid: false, messageKey };
}

function helpKeyFor(step: StepId): TranslationKey {
  return step === 'nutritionGoal' ? 'onb.help.nutritionGoal' : 'onb.help.goal';
}

function numberInRange(
  touched: boolean | undefined,
  value: number | undefined,
  min: number,
  max: number,
  helpKey: TranslationKey,
  requiredKey: TranslationKey,
): StepValidation {
  return touched && typeof value === 'number' && value >= min && value <= max ? ok(helpKey) : missing(requiredKey);
}

function isFutureISODate(value?: string): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  return date.getTime() >= todayUTC.getTime();
}

function isNutritionMode(value: UserProfile['nutritionMode']): value is NutritionMode {
  return Boolean(value);
}

function isPlanIntensity(value: UserProfile['planIntensity']): value is PlanIntensity {
  return Boolean(value);
}
