// ── COACH CHAT PROMPT BUILDER
//
// Pure builder pro coach chat. Stejný pattern jako mealPrompts/weeklySummary:
// vrací { systemPrompt, prompt, maxTokens }. Chat běží přes /api/generate
// (JSON mode), takže odpověď je { reply, followups, actions } validovaná Zodem.
//
// KLÍČOVÉ: AI dostane DETERMINISTICKY spočítané dnešní doporučení jako kontext
// a smí ho jen VYSVĚTLOVAT / přizpůsobovat kvalitativně. Nesmí vymýšlet kalorie,
// makra, readiness skóre ani tréninkový objem.

import type { CoachMessage, DailyCoachRecommendation } from '../../types/coach';
import type { Locale } from '../i18n';

export type CoachChatContext = {
  recommendation: DailyCoachRecommendation | null;
  /** Stručné shrnutí cíle, např. "lose_fat + run_10k". */
  goalSummary: string;
  /** Týdenní váhový trend (kg/týden), pokud známe. */
  recentWeightTrendKgPerWeek?: number | null;
  /** Hlavní sport uživatele (custom režim) — ať AI radí relevantně k jeho sportu. */
  mainSport?: string | null;
  /** Kolik dní do příštího zápasu (custom režim), 0 = dnes. */
  nextMatchInDays?: number | null;
  /** Jednotky uživatele — ať AI mluví v lb/mílích nebo kg/km. */
  units?: 'metric' | 'imperial';
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
  const unitsHint = (context.units ?? 'metric') === 'imperial'
    ? 'Use imperial units (lb, miles) for any weights or distances.'
    : 'Use metric units (kg, km) for any weights or distances.';

  const systemPrompt = [
    'You are Trenr AI Coach — a calm, practical daily coach for nutrition, training and recovery.',
    `Reply in ${lang}.`,
    unitsHint,
    'Return ONLY valid JSON: {"reply":"<answer>","followups":["<short suggested question>"],"actions":[{"type":"swap_meal|adjust_today|mark_done|change_goal|explain|weekly_review","label":"<short label>","payload":{},"requiresConfirmation":true}]}. No markdown, no extra text.',
    'Ground every answer in the DAILY PLAN CONTEXT below. NEVER invent calories, macros, readiness numbers or training volume — those are already computed deterministically; you only explain, adjust qualitatively, motivate, and answer.',
    'Not a medical device: no diagnosis, no medical claims, no extreme calorie deficits or aggressive training jumps. If asked for those, decline gently and offer a safe alternative.',
    'Keep "reply" short (2–4 sentences). Provide 0–3 short "followups" and 0–2 actions. Only propose actions grounded in the DAILY PLAN CONTEXT.',
  ].join('\n');

  const rec = context.recommendation;
  const ctxLines: string[] = [`Goal: ${context.goalSummary}`];
  if (context.recentWeightTrendKgPerWeek != null) {
    ctxLines.push(`Weight trend: ${context.recentWeightTrendKgPerWeek.toFixed(2)} kg/week`);
  }
  if (context.mainSport) ctxLines.push(`Main sport: ${context.mainSport}`);
  if (context.nextMatchInDays != null) {
    ctxLines.push(context.nextMatchInDays === 0 ? 'Next match: today' : `Next match: in ${context.nextMatchInDays} day(s)`);
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
