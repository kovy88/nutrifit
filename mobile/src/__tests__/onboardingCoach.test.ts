import { describe, expect, it } from 'vitest';
import { buildOnboardingCoachRequest } from '../lib/ai/onboardingCoach';
import { DEFAULT_PROFILE } from '../utils/nutrition';

describe('buildOnboardingCoachRequest', () => {
  it('keeps raw enum ids for extraction but forbids them in the user-facing reply', () => {
    const request = buildOnboardingCoachRequest({
      draft: DEFAULT_PROFILE,
      history: [],
      userText: 'Chci zhubnout a běhat 10 km.',
      locale: 'cs',
    });

    expect(request.systemPrompt).toContain('Allowed primaryGoal');
    expect(request.systemPrompt).toContain('lose_fat');
    expect(request.systemPrompt).toContain('Use raw enum ids and field names only inside "extracted"');
    expect(request.systemPrompt).toContain('The user-facing "reply" must use plain language');
    expect(request.systemPrompt).toContain('primaryGoal');
    expect(request.systemPrompt).toContain('run_10k');
  });

  it('tells the model not to offer advanced sports unless explicitly mentioned', () => {
    const request = buildOnboardingCoachRequest({
      draft: DEFAULT_PROFILE,
      history: [],
      userText: 'Chci jen začít běhat.',
      locale: 'cs',
    });

    expect(request.systemPrompt).toContain('Keep onboarding light');
    expect(request.systemPrompt).toContain('Do not offer advanced events or sports');
    expect(request.systemPrompt).toContain('unless the user explicitly mentions');
  });

  it('embeds recent chat and the current user text', () => {
    const request = buildOnboardingCoachRequest({
      draft: { ...DEFAULT_PROFILE, primaryGoal: 'improve_running', trainingGoal: 'run_10k' },
      history: [
        { role: 'user', text: 'Chci běhat.' },
        { role: 'coach', text: 'Kolik dní týdně chceš trénovat?' },
      ],
      userText: 'Tři dny týdně.',
      locale: 'cs',
    });

    expect(request.prompt).toContain('CURRENT DRAFT');
    expect(request.prompt).toContain('"primaryGoal":"improve_running"');
    expect(request.prompt).toContain('coach: Kolik dní týdně chceš trénovat?');
    expect(request.prompt).toContain('USER: Tři dny týdně.');
  });
});
