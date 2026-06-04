import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../utils/nutrition';
import { reduceOnboardingChatState, type OnboardingChatState } from '../lib/onboarding/chatState';

function initial(): OnboardingChatState {
  return {
    draft: DEFAULT_PROFILE,
    touchedFields: {},
    messages: [],
    missingFields: [],
    confidence: 'low',
  };
}

describe('onboarding chat state', () => {
  it('merges extracted AI fields into the profile draft and marks them touched', () => {
    const next = reduceOnboardingChatState(initial(), {
      type: 'coach_reply',
      createdAt: '2026-06-03T10:00:00.000Z',
      reply: {
        reply: 'Great, I have your running goal.',
        extracted: {
          coachScope: 'both',
          primaryGoal: 'improve_running',
          trainingGoal: 'run_10k',
          sessionsPerWeek: 4,
          currentWeeklyKm: 18,
        },
        confidence: 'high',
        missingFields: ['raceDateISO'],
      },
    });

    expect(next.draft.primaryGoal).toBe('improve_running');
    expect(next.draft.trainingGoal).toBe('run_10k');
    expect(next.draft.sessionsPerWeek).toBe(4);
    expect(next.touchedFields.trainingGoal).toBe(true);
    expect(next.missingFields).toEqual(['raceDateISO']);
    expect(next.messages[0].role).toBe('coach');
  });

  it('clamps numeric fields before updating the draft', () => {
    const next = reduceOnboardingChatState(initial(), {
      type: 'coach_reply',
      reply: {
        reply: 'I will keep that safe.',
        extracted: {
          sessionsPerWeek: 99,
          currentWeeklyKm: 999,
          preferredRestDays: [0, 6, 9, -1],
        },
        confidence: 'medium',
        missingFields: [],
      },
    });

    expect(next.draft.sessionsPerWeek).toBe(7);
    expect(next.draft.currentWeeklyKm).toBe(250);
    expect(next.draft.preferredRestDays).toEqual([0, 6]);
  });
});
