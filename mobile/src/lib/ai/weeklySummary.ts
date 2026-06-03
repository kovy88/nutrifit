// ── WEEKLY SUMMARY PROMPT BUILDER
//
// Skládá prompt pro Gemini, který shrne minulý týden uživatele.
// Pattern: stejný jako mealPrompts.ts — pure function vracející
// { systemPrompt, prompt, maxTokens }. AI dostane všechna data jednou
// a vrátí JSON s structured fields, ne markdown.
//
// Filozofie: AI nepočítá metriky, AI **interpretuje** metriky, které
// už deterministicky spočítáme. To eliminuje halucinace na číslech.

import type { WeeklyCheckIn } from '../../types/checkin';

export type WeeklySummaryInput = {
  /** ISO datum začátku týdne (pondělí). */
  weekStartISO: string;
  /** ISO datum konce týdne (neděle). */
  weekEndISO: string;
  /** Primary user goal — for context. */
  goalKind: 'fat_loss' | 'maintenance' | 'muscle_gain' | 'endurance' | 'general_fitness';
  /** Uživatelova váha na začátku a konci týdne (kg). */
  weightStartKg?: number;
  weightEndKg?: number;
  /** Průměr % adherence k jídelníčku (0–1). */
  averageAdherence?: number;
  /** Průměr readiness score (0=red, 1=yellow, 2=green). */
  averageReadinessRank?: number;
  /** Kolik dní bylo red / yellow / green. */
  readinessCounts?: { red: number; yellow: number; green: number };
  /** Týdenní TRIMP. */
  totalTrimp?: number;
  /** ACWR na konci týdne. */
  acwr?: number | null;
  /** Kolik tréninků bylo. */
  workoutCount?: number;
  /** Latest check-in subjective scales. */
  latestCheckIn?: WeeklyCheckIn;
  /** Prům. spánek (min). */
  averageSleepMinutes?: number;
  /** Prům. HRV (ms). */
  averageHrvMs?: number;
  /** Týdenní energetické saldo vs TDEE (kcal). Záporné = deficit. */
  energyBalanceKcal?: number;
  /** Teoretická změna váhy ze saldo (kg). */
  theoreticalKgChange?: number;
  /** Délka aktuálního log streaku (dní v řadě se zápisem). */
  currentLogStreak?: number;
  /** Délka aktuálního adherence streaku (dní v řadě v cíli). */
  currentAdherenceStreak?: number;
  /** Per-macro adherence průměry (logged/planned ratios). */
  macroAdherence?: {
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
  };
};

export type WeeklySummaryRequest = {
  systemPrompt: string;
  prompt: string;
  maxTokens: number;
};

export function buildWeeklySummaryRequest(input: WeeklySummaryInput): WeeklySummaryRequest {
  const systemPrompt = [
    'You are Trenr AI, a Czech sport-nutrition + recovery coach.',
    'You receive PRE-COMPUTED weekly metrics — DO NOT recompute, just INTERPRET.',
    'Return ONLY a valid JSON object — no markdown fences, no extra text.',
    'All user-facing text MUST be in Czech.',
    'Be concrete and actionable — no generic platitudes. Mention specific numbers from the input.',
    'Schema:',
    '{',
    '  "headline": "<≤80 chars Czech, 1-line summary>",',
    '  "highlights": ["<3-5 short Czech bullets ABOUT what went well>"],',
    '  "concerns": ["<0-3 short Czech bullets ABOUT what to watch>"],',
    '  "recommendation": "<1-2 Czech sentences with specific action for next week>"',
    '}',
  ].join('\n');

  const weightDelta = (input.weightStartKg != null && input.weightEndKg != null)
    ? input.weightEndKg - input.weightStartKg
    : null;
  const sleepHours = input.averageSleepMinutes != null
    ? (input.averageSleepMinutes / 60).toFixed(1)
    : 'unknown';
  const adherencePct = input.averageAdherence != null
    ? Math.round(input.averageAdherence * 100)
    : null;
  const readinessSummary = input.readinessCounts
    ? `${input.readinessCounts.green}× green, ${input.readinessCounts.yellow}× yellow, ${input.readinessCounts.red}× red`
    : 'unknown';

  const lines: string[] = [
    `Týden: ${input.weekStartISO} až ${input.weekEndISO}`,
    `Cíl uživatele: ${input.goalKind}`,
  ];
  if (weightDelta != null && input.weightStartKg != null && input.weightEndKg != null) {
    lines.push(`Váha: ${input.weightStartKg.toFixed(1)} → ${input.weightEndKg.toFixed(1)} kg (${weightDelta >= 0 ? '+' : ''}${weightDelta.toFixed(1)} kg)`);
  }
  if (adherencePct != null) lines.push(`Adherence k jídelníčku: ${adherencePct}% v průměru`);
  if (input.readinessCounts) lines.push(`Readiness dny: ${readinessSummary}`);
  if (input.totalTrimp != null) lines.push(`Týdenní TRIMP: ${input.totalTrimp}`);
  if (input.acwr != null) lines.push(`ACWR: ${input.acwr.toFixed(2)}`);
  if (input.workoutCount != null) lines.push(`Počet tréninků: ${input.workoutCount}`);
  if (input.averageSleepMinutes != null) lines.push(`Průměrný spánek: ${sleepHours} h`);
  if (input.averageHrvMs != null) lines.push(`Průměrné HRV: ${Math.round(input.averageHrvMs)} ms`);
  if (input.latestCheckIn) {
    if (input.latestCheckIn.energyLevel != null) lines.push(`Subjektivní energie (1–5): ${input.latestCheckIn.energyLevel}`);
    if (input.latestCheckIn.hungerLevel != null) lines.push(`Subjektivní hlad (1–5): ${input.latestCheckIn.hungerLevel}`);
    if (input.latestCheckIn.sorenessLevel != null) lines.push(`Subjektivní bolest/svalovka (1–5): ${input.latestCheckIn.sorenessLevel}`);
    if (input.latestCheckIn.notes) lines.push(`Uživatelská poznámka: "${input.latestCheckIn.notes}"`);
  }
  if (input.energyBalanceKcal != null) {
    const sign = input.energyBalanceKcal >= 0 ? '+' : '';
    lines.push(`Energetické saldo vs TDEE: ${sign}${input.energyBalanceKcal} kcal za týden`);
  }
  if (input.theoreticalKgChange != null) {
    const sign = input.theoreticalKgChange >= 0 ? '+' : '';
    lines.push(`Teoretická změna váhy ze saldo: ${sign}${input.theoreticalKgChange.toFixed(2)} kg`);
  }
  if (input.currentLogStreak != null && input.currentLogStreak > 0) {
    lines.push(`Aktuální log streak: ${input.currentLogStreak} dní v řadě se zápisem`);
  }
  if (input.currentAdherenceStreak != null && input.currentAdherenceStreak > 0) {
    lines.push(`Adherence streak: ${input.currentAdherenceStreak} dní v řadě v cíli 85-115%`);
  }
  if (input.macroAdherence) {
    const ma = input.macroAdherence;
    const parts: string[] = [];
    if (ma.protein != null) parts.push(`Protein ${Math.round(ma.protein * 100)}%`);
    if (ma.carbs != null) parts.push(`Carbs ${Math.round(ma.carbs * 100)}%`);
    if (ma.fat != null) parts.push(`Fat ${Math.round(ma.fat * 100)}%`);
    if (parts.length) lines.push(`Per-macro adherence: ${parts.join(', ')}`);
  }

  const prompt = [
    'Compose a weekly review in Czech for these metrics:',
    '',
    ...lines,
    '',
    'Rules:',
    '- Use the EXACT numbers above (don\'t round to nice values).',
    '- Tone: empathetic but direct, like a knowledgeable training partner.',
    '- highlights: things to celebrate (consistent adherence, good readiness mix, etc.)',
    '- concerns: signals that need attention (weight off track, low energy, ACWR spike).',
    '- recommendation: ONE clear action for next week. Don\'t hedge.',
    '- Don\'t mention "AI" or "automatic" or apologize for limitations.',
  ].join('\n');

  return { systemPrompt, prompt, maxTokens: 800 };
}

export type WeeklySummary = {
  headline: string;
  highlights: string[];
  concerns: string[];
  recommendation: string;
};

export function parseWeeklySummary(raw: unknown): WeeklySummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const headline = typeof obj.headline === 'string' ? obj.headline : null;
  if (!headline) return null;
  const highlights = Array.isArray(obj.highlights)
    ? obj.highlights.filter((x): x is string => typeof x === 'string')
    : [];
  const concerns = Array.isArray(obj.concerns)
    ? obj.concerns.filter((x): x is string => typeof x === 'string')
    : [];
  const recommendation = typeof obj.recommendation === 'string' ? obj.recommendation : '';
  return { headline, highlights, concerns, recommendation };
}
