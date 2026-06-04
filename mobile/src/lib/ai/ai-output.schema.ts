import { z } from 'zod';
import type { Locale } from '../i18n';

export const aiCoachOutputSchema = z.object({
  coachMessage: z.string().min(1),
  warnings: z.array(z.string()).default([]),
});

export type AiCoachOutput = z.infer<typeof aiCoachOutputSchema>;

/**
 * Validates the structured JSON returned from the LLM.
 * Returns the parsed fields, or null if the response is invalid.
 */
export function validateAiCoachOutput(raw: unknown): AiCoachOutput | null {
  const result = aiCoachOutputSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Generates a high-quality deterministic message when the LLM service
 * is unavailable or returns invalid data.
 */
export function fallbackCoachMessage(
  readinessBand: 'low' | 'medium' | 'high',
  recommendedIntensity: 'rest' | 'easy' | 'moderate' | 'hard',
  hasTraining: boolean,
  locale: Locale = 'cs'
): string {
  const isEn = locale === 'en';

  if (readinessBand === 'low') {
    return isEn
      ? 'Prioritize recovery and rest today. Sleep was lower or load was high — focus on quality nutrients and rest.'
      : 'Dnes se zaměř hlavně na regeneraci a odpočinek. Spánek byl kratší nebo zbytek zátěže vysoký — dopřej tělu klid.';
  }

  if (hasTraining && recommendedIntensity !== 'rest') {
    if (readinessBand === 'high') {
      return isEn
        ? 'You are in prime condition today. Push your workout with confidence and fuel up well.'
        : 'Dnes jsi ve skvělé kondici. Naplánovaný trénink zvládneš naplno, drž se předepsaného tempa.';
    } else {
      return isEn
        ? 'Good baseline readiness. Complete your workout but stay mindful of fatigue and listen to your body.'
        : 'Slušná připravenost na trénink. Odcvič naplánovanou jednotku, ale poslouchej své tělo a zbytečně netlač na pilu.';
    }
  }

  // Rest day or general recovery
  return isEn
    ? 'An easy active recovery day or rest day. Focus on hydration, stretching, and hitting your macros.'
    : 'Dnes tě čeká volný den nebo aktivní regenerace. Zaměř se na hydrataci, protažení a dodržení makroživin.';
}
