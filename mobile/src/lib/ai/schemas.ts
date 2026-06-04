// ── AI OUTPUT SCHEMAS (Zod)
//
// Strukturální validace JSON, který se vrací z AI (Gemini přes /api/generate).
// AI nikdy nepočítá core čísla (makra/readiness/objem) — ta jdou deterministicky.
// Tyhle schémata jen ověří TVAR odpovědi a poskytnou bezpečný fallback, když
// model vrátí nesmysl. Doplňují (nenahrazují) makro-toleranci + alergen check
// v utils/nutrition.ts.

import { z } from 'zod';

/** Number nebo numerický string (AI občas vrací "450" místo 450). */
const num = z.coerce.number();

// ── Meal plan response ────────────────────────────────────────────────────────
export const rawMealSchema = z
  .object({
    mealType: z.string().optional(),
    name: z.string().optional(),
    kcal: num.optional(),
    protein: num.optional(),
    carbs: num.optional(),
    fat: num.optional(),
    fiber: num.optional(),
    prepTime: num.optional(),
    difficulty: z.string().optional(),
    ingredients: z.array(z.union([z.string(), num])).optional(),
    steps: z.array(z.string()).optional(),
  })
  .passthrough();

export const mealPlanResponseSchema = z.object({
  meals: z.array(rawMealSchema),
});

export type RawMeal = z.infer<typeof rawMealSchema>;

/** Vrátí pole syrových jídel, nebo null když tvar nesedí (caller pak fallbackne). */
export function parseMealPlanResponse(raw: unknown): RawMeal[] | null {
  const r = mealPlanResponseSchema.safeParse(raw);
  return r.success ? r.data.meals : null;
}

// ── Weekly summary ────────────────────────────────────────────────────────────
export const weeklySummarySchema = z.object({
  headline: z.string().min(1),
  highlights: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  recommendation: z.string().default(''),
});

export type WeeklySummaryParsed = z.infer<typeof weeklySummarySchema>;

export function parseWeeklySummarySafe(raw: unknown): WeeklySummaryParsed | null {
  const r = weeklySummarySchema.safeParse(raw);
  return r.success ? r.data : null;
}

// ── Coach chat reply ──────────────────────────────────────────────────────────
// Coach chat běží přes stejný /api/generate proxy (JSON mode), takže odpověď je
// JSON { reply, followups }. reply = lidská věta(y); followups = navrhované
// další otázky (volitelné).
export const coachReplySchema = z.object({
  reply: z.string().min(1),
  followups: z.array(z.string()).default([]),
});

export type CoachReply = z.infer<typeof coachReplySchema>;

export function parseCoachReply(raw: unknown): CoachReply | null {
  const r = coachReplySchema.safeParse(raw);
  return r.success ? r.data : null;
}

// ── Structured coach actions ─────────────────────────────────────────────────
export const coachActionSchema = z.object({
  type: z.enum(['swap_meal', 'adjust_today', 'mark_done', 'ask_coach', 'change_goal', 'explain', 'weekly_review']),
  label: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
  requiresConfirmation: z.boolean().default(true),
});

export const structuredCoachReplySchema = coachReplySchema.extend({
  actions: z.array(coachActionSchema).default([]),
});

export type StructuredCoachReply = z.infer<typeof structuredCoachReplySchema>;

export function parseStructuredCoachReply(raw: unknown): StructuredCoachReply | null {
  const r = structuredCoachReplySchema.safeParse(raw);
  return r.success ? r.data : null;
}

// ── Chat-first onboarding extraction ─────────────────────────────────────────
const onboardingExtractedSchema = z.object({
  coachScope: z.enum(['both', 'training', 'nutrition']).optional(),
  primaryGoal: z.enum(['lose_fat', 'maintain_weight', 'gain_muscle', 'improve_fitness', 'improve_running', 'improve_recovery', 'build_consistency']).optional(),
  trainingGoal: z.enum(['general_fitness', 'walking_more', 'couch_to_5k', 'run_5k', 'run_10k', 'half_marathon', 'marathon', 'strength_basics', 'sports_conditioning', 'hyrox', 'sprint_triathlon', 'olympic_triathlon', 'half_ironman', 'full_ironman', 'ocr']).optional(),
  sessionsPerWeek: num.int().min(1).max(7).optional(),
  experience: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  currentWeeklyKm: num.min(0).max(250).optional(),
  longestRecentRunKm: num.min(0).max(100).optional(),
  runsPerWeek: num.int().min(0).max(7).optional(),
  injuryFlag: z.boolean().optional(),
  runWalkPreferred: z.boolean().optional(),
  raceDateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  targetTimeSeconds: num.int().min(0).max(24 * 3600).optional(),
  currentPaceSecPerKm: num.int().min(120).max(1200).optional(),
  availableTrainingDays: num.int().min(1).max(7).optional(),
  preferredRestDays: z.array(num.int().min(0).max(6)).optional(),
  gender: z.enum(['muz', 'zena']).optional(),
  age: num.int().min(0).max(120).optional(),
  height: num.int().min(0).max(260).optional(),
  weight: num.min(0).max(350).optional(),
  diet: z.enum(['standardní', 'vegetariánský', 'veganský', 'bezlepkový', 'nízkosacharidový', 'vysokoproteínový']).optional(),
  nutritionMode: z.enum(['balanced', 'high_protein', 'budget_friendly', 'simple_meal_prep', 'endurance_fueling', 'fat_loss_friendly', 'muscle_gain_friendly']).optional(),
  planIntensity: z.enum(['easy', 'moderate', 'ambitious_but_safe']).optional(),
});

export const onboardingCoachReplySchema = z.object({
  reply: z.string().min(1),
  extracted: onboardingExtractedSchema.default({}),
  confidence: z.enum(['low', 'medium', 'high']).default('low'),
  missingFields: z.array(z.string()).default([]),
});

export type OnboardingCoachReplyParsed = z.infer<typeof onboardingCoachReplySchema>;

export function parseOnboardingCoachReply(raw: unknown): OnboardingCoachReplyParsed | null {
  const r = onboardingCoachReplySchema.safeParse(raw);
  return r.success ? r.data : null;
}
