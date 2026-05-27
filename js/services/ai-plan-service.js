// ── AI PLAN SERVICE
//
// Postavený nad deterministickým jádrem v [[nutrition]] a [[training]]:
// LLM dostane konkrétní cílové počty (kcal, makra, km, struktura týdne)
// a má za úkol vyprodukovat jen kreativní obsah (názvy jídel, ingredience,
// kroky, kouč-zprávy). Nepočítá makra od nuly, jen je naplňuje.
//
// Service nemá DOM ani fetch logiku — vrací prompt + validátor.
// Volající (UI) si zařídí samotné volání /api/generate.

import { validateMealPlanMacros } from '../domain/nutrition.js';

/** @typedef {import('../domain/types.js').UserProfile} UserProfile */
/** @typedef {import('../domain/types.js').NutritionGoal} NutritionGoal */
/** @typedef {import('../domain/types.js').TrainingGoal} TrainingGoal */
/** @typedef {import('../domain/types.js').TrainingPlan} TrainingPlan */
/** @typedef {import('../domain/types.js').MacroTargets} MacroTargets */
/** @typedef {import('../domain/types.js').DailyActivitySummary} DailyActivitySummary */

// ── PROMPT BUILDER ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `# Role
You are NutriPlan AI, a Czech nutrition and training coach. All user-facing
content MUST be in Czech (meal names, ingredients, steps, notes, session titles).

# Core directives
1. NUMBERS ARE FIXED — Daily kcal and macro totals are provided by the host
   application as a hard target. You must keep totals within ±5 % of targets.
   For each meal, kcal MUST equal protein*4 + carbs*4 + fat*9 within ±10 kcal.
2. STRUCTURE IS FIXED — Training sessions for the week are provided as input.
   Do NOT invent new sessions; you may only add motivational notes and
   short coaching tips. Distance and intensity stay as given.
3. PRACTICAL — Use ingredients commonly found in Czech supermarkets (Billa,
   Albert, Kaufland, Lidl). Steps must be doable for a beginner.
4. SAFETY — Do not present advice as medical. Do not recommend extreme
   restriction or volume jumps. If input asks for something unsafe, return
   it in "warnings".

# Diet guardrails
- diet=vegan: NO animal products. Protein from legumes, tofu, tempeh, seitan.
- diet=vegetarian: no meat or fish, eggs and dairy OK.
- diet=keto: carbs < 30 g/day. No grains, potatoes, high-GI fruit.
- diet=gluten_free: no wheat, rye, barley, spelt.
- diet=lactose_free: no dairy except hard-aged cheese.

# Output
Return ONLY a valid JSON object exactly matching the schema. No prose,
no markdown fences.`;

/**
 * Postaví strukturované zadání pro LLM. Záměrně předává VŠECHNA čísla
 * dopředu — model už nedopočítává deficit ani makra, jen plní obsah.
 *
 * @param {Object} input
 * @param {UserProfile} input.profile
 * @param {NutritionGoal} input.nutritionGoal
 * @param {TrainingGoal} [input.trainingGoal]
 * @param {MacroTargets} input.macros
 * @param {TrainingPlan} [input.trainingPlan]
 * @param {DailyActivitySummary[]} [input.recentActivity]
 * @param {{ mealsPerDay?:number, ingredientLevel?:'budget'|'standard'|'gourmet', includeWeek?:boolean }} [input.options]
 */
export function buildAIPlanPrompt(input) {
  const { profile, nutritionGoal, trainingGoal, macros, trainingPlan, recentActivity = [], options = {} } = input;
  const mealsPerDay = options.mealsPerDay ?? profile.mealsPerDay ?? 5;
  const ingredientLevel = options.ingredientLevel ?? 'standard';
  const includeWeek = options.includeWeek ?? Boolean(trainingPlan);

  const dietLine = `diet=${profile.diet ?? 'omnivore'}`;
  const allergyLine = (profile.allergies?.length) ? `allergies=${profile.allergies.join(', ')}` : 'allergies=none';
  const likesLine = profile.likes?.length ? `likes=${profile.likes.join(', ')}` : '';
  const dislikesLine = profile.dislikes?.length ? `dislikes=${profile.dislikes.join(', ')}` : '';

  const trainingBlock = includeWeek && trainingPlan
    ? trainingPlan.sessions.map(s => `  - ${s.date} ${s.kind} | ${s.title} | ${s.distanceKm ?? '-'} km | ${s.durationMinutes ?? '-'} min | intensity=${s.intensity}`).join('\n')
    : 'none';

  const activityBlock = recentActivity.length
    ? recentActivity.slice(-7).map(a => `  - ${a.date}: ${a.steps} steps, ${a.activeEnergyKcal} kcal active`).join('\n')
    : 'no recent activity data';

  const prompt = `# Targets (do not recompute)
goal=${nutritionGoal.kind} | training_goal=${trainingGoal?.kind ?? 'none'}
sex=${profile.sex} age=${profile.ageYears} height_cm=${profile.heightCm} weight_kg=${profile.weightKg}
kcal=${macros.kcal} protein=${macros.proteinG}g carbs=${macros.carbsG}g fat=${macros.fatG}g fiber=${macros.fiberG}g
${dietLine} | ${allergyLine}
${likesLine}
${dislikesLine}
meals_per_day=${mealsPerDay} | ingredient_level=${ingredientLevel}

# Recent activity (informational)
${activityBlock}

# Training week (fixed structure — only add coaching notes)
${trainingBlock}

# Output schema
{
  "summary": "<≤140 chars Czech, friendly>",
  "dailyCalories": ${macros.kcal},
  "macros": { "protein": ${macros.proteinG}, "carbs": ${macros.carbsG}, "fat": ${macros.fatG} },
  "mealPlan": [
    {
      "day": "Pondělí",
      "meals": [
        {
          "name": "<slot in Czech, e.g. Snídaně>",
          "title": "<Czech recipe title>",
          "ingredients": ["<amount + Czech name>"],
          "steps": ["<Czech instructions>"],
          "calories": 0, "protein": 0, "carbs": 0, "fat": 0,
          "prepTimeMinutes": 0
        }
      ]
    }
  ],
  "trainingPlan": [
    {
      "day": "Pondělí",
      "type": "<easy_run|tempo|intervals|long_run|recovery_run|strength|mobility|rest|cross_training|race>",
      "title": "<Czech>",
      "durationMinutes": 0,
      "intensity": "<easy|moderate|hard|rest>",
      "notes": "<Czech>"
    }
  ],
  "recommendations": ["<Czech, max 5>"],
  "warnings": ["<Czech if anything is borderline, otherwise empty array>"]
}

Rules:
- mealPlan: every meal's kcal must equal protein*4 + carbs*4 + fat*9 within ±10.
- Sum of one day's meal kcal must equal ${macros.kcal} within ±5 %.
- ${includeWeek ? `trainingPlan must have ${trainingPlan?.sessions.length ?? 7} entries; copy date/type/durationMinutes/intensity from the provided week and add Czech "notes" + "title".` : 'trainingPlan: copy fixed structure if provided, otherwise empty array.'}
- Output exactly one JSON object. No commentary.`;

  return { systemPrompt: SYSTEM_PROMPT, prompt };
}

// ── VALIDATION ───────────────────────────────────────────────────────────
//
// Hand-rolled validator (žádný Zod) — drobný, ale dostatečně přísný.
// Vrací { ok, value, errors }. Volající rozhodne, co s tím (retry / fallback).

/**
 * @param {unknown} raw
 * @param {MacroTargets} target
 */
export function validateAIPlanOutput(raw, target) {
  const errors = [];
  const obj = isObject(raw) ? raw : null;
  if (!obj) return { ok: false, value: null, errors: ['Odpověď není JSON objekt.'] };

  const value = {
    summary: asString(obj.summary, 'summary', errors) || '',
    dailyCalories: asNum(obj.dailyCalories, 'dailyCalories', errors),
    macros: validateMacros(obj.macros, errors),
    mealPlan: validateMealPlan(obj.mealPlan, errors),
    trainingPlan: validateTrainingPlan(obj.trainingPlan, errors),
    recommendations: asStringArray(obj.recommendations),
    warnings: asStringArray(obj.warnings),
  };

  // Macro sanity vs. target
  if (Math.abs(value.dailyCalories - target.kcal) > target.kcal * 0.07) {
    errors.push(`dailyCalories ${value.dailyCalories} mimo ±7 % cíle ${target.kcal}.`);
  }

  // Validace meal plan maker: každý den musí sedět
  value.mealPlan.forEach((day, i) => {
    const meals = (day.meals || []).map(m => ({
      kcal: m.calories, proteinG: m.protein, carbsG: m.carbs, fatG: m.fat,
    }));
    const check = validateMealPlanMacros(meals, target);
    if (!check.ok) {
      errors.push(`Den ${i + 1} (${day.day}): ${check.errors.join('; ')}`);
    }
  });

  return { ok: errors.length === 0, value, errors };
}

function validateMacros(raw, errors) {
  if (!isObject(raw)) {
    errors.push('macros chybí nebo není objekt.');
    return { protein: 0, carbs: 0, fat: 0 };
  }
  return {
    protein: asNum(raw.protein, 'macros.protein', errors),
    carbs: asNum(raw.carbs, 'macros.carbs', errors),
    fat: asNum(raw.fat, 'macros.fat', errors),
  };
}

function validateMealPlan(raw, errors) {
  if (!Array.isArray(raw)) {
    errors.push('mealPlan není pole.');
    return [];
  }
  return raw.map((day, i) => {
    if (!isObject(day)) {
      errors.push(`mealPlan[${i}] není objekt.`);
      return { day: '', meals: [] };
    }
    return {
      day: asString(day.day, `mealPlan[${i}].day`, errors) || '',
      meals: Array.isArray(day.meals) ? day.meals.map((meal, j) => validateMeal(meal, `mealPlan[${i}].meals[${j}]`, errors)) : [],
    };
  });
}

function validateMeal(raw, path, errors) {
  if (!isObject(raw)) {
    errors.push(`${path} není objekt.`);
    return { name: '', title: '', ingredients: [], steps: [], calories: 0, protein: 0, carbs: 0, fat: 0, prepTimeMinutes: 0 };
  }
  return {
    name: asString(raw.name, `${path}.name`, errors) || '',
    title: asString(raw.title, `${path}.title`, errors) || '',
    ingredients: asStringArray(raw.ingredients),
    steps: asStringArray(raw.steps),
    calories: asNum(raw.calories, `${path}.calories`, errors),
    protein: asNum(raw.protein, `${path}.protein`, errors),
    carbs: asNum(raw.carbs, `${path}.carbs`, errors),
    fat: asNum(raw.fat, `${path}.fat`, errors),
    prepTimeMinutes: asNum(raw.prepTimeMinutes, `${path}.prepTimeMinutes`, errors, { allowZero: true }),
  };
}

function validateTrainingPlan(raw, errors) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    errors.push('trainingPlan není pole.');
    return [];
  }
  return raw.map((s, i) => {
    if (!isObject(s)) {
      errors.push(`trainingPlan[${i}] není objekt.`);
      return null;
    }
    return {
      day: asString(s.day, `trainingPlan[${i}].day`, errors) || '',
      type: asString(s.type, `trainingPlan[${i}].type`, errors) || 'rest',
      title: asString(s.title, `trainingPlan[${i}].title`, errors) || '',
      durationMinutes: asNum(s.durationMinutes, `trainingPlan[${i}].durationMinutes`, errors, { allowZero: true }),
      intensity: asString(s.intensity, `trainingPlan[${i}].intensity`, errors) || 'easy',
      notes: typeof s.notes === 'string' ? s.notes : '',
    };
  }).filter(Boolean);
}

function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function asString(v, path, errors) {
  if (typeof v !== 'string') {
    errors.push(`${path} není string.`);
    return null;
  }
  return v.trim();
}

function asNum(v, path, errors, opts = {}) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || (!opts.allowZero && n < 0)) {
    errors.push(`${path} není kladné číslo (${v}).`);
    return 0;
  }
  return Math.round(n);
}

function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map(x => (typeof x === 'string' ? x.trim() : String(x ?? ''))).filter(Boolean);
}
