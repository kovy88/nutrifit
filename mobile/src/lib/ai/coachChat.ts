// ── COACH CHAT PROMPT BUILDER
//
// Pure builder pro coach chat. Stejný pattern jako mealPrompts/weeklySummary:
// vrací { systemPrompt, prompt, maxTokens }. Chat běží přes /api/generate
// (JSON mode), takže odpověď je { reply, followups } validovaná coachReplySchema.
//
// KLÍČOVÉ: AI dostane DETERMINISTICKY spočítané dnešní doporučení jako kontext
// a smí ho jen VYSVĚTLOVAT / přizpůsobovat kvalitativně. Nesmí vymýšlet kalorie,
// makra, readiness skóre ani tréninkový objem.

import type { CoachMessage, DailyCoachRecommendation } from '../../types/coach';
import type { Locale } from '../i18n';

export type CoachChatContext = {
  recommendation: DailyCoachRecommendation | null;
  /** Stručné shrnutí cíle, např. "lose_weight + run_10k". */
  goalSummary: string;
  /** Týdenní váhový trend (kg/týden), pokud známe. */
  recentWeightTrendKgPerWeek?: number | null;
};

export type CoachChatRequest = {
  systemPrompt: string;
  prompt: string;
  maxTokens: number;
};

export function buildCoachChatRequest(opts: {
  context: CoachChatContext;
  history: CoachMessage[];
  question: string;
  locale: Locale;
}): CoachChatRequest {
  const { context, history, question, locale } = opts;
  const lang = locale === 'en' ? 'English' : 'Czech';

  const systemPrompt = [
    'You are Trenr AI Coach — a calm, practical daily coach for nutrition, training and recovery.',
    `Reply in ${lang}.`,
    'Return ONLY valid JSON: {"reply":"<answer>","followups":["<short suggested question>"]}. No markdown, no extra text.',
    'Ground every answer in the DAILY PLAN CONTEXT below. NEVER invent calories, macros, readiness numbers or training volume — those are already computed deterministically; you only explain, adjust qualitatively, motivate, and answer.',
    'Not a medical device: no diagnosis, no medical claims, no extreme calorie deficits or aggressive training jumps. If asked for those, decline gently and offer a safe alternative.',
    'Keep "reply" short (2–4 sentences). Provide 0–3 short "followups".',
  ].join('\n');

  const rec = context.recommendation;
  const ctxLines: string[] = [`Goal: ${context.goalSummary}`];
  if (context.recentWeightTrendKgPerWeek != null) {
    ctxLines.push(`Weight trend: ${context.recentWeightTrendKgPerWeek.toFixed(2)} kg/week`);
  }
  if (rec) {
    ctxLines.push(`Readiness: ${rec.readiness.score}/100 (${rec.readiness.band})`);
    if (rec.training) {
      ctxLines.push(`Today's focus: ${rec.training.focus}`);
      ctxLines.push(
        rec.training.session
          ? `Today's session: ${rec.training.session.title} (${rec.training.session.durationMinutes} min, ${rec.training.session.intensity})`
          : "Today: rest day",
      );
    }
    if (rec.nutrition) {
      const m = rec.nutrition.targets;
      ctxLines.push(`Nutrition target: ${m.kcal} kcal, ${m.protein} g protein, ${m.carbs} g carbs, ${m.fat} g fat`);
    }
    ctxLines.push(`Coach note: ${rec.coachNote}`);
    if (rec.training?.whatNotToDo) ctxLines.push(`Avoid today: ${rec.training.whatNotToDo}`);
  }

  const historyLines = history.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.text}`);

  const prompt = [
    'DAILY PLAN CONTEXT:',
    ...ctxLines,
    ...(historyLines.length ? ['', 'CONVERSATION SO FAR:', ...historyLines] : []),
    '',
    `User question: ${question}`,
  ].join('\n');

  return { systemPrompt, prompt, maxTokens: 500 };
}

/** "Proč mám dnes právě tohle doporučení?" — explainer = chat s jednou otázkou. */
export function buildExplainRequest(opts: { context: CoachChatContext; locale: Locale }): CoachChatRequest {
  const question = opts.locale === 'en'
    ? 'Why is this my recommendation today? Explain briefly based on my readiness and plan.'
    : 'Proč mám dnes právě tohle doporučení? Vysvětli stručně podle mé připravenosti a plánu.';
  return buildCoachChatRequest({ context: opts.context, history: [], question, locale: opts.locale });
}
