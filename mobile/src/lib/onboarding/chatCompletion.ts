import { isRunRaceGoal } from '../../constants/goals';
import type { UserProfile } from '../../types';
import { resolveCoachScope, scopeHasNutrition, scopeHasTraining } from '../../types';
import { activityFactorForSessions, DEFAULT_PROFILE, validateProfile } from '../../utils/nutrition';
import type { TouchedOnboardingFields } from './validation';

export type ChatOnboardingMissingField =
  | 'coachScope'
  | 'goal'
  | 'sessionsPerWeek'
  | 'experience'
  | 'raceDateISO'
  | 'gender'
  | 'age'
  | 'height'
  | 'weight';

export type ChatOnboardingCompletion = {
  complete: boolean;
  missing: ChatOnboardingMissingField[];
  errors: string[];
  profile: UserProfile;
};

export function prepareChatOnboardingProfile(draft: UserProfile): UserProfile {
  const scope = resolveCoachScope(draft);
  const sessionsPerWeek = clampInt(draft.sessionsPerWeek || DEFAULT_PROFILE.sessionsPerWeek, 1, 7);
  const profile: UserProfile = {
    ...DEFAULT_PROFILE,
    ...draft,
    sessionsPerWeek,
    activityFactor: activityFactorForSessions(sessionsPerWeek),
  };

  if (!scopeHasNutrition(scope)) {
    profile.gender = DEFAULT_PROFILE.gender;
    profile.age = DEFAULT_PROFILE.age;
    profile.height = DEFAULT_PROFILE.height;
    profile.weight = DEFAULT_PROFILE.weight;
  }

  return profile;
}

export function chatOnboardingMissingFields(
  draft: UserProfile,
  touched: TouchedOnboardingFields = {},
): ChatOnboardingMissingField[] {
  const scope = resolveCoachScope(draft);
  const missing: ChatOnboardingMissingField[] = [];

  if (!touched.coachScope) missing.push('coachScope');
  if (!touched.goalProfile && !touched.primaryGoal && !touched.trainingGoal) missing.push('goal');

  if (scopeHasTraining(scope)) {
    if (!touched.sessionsPerWeek || draft.sessionsPerWeek < 1 || draft.sessionsPerWeek > 7) {
      missing.push('sessionsPerWeek');
    }
    if (!touched.experience) missing.push('experience');
    if (isRunRaceGoal(draft.trainingGoal) && !isFutureISODate(draft.raceDateISO)) {
      missing.push('raceDateISO');
    }
  }

  if (scopeHasNutrition(scope)) {
    if (!touched.gender) missing.push('gender');
    if (!touched.age || draft.age < 16 || draft.age > 100) missing.push('age');
    if (!touched.height || draft.height < 100 || draft.height > 250) missing.push('height');
    if (!touched.weight || draft.weight < 30 || draft.weight > 300) missing.push('weight');
  }

  return missing;
}

export function canCompleteChatOnboarding(
  draft: UserProfile,
  touched: TouchedOnboardingFields = {},
): ChatOnboardingCompletion {
  const profile = prepareChatOnboardingProfile(draft);
  const missing = chatOnboardingMissingFields(profile, touched);
  const errors = missing.length ? [] : validateProfile(profile);
  return {
    complete: missing.length === 0 && errors.length === 0,
    missing,
    errors,
    profile,
  };
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(Number(value));
  if (!Number.isFinite(rounded)) return min;
  return Math.max(min, Math.min(max, rounded));
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
