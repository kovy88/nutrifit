// ── AI RESPONSE HELPERS

// Sanitizace uživatelského vstupu před vložením do Gemini promptu.
// Brání prompt injection (jailbreak vzory, role override) a omezuje délku.
export function sanitizeUserPrompt(value, { maxLength = 500 } = {}) {
  if (value == null) return '';
  let s = String(value);

  // Odstraň trojité backticky a code-fence markery (uzavírají náš prompt block)
  s = s.replace(/```+/g, '');

  // Odstraň zjevné jailbreak fráze (case-insensitive). Záměrně konzervativní seznam.
  const jailbreakPatterns = [
    /ignore (all |previous |above |any )?(instructions|prompts?|rules?)/gi,
    /disregard (all |previous |above )?(instructions|prompts?)/gi,
    /system prompt/gi,
    /you are now/gi,
    /act as (a |an )?(developer|admin|root|system)/gi,
    /jailbreak/gi,
    /reveal (your |the )?(prompt|instructions|system)/gi,
    /forget (all |everything|previous)/gi,
    /\[INST\]|\[\/INST\]/gi,
    /<\|.*?\|>/g, // chat template markery
  ];
  jailbreakPatterns.forEach(re => { s = s.replace(re, ''); });

  // Zruš víc-řádkové sekvence (Gemini je vnímá jako oddělení)
  s = s.replace(/\r/g, '').replace(/\n{2,}/g, '\n').replace(/\n/g, ', ');

  // Whitespace cleanup
  s = s.replace(/\s+/g, ' ').trim();

  // Hard limit
  if (s.length > maxLength) s = s.slice(0, maxLength).trim() + '…';

  return s;
}

export function parseGeminiJSON(text, label = 'AI odpověď') {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error(`${label} je prázdná.`);
  }

  const cleaned = stripMarkdownFence(text.trim());
  try {
    return JSON.parse(cleaned);
  } catch {
    const extracted = extractJSONObject(cleaned);
    if (!extracted) throw new Error(`${label} není validní JSON.`);
    return JSON.parse(extracted);
  }
}

export function normalizeFoodEstimate(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Odhad z fotky nemá očekávaný formát.');
  }

  return {
    foodName: toText(raw.foodName, 'Neznámé jídlo'),
    portionGuess: toText(raw.portionGuess, 'porce nerozpoznána'),
    kcal: toInt(raw.kcal),
    protein: toInt(raw.protein),
    carbs: toInt(raw.carbs),
    fat: toInt(raw.fat),
    confidence: normalizeConfidence(raw.confidence),
    note: toText(raw.note, 'Odhad je pouze orientační. Přesnost závisí na fotce a velikosti porce.'),
  };
}

export function normalizeMealPlanResponse(raw, expectedCount) {
  const meals = raw?.meals;
  if (!Array.isArray(meals) || !meals.length) {
    throw new Error('AI nevrátila seznam jídel.');
  }
  if (expectedCount && meals.length !== expectedCount) {
    throw new Error(`AI vrátila ${meals.length} jídel místo ${expectedCount}.`);
  }
  return meals.map(normalizeMeal);
}

export function normalizeMeal(raw, index = 0) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Jídlo ${index + 1} nemá očekávaný formát.`);
  }

  const meal = {
    mealType: toText(raw.mealType, `Jídlo ${index + 1}`),
    name: toText(raw.name),
    kcal: toInt(raw.kcal),
    protein: toInt(raw.protein),
    carbs: toInt(raw.carbs),
    fat: toInt(raw.fat),
    fiber: toInt(raw.fiber),
    prepTime: toInt(raw.prepTime),
    difficulty: normalizeDifficulty(raw.difficulty),
    ingredients: toTextArray(raw.ingredients),
    steps: toTextArray(raw.steps),
  };

  if (!meal.name || !meal.kcal || !meal.ingredients.length || !meal.steps.length) {
    throw new Error(`Jídlo ${index + 1} neobsahuje název, makra, ingredience nebo postup.`);
  }

  return meal;
}

function stripMarkdownFence(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function extractJSONObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return '';
  return text.slice(start, end + 1);
}

function toText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

function toTextArray(value) {
  if (Array.isArray(value)) {
    return value.map(item => toText(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/\n|;/).map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeDifficulty(value) {
  const v = toText(value, 'Jednoduchá');
  return ['Jednoduchá', 'Střední', 'Náročná'].includes(v) ? v : 'Jednoduchá';
}

function normalizeConfidence(value) {
  const v = toText(value, 'střední').toLowerCase();
  return ['nízká', 'střední', 'vysoká'].includes(v) ? v : 'střední';
}
