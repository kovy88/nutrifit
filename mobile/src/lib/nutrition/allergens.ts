// ── ALLERGEN VALIDATION
//
// Why this exists: the AI prompt asks Gemini to honour the user's allergies
// (lib/utils/mealPrompts.ts passes `profile.dislikes` as "RESTRICTIONS/
// ALLERGIES"), but nothing today rejects the response if the model returns a
// forbidden ingredient anyway. That is a personal-injury hole. This module
// scans the AI output post-hoc and lets the caller request a repair.
//
// Scope of Phase 1: deterministic, dependency-free token match on ingredient
// strings + meal name + steps. Phase 2 will widen this to a structured
// `UserProfile.allergens: string[]` + per-allergen synonym map (e.g.
// "mléko" → "casein", "syrovátka", "laktóza").
//
// Notes on matching:
//  - We lowercase and strip Czech diacritics on both sides before comparing
//    so "Mléko" and "mleko" hit the same token.
//  - Word-boundary check (not substring) so "ořech" does not match "ořechovník"
//    accidentally, and "sója" does not match "sojový" — wait, that one we *do*
//    want to match. So the boundary check is on word starts but allows
//    suffixes ("sojov…", "mlecn…"). Implementation: token must appear at the
//    start of a word in the haystack.

import type { Meal } from '../../types';

export type AllergenHit = {
  /** Index of the meal inside the day's plan. */
  mealIndex: number;
  meal: Meal;
  /** The allergens (as the user typed them) that matched in this meal. */
  matched: string[];
};

export type AllergenValidationResult = {
  ok: boolean;
  hits: AllergenHit[];
};

/**
 * Parse the free-text dislikes/allergies field on UserProfile into a
 * normalized token list. Splits on commas, semicolons, " a ", " nebo " and
 * collapses whitespace. Drops empty tokens and obvious stop-words.
 *
 * "arašídy, laktóza a lepek" → ["arašídy", "laktóza", "lepek"]
 * "alergie na sóju" → ["sóju"] (stop-words filter strips "alergie", "na")
 */
export function parseAllergensFromFreeText(text: string | null | undefined): string[] {
  if (!text) return [];
  const STOP_WORDS = new Set([
    'a', 'i', 'nebo', 'na', 'k', 've', 'v', 'alergie', 'alergii', 'intolerance',
    'nesnáším', 'nemam', 'nemám', 'nesnasim', 'rad', 'rád', 'mám', 'mam',
  ]);
  return text
    .split(/[,;]|\s+a\s+|\s+nebo\s+/i)
    .map(t => t.trim())
    .filter(Boolean)
    .flatMap(t => t.split(/\s+/))
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOP_WORDS.has(stripDiacritics(t.toLowerCase())));
}

/** Strip Czech diacritics for matching. č→c, š→s, ř→r, etc. */
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function norm(s: string): string {
  return stripDiacritics(s.toLowerCase());
}

/**
 * Reduce a normalized allergen token to a match stem so we catch Czech
 * declension. Czech nouns inflect by changing the trailing vowel
 * ("máslo" → "másla", "sója" → "sojového", "laktóza" → "laktózy"), so a
 * full-token prefix match misses the inflected forms that actually appear in
 * recipe text. We strip a single trailing vowel (when the token is long
 * enough) to get the stem and match on that instead.
 *
 * This deliberately biases toward OVER-matching: for an allergen safety net a
 * false positive (rejecting a safe meal) is far less harmful than a false
 * negative (shipping an allergen). We never strip below 3 chars to avoid
 * matching everything.
 */
function stemAllergen(needle: string): string {
  const n = norm(needle);
  if (n.length >= 4 && /[aeiouy]$/.test(n)) {
    return n.slice(0, -1);
  }
  return n;
}

/**
 * Test whether `needle` (matched via its stem) appears as a word prefix in
 * `haystack`. "sója" matches "sojového" (stem "soj") but not in the middle of
 * "trasoja" (word boundary required).
 */
function containsAsWordPrefix(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const h = norm(haystack);
  const stem = stemAllergen(needle);
  if (stem.length < 3) return false;
  // word boundary: start of string OR preceded by non-letter/-digit
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(stem)}`, 'i');
  return re.test(h);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns the subset of `allergens` that appear in this meal's text.
 * Searches ingredients, name, and steps (steps because recipes sometimes
 * say "přidej máslo" without listing it as a structured ingredient).
 */
export function detectMealAllergens(meal: Meal, allergens: string[]): string[] {
  if (!allergens.length) return [];
  const haystack = [
    meal.name || '',
    ...(meal.ingredients || []),
    ...(meal.steps || []),
  ].join(' \n ');
  return allergens.filter(a => containsAsWordPrefix(haystack, a));
}

/**
 * Validate a full day's meal plan against a list of forbidden ingredients.
 * Returns `{ ok: true, hits: [] }` if clean. Caller decides whether to repair
 * (regenerate offending meals) or reject and show an error to the user.
 */
export function validateMealsAgainstAllergens(
  meals: Meal[],
  allergens: string[],
): AllergenValidationResult {
  if (!allergens.length) return { ok: true, hits: [] };
  const hits: AllergenHit[] = [];
  meals.forEach((meal, mealIndex) => {
    const matched = detectMealAllergens(meal, allergens);
    if (matched.length > 0) hits.push({ mealIndex, meal, matched });
  });
  return { ok: hits.length === 0, hits };
}
