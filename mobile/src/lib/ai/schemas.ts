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
