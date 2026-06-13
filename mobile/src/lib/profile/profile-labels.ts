import type { NativeSourceState } from '../../hooks/useHealthSources';
import type { Translate } from '../i18n';
import type { TranslationKey } from '../i18n';
import type { ExperienceLevel, NutritionMode, TrainingGoalKind, UserProfile } from '../../types';
import { formatGoalProfileSummary } from '../onboarding/goal-summary-labels';

const TRAINING_GOAL_LABELS: Record<Exclude<TrainingGoalKind, 'none'>, TranslationKey> = {
  general_fitness: 'trainingGoal.general_fitness',
  walking_more: 'trainingGoal.walking_more',
  couch_to_5k: 'trainingGoal.couch_to_5k',
  run_5k: 'trainingGoal.run_5k',
  run_10k: 'trainingGoal.run_10k',
  half_marathon: 'trainingGoal.half_marathon',
  marathon: 'onb.tgMarathon',
  strength_basics: 'trainingGoal.strength_basics',
  basic_strength: 'trainingGoal.strength_basics',
  sports_conditioning: 'onb.tgSportsConditioning',
  sport_conditioning: 'onb.tgSportsConditioning',
  hyrox: 'trainingGoal.hyrox',
  sprint_triathlon: 'onb.tgSprintTri',
  olympic_triathlon: 'onb.tgOlympicTri',
  half_ironman: 'onb.tgHalfIron',
  full_ironman: 'onb.tgFullIron',
  ocr: 'onb.tgOcr',
  play_sport: 'onb.tgPlaySport',
};

export function getGoalLabel(profile: Pick<UserProfile, 'primaryGoal'>, t: Translate): string {
  return t(`goal.${profile.primaryGoal}` as TranslationKey);
}

export function getRaceGoalLabel(goal: TrainingGoalKind | undefined, t: Translate): string {
  if (!goal || goal === 'none') return t('profile.notSet');
  return t(TRAINING_GOAL_LABELS[goal]);
}

export function getProfileGoalSummary(
  profile: Pick<UserProfile, 'primaryGoal' | 'trainingGoal' | 'goalProfile'>,
  t: Translate,
): string {
  if (profile.goalProfile) return formatGoalProfileSummary(profile.goalProfile, t);
  const primary = getGoalLabel(profile, t);
  if (!profile.trainingGoal || profile.trainingGoal === 'none') return primary;
  return `${primary} + ${getRaceGoalLabel(profile.trainingGoal, t)}`;
}

export function getNutritionModeLabel(mode: NutritionMode | undefined, t: Translate): string {
  return mode ? t(`nutritionMode.${mode}` as TranslationKey) : t('profile.notSet');
}

export function getExperienceLabel(experience: ExperienceLevel | undefined, t: Translate): string {
  if (!experience) return t('profile.notSet');
  return t(`onb.exp${capitalizeExperience(experience)}` as TranslationKey);
}

export function getHealthProviderLabel(mode: UserProfile['healthProviderMode'] | undefined, t: Translate): string {
  switch (mode ?? 'auto') {
    case 'manual': return t('profile.healthManual');
    case 'mock': return t('profile.healthMock');
    case 'apple_health': return t('settings.nativeIos');
    case 'health_connect': return t('settings.nativeAndroid');
    case 'auto':
    default: return t('profile.healthData');
  }
}

export function getHealthProviderStatus(
  mode: UserProfile['healthProviderMode'] | undefined,
  native: Pick<NativeSourceState, 'available' | 'platform'>,
  connectedOAuthCount: number,
  t: Translate,
): string {
  if ((mode ?? 'auto') === 'manual') return t('profile.healthManualStatus');
  if (mode === 'mock') return t('profile.healthMockStatus');
  if (connectedOAuthCount > 0) return t('profile.healthOAuthStatus', { count: connectedOAuthCount });
  if (native.available) {
    return native.platform === 'ios'
      ? t('profile.healthAppleConnected')
      : native.platform === 'android'
        ? t('profile.healthConnectConnected')
        : t('profile.healthConnected');
  }
  return t('profile.healthUnavailableStatus');
}

export function summarizeLikesDislikes(
  likes: string | undefined,
  dislikes: string | undefined,
  t: Translate,
  maxLength = 64,
): string {
  const parts = [
    likes?.trim() ? t('profile.likesSummary', { value: trim(likes, maxLength) }) : '',
    dislikes?.trim() ? t('profile.dislikesSummary', { value: trim(dislikes, maxLength) }) : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : t('profile.noFoodPrefs');
}

export function formatProfileValue(value: string | number | null | undefined, t: Translate, unit = ''): string {
  if (value === null || value === undefined || value === '') return t('profile.notSet');
  return `${value}${unit}`;
}

function trim(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…` : normalized;
}

function capitalizeExperience(experience: ExperienceLevel): 'Beginner' | 'Intermediate' | 'Advanced' {
  if (experience === 'advanced') return 'Advanced';
  if (experience === 'intermediate') return 'Intermediate';
  return 'Beginner';
}
