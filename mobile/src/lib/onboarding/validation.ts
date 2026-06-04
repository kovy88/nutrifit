import type {
  CoachScope,
  NutritionMode,
  PlanIntensity,
  UserProfile,
} from '../../types';
import { scopeHasNutrition, scopeHasTraining } from '../../types';
import type { TranslationKey, TranslateParams } from '../i18n';
import { isRunningGoal, isRunRaceGoal } from '../../constants/goals';
import type { RaceFeasibilityVerdict } from '../training/feasibility';
import type { GoalProfile } from '../../types/goal-types';
import { hasRequiredGoalFollowUps } from './follow-up-question-generator';

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
    'goalProfile' |
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

export type SetupMissingItem = 'foodPreferences' | 'raceDetails' | 'restDays';

export type ProfileSetupCompleteness = {
  complete: boolean;
  missing: SetupMissingItem[];
};

export function buildOnboardingSteps(
  scope: CoachScope,
  trainingGoal: UserProfile['trainingGoal'],
  primaryGoal?: UserProfile['primaryGoal'],
  goalProfile?: GoalProfile | null,
): StepId[] {
  if (scope === 'nutrition') {
    return ['focus', 'goal', 'body', 'nutritionMode', 'planIntensity', 'diet'];
  }
  const running = isRunningGoal(trainingGoal);
  const race = isRunRaceGoal(trainingGoal);
  const goalAlreadyChoseTraining = Boolean(goalProfile);
  const shouldChooseTrainingGoal = !goalAlreadyChoseTraining && (primaryGoal === 'improve_running' || primaryGoal === 'improve_fitness' || primaryGoal === 'gain_muscle');
  const hasDays = Boolean(goalProfile?.availableTrainingDays);
  const hasExperience = Boolean(goalProfile?.experienceLevel);
  const hasWeeklyKm = Boolean(goalProfile?.currentWeeklyKm);
  const hasLongestRun = Boolean(goalProfile?.longestRecentRunKm);
  const hasRaceDate = Boolean(goalProfile?.raceDateISO && /^\d{4}-\d{2}-\d{2}$/.test(goalProfile.raceDateISO));
  const training: StepId[] = [
    'focus',
    'goal',
    ...(shouldChooseTrainingGoal ? ['trainingGoal' as StepId] : []),
    ...(!hasDays ? ['sessions' as StepId] : []),
    ...(!hasExperience ? ['experience' as StepId] : []),
    ...(running ? [
      ...(!hasWeeklyKm ? ['weeklyKm' as StepId] : []),
      ...(!hasLongestRun ? ['longestRun' as StepId] : []),
      'runFrequency' as StepId,
      'runLimits' as StepId,
    ] : []),
    ...(race ? [
      ...(!hasRaceDate ? ['raceDate' as StepId] : []),
      ...(!hasDays ? ['raceSchedule' as StepId] : []),
      'raceFeasibility' as StepId,
    ] : []),
  ];
  if (scope === 'training') return training;
  return [...training, 'body', 'nutritionMode', 'planIntensity', 'diet'];
}

export function isAutoAdvanceStep(step: StepId): boolean {
  return [
    'focus',
    'nutritionGoal',
    'trainingGoal',
    'sessions',
    'experience',
    'nutritionMode',
    'planIntensity',
    'diet',
  ].includes(step);
}

export function isStepTouched(step: StepId, touched: TouchedOnboardingFields): boolean {
  switch (step) {
    case 'focus':         return Boolean(touched.coachScope);
    case 'goal':          return Boolean(touched.goalProfile);
    case 'nutritionGoal': return Boolean(touched.primaryGoal);
    case 'trainingGoal':  return Boolean(touched.trainingGoal);
    case 'sessions':      return Boolean(touched.sessionsPerWeek);
    case 'experience':    return Boolean(touched.experience);
    case 'weeklyKm':      return Boolean(touched.currentWeeklyKm);
    case 'longestRun':    return Boolean(touched.longestRecentRunKm);
    case 'runFrequency':  return Boolean(touched.runsPerWeek);
    case 'runLimits':     return Boolean(touched.injuryFlag || touched.runWalkPreferred);
    case 'raceDate':      return Boolean(touched.raceDateISO);
    case 'raceTarget':    return Boolean(touched.targetTimeSeconds || touched.currentPaceSecPerKm);
    case 'raceSchedule':  return Boolean(touched.availableTrainingDays || touched.preferredRestDays);
    case 'raceFeasibility': return true;
    case 'body':          return Boolean(touched.gender || touched.age || touched.height || touched.weight);
    case 'nutritionMode': return Boolean(touched.nutritionMode);
    case 'planIntensity': return Boolean(touched.planIntensity);
    case 'diet':          return Boolean(touched.diet);
  }
}

export function profileSetupCompleteness(profile: UserProfile): ProfileSetupCompleteness {
  const missing: SetupMissingItem[] = [];
  const scope = profile.coachScope ?? 'both';
  if (scopeHasNutrition(scope) && !profile.likes.trim() && !profile.dislikes.trim()) {
    missing.push('foodPreferences');
  }
  if (scopeHasTraining(scope) && isRunRaceGoal(profile.trainingGoal) && (!profile.targetTimeSeconds || !profile.currentPaceSecPerKm)) {
    missing.push('raceDetails');
  }
  if (scopeHasTraining(scope) && !(profile.preferredRestDays ?? []).length) {
    missing.push('restDays');
  }
  return { complete: missing.length === 0, missing };
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
      return touched.goalProfile && draft.goalProfile && hasRequiredGoalFollowUps(draft.goalProfile)
        ? ok('onb.help.goal')
        : missing('onb.required.goal');
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
