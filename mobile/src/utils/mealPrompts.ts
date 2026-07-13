import type { Macros, Meal, UserProfile, TrainingSession } from '../types';
import { primaryGoalLabel } from './nutrition';
import type { Locale } from '../lib/i18n';

const mealNamesCs: Record<number, string[]> = {
  2: ['Snídaně', 'Večeře'],
  3: ['Snídaně', 'Oběd', 'Večeře'],
  4: ['Snídaně', 'Oběd', 'Odpolední svačina', 'Večeře'],
  5: ['Snídaně', 'Dop. svačina', 'Oběd', 'Odp. svačina', 'Večeře'],
  6: ['Snídaně', 'Dop. svačina', 'Oběd', 'Odp. svačina', 'Večeře', '2. večeře'],
};

const mealNamesEn: Record<number, string[]> = {
  2: ['Breakfast', 'Dinner'],
  3: ['Breakfast', 'Lunch', 'Dinner'],
  4: ['Breakfast', 'Lunch', 'Afternoon snack', 'Dinner'],
  5: ['Breakfast', 'Morning snack', 'Lunch', 'Afternoon snack', 'Dinner'],
  6: ['Breakfast', 'Morning snack', 'Lunch', 'Afternoon snack', 'Dinner', 'Evening snack'],
};

export function namesForMealCount(count: number, locale: Locale = 'en') {
  const names = locale === 'en' ? mealNamesEn : mealNamesCs;
  return names[count] || names[5];
}

export function buildMealPlanRequest(
  profile: UserProfile,
  macros: Macros,
  session?: TrainingSession | null,
  /** When a previous attempt failed validation, the errors are fed back so the
   *  model can self-correct on a single retry before we surface a hard error. */
  repairErrors?: string[],
  locale: Locale = 'en',
) {
  const names = namesForMealCount(profile.mealCount, locale);
  const lang = locale === 'en' ? 'English' : 'Czech';
  const systemPrompt = [
    'You are Trenr AI, a practical nutrition assistant.',
    'Return only valid JSON without markdown.',
    `All user-facing JSON string values must be in ${lang}.`,
    'The app is not a medical device, so do not make diagnostic or treatment claims.',
    locale === 'en'
      ? 'Respect allergies, diet style, and ingredients commonly available in regular grocery stores.'
      : 'Respect allergies, diet style, and ingredients commonly available in Czech stores.',
  ].join('\n');

  let trainingContext = '';
  if (session && session.kind !== 'rest' && session.durationMinutes > 0) {
    trainingContext = locale === 'en'
      ? `The user has planned training today: ${session.title} (type ${session.kind}, ${session.durationMinutes} min, intensity ${session.intensity}).
Adjust the meal plan sensibly: meals immediately before or after training should include more easy-to-digest carbs for energy and enough protein for recovery. You may briefly mention in English why a specific meal fits today's training.`
      : `Dnes má uživatel naplánovaný trénink: ${session.title} (druh ${session.kind}, ${session.durationMinutes} min, intenzita ${session.intensity}).
Jídelníček tréninku rozumně přizpůsob: jídlo bezprostředně před nebo po tréninku by mělo obsahovat více lehce stravitelných sacharidů pro rychlou energii a dostatek bílkovin pro regeneraci. Do popisu jídla nebo postupu můžeš stručně v jedné větě česky zmínit, proč je toto konkrétní jídlo pro dnešní trénink skvělé.`;
  } else {
    trainingContext = locale === 'en'
      ? 'The user has a rest day without demanding training. Distribute macros evenly and focus on steady energy through the day.'
      : 'Dnes má uživatel volný den bez náročného tréninku. Rozlož makroživiny rovnoměrně a zaměř se na stabilní hladinu energie po celý den.';
  }

  const example = locale === 'en'
    ? '{"meals":[{"mealType":"Breakfast","name":"Meal name","kcal":450,"protein":30,"carbs":45,"fat":12,"fiber":8,"prepTime":10,"difficulty":"Simple","ingredients":["150g ingredient"],"steps":["Step."]}]}'
    : '{"meals":[{"mealType":"Snídaně","name":"Název","kcal":450,"protein":30,"carbs":45,"fat":12,"fiber":8,"prepTime":10,"difficulty":"Jednoduchá","ingredients":["150g suroviny"],"steps":["Krok."]}]}';

  const prompt = `Create a 1-day meal plan with exactly ${profile.mealCount} meals.

DAILY TARGETS: ${macros.kcal} kcal | Protein ${macros.protein} g | Carbs ${macros.carbs} g | Fat ${macros.fat} g
PERSON: ${profile.gender === 'muz' ? 'Male' : 'Female'}, ${profile.age} years old, ${profile.weight} kg, goal ${primaryGoalLabel(profile.primaryGoal, locale)}
DIET: ${profile.diet}
NUTRITION MODE: ${nutritionModeInstruction(profile.nutritionMode)}
PLAN INTENSITY: ${profile.planIntensity ?? 'moderate'} (stay safe; never suggest extreme restriction or aggressive training jumps)
TRAINING DAY CONTEXT: ${trainingContext}
LIKED FOODS: ${profile.likes || 'no preference'}
RESTRICTIONS/ALLERGIES: ${profile.dislikes || 'no restrictions'}
MEALS: ${names.join(', ')}
${repairErrors && repairErrors.length ? `\nPREVIOUS ATTEMPT FAILED VALIDATION — fix exactly these issues and keep daily totals on target:\n- ${repairErrors.slice(0, 4).join('\n- ')}\n` : ''}
Return JSON:
${example}`;

  return { systemPrompt, prompt, maxTokens: 3500, mealNames: names };
}

function nutritionModeInstruction(mode: UserProfile['nutritionMode'] = 'balanced'): string {
  switch (mode) {
    case 'high_protein':
      return 'high_protein — prioritize lean protein in every meal while keeping the deterministic macro targets';
    case 'budget_friendly':
      return 'budget_friendly — use affordable Czech-store staples, legumes, eggs, dairy, frozen vegetables, rice/potatoes/oats';
    case 'simple_meal_prep':
      return 'simple_meal_prep — repeat ingredients intelligently, prefer batch-cookable meals and short prep';
    case 'endurance_fueling':
      return 'endurance_fueling — place easy-to-digest carbs around training and keep fats lower before hard sessions';
    default:
      return 'balanced — varied, practical meals with no extreme diet framing';
  }
}

// ── ALLERGEN REPAIR REQUEST ──────────────────────────────────────────────────
//
// Called only when validateMealsAgainstAllergens flagged a meal returned by
// the model. We re-prompt Gemini for ONE replacement meal at the same macro
// target, with an explicit denylist of ingredients. This is a deterministic
// repair, not a user-initiated regen — the user never sees the bad meal.

export function buildAllergenRepairRequest(opts: {
  profile: UserProfile;
  session?: TrainingSession | null;
  current: Meal;
  forbidden: string[];
  otherMeals?: Meal[];
  locale?: Locale;
}): SingleMealRequest {
  const { profile, session, current, forbidden, otherMeals = [], locale = 'en' } = opts;
  const lang = locale === 'en' ? 'English' : 'Czech';

  const systemPrompt = [
    'You are Trenr AI, a practical nutrition assistant.',
    'Return ONLY ONE valid JSON meal object (no array wrapper, no markdown).',
    `All user-facing JSON string values must be in ${lang}.`,
    'CRITICAL: The user has allergies/intolerances listed under FORBIDDEN. The meal MUST NOT contain any of these ingredients OR their derivatives (e.g. milk → cheese, butter, cream, casein, whey; gluten → wheat, rye, barley, spelt, semolina; nuts → almond butter, marzipan, pesto with pine nuts).',
    'If you cannot satisfy the macro target safely without the forbidden items, return a simpler meal at the same macros using clearly allowed staples.',
  ].join('\n');

  let trainingContext = '';
  if (session && session.kind !== 'rest' && session.durationMinutes > 0) {
    trainingContext = locale === 'en'
      ? `The user has training today: ${session.title} (${session.durationMinutes} min, intensity ${session.intensity}).`
      : `Dnes má uživatel trénink ${session.title} (${session.durationMinutes} min, intenzita ${session.intensity}).`;
  }

  const otherHints = otherMeals
    .filter(m => m.mealType !== current.mealType)
    .slice(0, 4)
    .map(m => `${m.mealType}: ${m.name}`)
    .join(' | ');

  const example = locale === 'en'
    ? `{"mealType":"${current.mealType}","name":"English meal name","kcal":${current.kcal},"protein":${current.protein},"carbs":${current.carbs},"fat":${current.fat},"fiber":8,"prepTime":15,"difficulty":"Simple","ingredients":["150g ingredient"],"steps":["Step 1."]}`
    : `{"mealType":"${current.mealType}","name":"Český název","kcal":${current.kcal},"protein":${current.protein},"carbs":${current.carbs},"fat":${current.fat},"fiber":8,"prepTime":15,"difficulty":"Jednoduchá","ingredients":["150g suroviny"],"steps":["Krok 1."]}`;

  const prompt = `Generate ONE alternative ${lang} meal for slot "${current.mealType}" that strictly avoids the user's allergens.

TARGET MACROS (must match ±10 %):
  ${current.kcal} kcal | Protein ${current.protein} g | Carbs ${current.carbs} g | Fat ${current.fat} g
PERSON: ${profile.gender === 'muz' ? 'Male' : 'Female'}, ${profile.age} y, ${profile.weight} kg, goal ${primaryGoalLabel(profile.primaryGoal, locale)}
DIET: ${profile.diet}
LIKED FOODS: ${profile.likes || 'no preference'}
FORBIDDEN (the user previously got an allergen here — DO NOT use these or their derivatives): ${forbidden.join(', ')}
PREVIOUSLY RETURNED MEAL (contained an allergen, replace it): ${current.name}
${otherHints ? `OTHER MEALS TODAY (do not duplicate main protein): ${otherHints}` : ''}
${trainingContext ? `TRAINING CONTEXT: ${trainingContext}` : ''}

Return JSON:
${example}`;

  return { systemPrompt, prompt, maxTokens: 900, mealType: current.mealType };
}

// ── SINGLE MEAL REGENERATION ──────────────────────────────────────────────────
//
// User clicks "Regenerovat" on one meal card — we ask AI for ONE alternative
// meal hitting the same per-meal kcal/macro window. The rest of the day plan
// stays untouched so the daily total doesn't drift.

export type SingleMealRequest = {
  systemPrompt: string;
  prompt: string;
  maxTokens: number;
  /** The slot label we asked for, used to fall back when AI omits mealType. */
  mealType: string;
};

export function buildSingleMealRequest(opts: {
  profile: UserProfile;
  session?: TrainingSession | null;
  current: Meal;
  /** Other meals in the day so AI doesn't repeat ingredients. */
  otherMeals?: Meal[];
  locale?: Locale;
}): SingleMealRequest {
  const { profile, session, current, otherMeals = [], locale = 'en' } = opts;
  const lang = locale === 'en' ? 'English' : 'Czech';

  const systemPrompt = [
    'You are Trenr AI, a practical nutrition assistant.',
    'Return ONLY ONE valid JSON meal object (no array wrapper, no markdown).',
    `All user-facing JSON string values must be in ${lang}.`,
    'The app is not a medical device, so do not make diagnostic or treatment claims.',
    locale === 'en'
      ? 'Respect allergies, diet style, and ingredients commonly available in regular grocery stores.'
      : 'Respect allergies, diet style, and ingredients commonly available in Czech stores.',
  ].join('\n');

  let trainingContext = '';
  if (session && session.kind !== 'rest' && session.durationMinutes > 0) {
    trainingContext = locale === 'en'
      ? `The user has training today: ${session.title} (${session.durationMinutes} min, intensity ${session.intensity}). Adjust the meal for pre/post-workout carbs + protein.`
      : `Dnes má uživatel trénink ${session.title} (${session.durationMinutes} min, intenzita ${session.intensity}). Jídlo přizpůsob — pre/post-workout sacharidy + bílkoviny.`;
  }

  // Other meals' main protein + names so the AI avoids repeats.
  const otherProteinHints = otherMeals
    .filter(m => m.mealType !== current.mealType)
    .slice(0, 4)
    .map(m => `${m.mealType}: ${m.name}`)
    .join(' | ');

  const example = locale === 'en'
    ? `{"mealType":"${current.mealType}","name":"English meal name","kcal":${current.kcal},"protein":${current.protein},"carbs":${current.carbs},"fat":${current.fat},"fiber":8,"prepTime":15,"difficulty":"Simple","ingredients":["150g ingredient"],"steps":["Step 1.","Step 2."]}`
    : `{"mealType":"${current.mealType}","name":"Český název","kcal":${current.kcal},"protein":${current.protein},"carbs":${current.carbs},"fat":${current.fat},"fiber":8,"prepTime":15,"difficulty":"Jednoduchá","ingredients":["150g suroviny"],"steps":["Krok 1.","Krok 2."]}`;

  const prompt = `Generate ONE alternative ${lang} meal for slot "${current.mealType}".

TARGET MACROS (must match ±10 %):
  ${current.kcal} kcal | Protein ${current.protein} g | Carbs ${current.carbs} g | Fat ${current.fat} g
PERSON: ${profile.gender === 'muz' ? 'Male' : 'Female'}, ${profile.age} y, ${profile.weight} kg, goal ${primaryGoalLabel(profile.primaryGoal, locale)}
DIET: ${profile.diet}
LIKED FOODS: ${profile.likes || 'no preference'}
RESTRICTIONS/ALLERGIES: ${profile.dislikes || 'no restrictions'}
AVOID THIS EXACT MEAL (user rejected it): ${current.name}
${otherProteinHints ? `OTHER MEALS TODAY (do not duplicate main protein): ${otherProteinHints}` : ''}
${trainingContext ? `TRAINING CONTEXT: ${trainingContext}` : ''}

Return JSON:
${example}`;

  return { systemPrompt, prompt, maxTokens: 900, mealType: current.mealType };
}
