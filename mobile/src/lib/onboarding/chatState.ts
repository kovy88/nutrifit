import type { UserProfile } from '../../types';
import type { OnboardingCoachReplyParsed } from '../ai/schemas';
import type { OnboardingField, TouchedOnboardingFields } from './validation';

export type OnboardingChatMessage = {
  id: string;
  role: 'user' | 'coach';
  text: string;
  createdAt: string;
};

export type OnboardingChatState = {
  draft: UserProfile;
  touchedFields: TouchedOnboardingFields;
  messages: OnboardingChatMessage[];
  missingFields: string[];
  confidence: 'low' | 'medium' | 'high';
};

export type OnboardingChatEvent =
  | { type: 'user_message'; text: string; createdAt?: string }
  | { type: 'coach_reply'; reply: OnboardingCoachReplyParsed; createdAt?: string }
  | { type: 'manual_patch'; patch: Partial<UserProfile>; touched: OnboardingField[] };

export function reduceOnboardingChatState(
  state: OnboardingChatState,
  event: OnboardingChatEvent,
): OnboardingChatState {
  if (event.type === 'user_message') {
    return {
      ...state,
      messages: [
        ...state.messages,
        message('user', event.text, event.createdAt),
      ],
    };
  }

  if (event.type === 'manual_patch') {
    return {
      ...state,
      draft: { ...state.draft, ...event.patch },
      touchedFields: touchFields(state.touchedFields, event.touched),
    };
  }

  const extracted = sanitizeExtracted(event.reply.extracted);
  return {
    ...state,
    draft: { ...state.draft, ...extracted },
    touchedFields: touchFields(state.touchedFields, Object.keys(extracted) as OnboardingField[]),
    missingFields: event.reply.missingFields,
    confidence: event.reply.confidence,
    messages: [
      ...state.messages,
      message('coach', event.reply.reply, event.createdAt),
    ],
  };
}

function message(role: OnboardingChatMessage['role'], text: string, createdAt = new Date().toISOString()): OnboardingChatMessage {
  return {
    id: `${role}-${createdAt}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    createdAt,
  };
}

function touchFields(current: TouchedOnboardingFields, fields: OnboardingField[]): TouchedOnboardingFields {
  return fields.reduce<TouchedOnboardingFields>((next, field) => {
    next[field] = true;
    return next;
  }, { ...current });
}

function sanitizeExtracted(extracted: OnboardingCoachReplyParsed['extracted']): Partial<UserProfile> {
  const next: Partial<UserProfile> = { ...extracted };
  if (next.sessionsPerWeek != null) next.sessionsPerWeek = clampInt(next.sessionsPerWeek, 1, 7);
  if (next.runsPerWeek != null) next.runsPerWeek = clampInt(next.runsPerWeek, 0, 7);
  if (next.availableTrainingDays != null) next.availableTrainingDays = clampInt(next.availableTrainingDays, 1, 7);
  if (next.preferredRestDays) next.preferredRestDays = Array.from(new Set(next.preferredRestDays.map(day => clampInt(day, 0, 6)))).sort((a, b) => a - b);
  if (next.currentWeeklyKm != null) next.currentWeeklyKm = clampNumber(next.currentWeeklyKm, 0, 250);
  if (next.longestRecentRunKm != null) next.longestRecentRunKm = clampNumber(next.longestRecentRunKm, 0, 100);
  if (next.age != null) next.age = clampInt(next.age, 0, 120);
  if (next.height != null) next.height = clampInt(next.height, 0, 260);
  if (next.weight != null) next.weight = clampNumber(next.weight, 0, 350);
  return next;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
