import type { Translate } from '../i18n';
import type { DailyCoachRecommendation } from '../../types/coach';

export type DayDecision = { kind: 'rest' | 'easier' | 'go' | 'steady'; title: string; label: string };

/**
 * The single "what kind of day is it" verdict shared by Today and Coach, so the
 * two screens never disagree (e.g. "Steady day" on one and "Easy today" on the other).
 */
export function dayDecision(rec: DailyCoachRecommendation, restDay: boolean, t: Translate): DayDecision {
  const { recommendedIntensity: intensity, band } = rec.readiness;
  // Readiness alone can't decide this: on a rest day a well-recovered athlete
  // still scores 'hard'/'high', which used to render "Go for it" over the ring
  // and the sentence "Do the planned workout. Rest today. Recovery first."
  // Whether a session exists at all outranks how fresh you feel.
  if (restDay) {
    return { kind: 'rest', title: t('today.decisionRestTitle'), label: t('today.decisionRestLabel') };
  }
  if (intensity === 'rest' || band === 'low' || rec.training?.adjusted) {
    return { kind: 'easier', title: t('today.decisionEasierTitle'), label: t('today.decisionEasierLabel') };
  }
  if (intensity === 'hard' && band === 'high') {
    return { kind: 'go', title: t('today.decisionGoTitle'), label: t('today.decisionGoLabel') };
  }
  return { kind: 'steady', title: t('today.decisionSteadyTitle'), label: t('today.decisionSteadyLabel') };
}
