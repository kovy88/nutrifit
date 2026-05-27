// ── INDIVIDUÁLNÍ NÁVRH JÍDELNÍČKU — generování, zobrazení receptů + recipe modal

import { appState, MEAL_NAMES } from './state.js?v=8';
import { buildShoppingList } from './shopping.js?v=8';
import { saveToHistory } from './profile.js?v=8';
import { getCurrentUser } from './auth.js?v=8';
import { checkAndIncrement } from './generation-limit.js?v=8';
import { normalizeMeal, normalizeMealPlanResponse, parseGeminiJSON, sanitizeUserPrompt } from './ai-utils.js?v=8';
import { dateKey } from './tracking-store.js?v=8';

// ── GOOGLE GEMINI API — volání přes serverless proxy /api/generate
// API klíč je uložen jako env proměnná na serveru (Vercel), nikdy nedorazí do prohlížeče

async function callGemini(systemPrompt, prompt, maxTokens = 3500) {
  let res;
  try {
    res = await fetch('/api/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, prompt, maxTokens }),
    });
  } catch {
    throw new Error('Nepodařilo se připojit k serveru. Zkontroluj připojení k internetu.');
  }
  if (!res.ok) throw new Error(`Chyba serveru (${res.status}). Zkus to znovu za chvíli.`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Chyba při generování.');
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('AI nevrátila žádnou odpověď. Zkus to znovu.');
  return text;
}

// ── LOADING SKELETON
function buildSkeletonHTML(count) {
  const cards = Array.from({ length: count }, (_, i) => `
    <div class="skeleton-card" style="animation-delay:${i * 0.08}s">
      <div class="skeleton-badge skel-pulse"></div>
      <div class="skeleton-title skel-pulse"></div>
      <div class="skeleton-meta"><div class="skeleton-tag skel-pulse"></div><div class="skeleton-tag skel-pulse"></div><div class="skeleton-tag skel-pulse"></div></div>
    </div>`).join('');
  return `<div class="skeleton-list">${cards}</div>`;
}

// ── OPRAVA MAKER (přepočítá kcal ze skutečných maker)
function fixMacros(meal) {
  meal.kcal = Math.round((meal.protein || 0) * 4 + (meal.carbs || 0) * 4 + (meal.fat || 0) * 9);
  return meal;
}

function plannedMealId(meal, index) {
  const day = appState.selectedDate || dateKey();
  const slug = `${meal.mealType || 'jidlo'}-${meal.name || index}`
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${day}-${index}-${slug}`;
}

function withPlannedMealIds(meals) {
  return meals.map((meal, index) => ({ ...meal, plannedMealId: meal.plannedMealId || plannedMealId(meal, index) }));
}

// ── GENEROVÁNÍ JÍDELNÍČKU

export async function generateMealPlan(setStepFn) {
  // ── Přihlášení je bonus pro historii/premium limity, ne bariéra pro školní demo
  const user = getCurrentUser();
  if (user) {
    const limitResult = await checkAndIncrement();
    if (limitResult && !limitResult.allowed) {
      window.dispatchEvent(new CustomEvent('paywall:show', { detail: limitResult }));
      return;
    }
    if (limitResult) window.dispatchEvent(new CustomEvent('usage:update', { detail: limitResult }));
  }

  const sec = document.getElementById('meal-plan-section');
  const out = document.getElementById('meal-plan-output');
  sec.style.display = 'block';
  sec.style.animation = 'slideIn 0.42s ease both';
  out.innerHTML = buildSkeletonHTML(appState.mealCount);
  setStepFn(3);
  setTimeout(() => sec.scrollIntoView({ behavior: 'smooth' }), 100);

  const likes    = sanitizeUserPrompt(document.getElementById('likes')?.value)    || 'varied meals';
  const dislikes = sanitizeUserPrompt(document.getElementById('dislikes')?.value) || 'no restrictions';
  const diet     = sanitizeUserPrompt(document.getElementById('diet-style')?.value, { maxLength: 50 });
  const names    = MEAL_NAMES[appState.mealCount];

  const systemPrompt = `# Role
You are NutriPlan AI, a Czech nutrition assistant and creative cook. All user-facing output MUST be in Czech only: ingredient names, meal names, recipe steps, notes, and labels.

# Core directives
1. MATHEMATICAL ACCURACY — For every meal: kcal = protein×4 + carbs×4 + fat×9. Tolerance: ±5 kcal per meal. The sum of all meal macros must match the daily target within ±3%.
2. REALISTIC QUANTITIES — Every ingredient must have an exact amount, for example "150g kuřecích prsou", "2 vejce", "30ml olivového oleje". The quantities must match the listed macros.
3. PRACTICALITY — Use ingredients commonly available in Czech supermarkets such as Billa, Albert, Kaufland, and Lidl. Use realistic preparation times.
4. EDUCATIONAL STEPS — Every recipe step must be clear and doable for a beginner. Include temperatures, times, and visual doneness cues.

# Diet guardrails
- If diet = "keto": carbs < 20g/day; NO grains, potatoes, or high-GI fruit.
- If diet = "vegan": NO animal products: meat, eggs, milk, honey, cheese. Use protein from legumes, tofu, tempeh, and seitan.
- If diet = "bezlepkové": NO wheat, rye, barley, or spelt. Allowed: rice, corn, buckwheat, potatoes, and gluten-free oats.
- If diet = "vegetariánské": no meat or fish, but eggs and dairy are OK.

# Internal reasoning process (do not output)
For each meal, first calculate:
1. Split daily macros across meal types: breakfast ~20-25%, lunch ~30-35%, snacks ~10-15%, dinner ~25-30%.
2. Pick the main protein source and calculate its quantity from the target protein.
3. Add the carbohydrate source and calculate its quantity.
4. Add the fat source and calculate its quantity.
5. Verify: protein×4 + carbs×4 + fat×9 = kcal (±5 kcal).

# Diversity and structure
- The main protein source MUST NOT repeat across two meals, for example do not use chicken breast twice.
- Side dishes must be varied: do not use rice twice; rotate rice, potatoes, pasta, couscous, bulgur, or quinoa depending on the ingredient level.
- Every main meal must use a different type of vegetable.
- Vary textures: crunchy + creamy, hot + cold.
- Preparation time: breakfast max 15 min, snacks max 10 min, lunch/dinner max 45 min.

# Return ONLY valid JSON with no extra text.`;

  const levelDesc = appState.ingredientLevel === 'úsporný'
    ? `BUDGET level (max ~80 CZK/serving):
ALLOWED: eggs, lentils, beans, chickpeas, peas, frozen vegetables, carrots, onions, cabbage, tomatoes, rice, pasta, oats, quark/tvaroh, milk, plain yogurt, bananas, apples, bread, potatoes, canned tuna, chicken thighs, pork.
FORBIDDEN: salmon, avocado, beef tenderloin, quinoa, granola, coconut milk, cashews, pistachios, mango, out-of-season blueberries, cheeses more expensive than eidam.
RULES: Prefer seasonal ingredients. Use legumes as the main protein source at least twice per day. Frozen vegetables are OK.`
    : appState.ingredientLevel === 'gourmet'
    ? `GOURMET level (price is not limited):
ALLOWED: salmon, fresh tuna, avocado, beef entrecote, veal, lamb, mango, granola, Greek yogurt, quinoa, Brazil nuts, cashews, pistachios, chia seeds, extra virgin olive oil, parmesan, buffalo mozzarella, tahini, coconut milk, fresh herbs, champignon mushrooms.
AVOID: industrial processed foods, instant meals, cheap substitutes.
RULES: Emphasize presentation and flavor complexity. Use fresh herbs and spices. Every meal should have a "wow" factor.`
    : `STANDARD level (80-200 CZK/serving):
ALLOWED: chicken breast, chicken thighs, pork tenderloin, canned tuna, seasonal vegetables, wholegrain bread, yogurt, eidam or gouda cheese, potatoes, fruit, rice, pasta, eggs, quark/tvaroh, cottage cheese, oats.
AVOID: premium ingredients such as salmon, avocado, and quinoa, as well as very cheap substitutes.
RULES: Balance price and quality. Use seasonal fruit and vegetables. Rotate animal and plant protein sources.`;

  const prompt = `Create a 1-day meal plan with exactly ${appState.mealCount} meals.

DAILY TARGETS: ${appState.macros.kcal} kcal | Protein: ${appState.macros.protein}g | Carbs: ${appState.macros.carbs}g | Fat: ${appState.macros.fat}g
PERSON: ${appState.macros.gender === 'muz' ? 'Male' : 'Female'}, ${appState.macros.age} years old, ${appState.macros.weight} kg | GOAL: ${appState.macros.goal}
DIET: ${diet} | LIKED FOODS: ${likes} | DISLIKES/ALLERGIES: ${dislikes}
INGREDIENT LEVEL: ${levelDesc}
MEALS: ${names.join(', ')}

MACRO REQUIREMENTS:
- Sum of kcal across all meals = ${appState.macros.kcal} ±3%
- Sum of protein = ${appState.macros.protein}g ±5%
- For every meal, verify: kcal = protein×4 + carbs×4 + fat×9 (±5 kcal)
- Split calories: breakfast ~20-25%, lunch ~30-35%, snacks ~10-15%, dinner ~25-30%

FORMAT — return ONLY valid JSON:
{"meals":[{"mealType":"Snídaně","name":"Český název","kcal":450,"protein":30,"carbs":45,"fat":12,"fiber":8,"prepTime":10,"difficulty":"Jednoduchá","ingredients":["200g ovesných vloček","300ml mléka"],"steps":["Krok 1.","Krok 2."]}]}

RULES:
- Output all user-facing JSON string values in Czech only. Do not use English in meal names, ingredient names, steps, notes, or labels.
- difficulty must be one of: "Jednoduchá" | "Střední" | "Náročná"
- prepTime: integer in minutes (breakfast max 15, snacks max 10, main meals max 45)
- fiber: fiber in grams as an integer
- ingredients: use the format "amount + name", for example "150g kuřecích prsou", "2 vejce"
- steps: clear Czech steps with temperatures and times, for example "Předehřej troubu na 200°C.", "Opékej 3 minuty do zlatova."
- Cover exactly these meals: ${names.join(', ')}
- The main protein source MUST NOT repeat across two meals`;

  try {
    const text = await callGemini(systemPrompt, prompt, 3500);
    const parsed = parseGeminiJSON(text, 'Jídelníček');
    appState.currentRecipes = withPlannedMealIds(normalizeMealPlanResponse(parsed, appState.mealCount).map(fixMacros));
    renderList(out, appState.currentRecipes);
    buildShoppingList(appState.currentRecipes);
    saveToHistory(appState.currentRecipes);
    setStepFn('done');
    window.dispatchEvent(new CustomEvent('mealplan:ready', { detail: { meals: appState.currentRecipes } }));
  } catch (err) {
    const msg = err instanceof SyntaxError
      ? 'AI vrátila neplatnou odpověď.'
      : (err.message || 'Chyba při generování.');
    out.innerHTML = `<div class="error-box">
      <div>${esc(msg)}</div>
      <button class="error-retry-btn" id="error-retry-btn">Zkusit znovu</button>
    </div>`;
    document.getElementById('error-retry-btn')?.addEventListener('click', () => generateMealPlan(setStepFn));
  }
}

// ── VYMĚNIT JÍDLO

export async function swapMeal(index) {
  // ── Limit check pro přihlášené; anonymní demo může vyměnit jídlo bez účtu
  const swapUser = getCurrentUser();
  if (swapUser) {
    const swapLimit = await checkAndIncrement();
    if (swapLimit && !swapLimit.allowed) {
      window.dispatchEvent(new CustomEvent('paywall:show', { detail: swapLimit }));
      return;
    }
    if (swapLimit) window.dispatchEvent(new CustomEvent('usage:update', { detail: swapLimit }));
  }

  const item = document.getElementById(`recipe-item-${index}`);
  const btn  = item.querySelector('.swap-btn');
  const meal = appState.currentRecipes[index];

  item.classList.add('swapping');
  btn.classList.add('loading');
  btn.innerHTML = `<div class="spinner-wrap" style="width:14px;height:14px;margin:0;"></div> Hledám alternativu…`;

  const likes    = sanitizeUserPrompt(document.getElementById('likes')?.value)    || 'varied meals';
  const dislikes = sanitizeUserPrompt(document.getElementById('dislikes')?.value) || 'no restrictions';
  const diet     = sanitizeUserPrompt(document.getElementById('diet-style')?.value, { maxLength: 50 });
  const usedNames = appState.currentRecipes.filter((_, i) => i !== index).map(m => m.name).join(', ');

  const systemPrompt = `You are NutriPlan AI, a Czech nutrition assistant. Return ONLY valid JSON with no extra text. All user-facing JSON string values must be in Czech only.
Rules: kcal = protein×4 + carbs×4 + fat×9 (tolerance ±5 kcal). Use realistic ingredient quantities. Recipe steps must be practical and include temperatures and times.`;

  const levelDescSwap = appState.ingredientLevel === 'úsporný'
    ? 'BUDGET level — cheap ingredients: eggs, legumes, frozen vegetables, rice, oats, quark/tvaroh, bananas. NO expensive ingredients such as salmon, avocado, or quinoa.'
    : appState.ingredientLevel === 'gourmet'
    ? 'GOURMET level — premium ingredients are allowed: salmon, avocado, beef, mango, quinoa, nuts, Greek yogurt, fresh herbs. Emphasize flavor complexity.'
    : 'STANDARD level — chicken, eggs, seasonal vegetables, wholegrain bread, yogurt, cheese, potatoes, fruit. Balance price and quality.';

  const prompt = `Suggest ONE alternative meal to replace "${meal.name}" (${meal.mealType}).

TARGET MACROS: kcal: ${meal.kcal} | Protein: ${meal.protein}g | Carbs: ${meal.carbs}g | Fat: ${meal.fat}g
DIET: ${diet} | LIKED FOODS: ${likes} | DISLIKES/ALLERGIES: ${dislikes}
INGREDIENT LEVEL: ${levelDescSwap}
MUST NOT REPEAT (already in the meal plan): ${usedNames || 'no restrictions'}

REQUIREMENTS:
- Macros must match the target: kcal = protein×4 + carbs×4 + fat×9 (±5 kcal)
- Use a different main protein source than the original meal
- Ingredients must include exact quantities
- Steps must include temperatures and times
- prepTime: max 15 min for breakfast/snack, max 45 min for lunch/dinner
- Output all user-facing JSON string values in Czech only

Return ONLY valid JSON:
{"mealType":"${meal.mealType}","name":"Český název","kcal":${meal.kcal},"protein":${meal.protein},"carbs":${meal.carbs},"fat":${meal.fat},"fiber":6,"prepTime":15,"difficulty":"Jednoduchá","ingredients":["150g ingredience"],"steps":["Krok s teplotou a časem."]}
Do not include any English in the JSON string values.`;

  try {
    const text = await callGemini(systemPrompt, prompt, 1200);
    const newMeal = fixMacros(normalizeMeal(parseGeminiJSON(text, 'Alternativní jídlo'), index));
    appState.currentRecipes[index] = { ...newMeal, plannedMealId: plannedMealId(newMeal, index) };

    item.style.transition = 'opacity 0.2s,transform 0.2s';
    item.style.opacity    = '0';
    item.style.transform  = 'translateX(10px)';
    setTimeout(() => {
      renderList(document.getElementById('meal-plan-output'), appState.currentRecipes);
      const newItem = document.getElementById(`recipe-item-${index}`);
      if (newItem) {
        newItem.style.opacity = '0';
        newItem.style.transform = 'translateX(-10px)';
        newItem.style.transition = 'opacity 0.25s,transform 0.25s';
        requestAnimationFrame(() => { newItem.style.opacity = '1'; newItem.style.transform = 'translateX(0)'; });
      }
      window.dispatchEvent(new CustomEvent('mealplan:updated', { detail: { meals: appState.currentRecipes } }));
    }, 200);
  } catch (err) {
    item.classList.remove('swapping');
    btn.classList.remove('loading');
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 7c0-2.76 2.24-5 5-5 1.55 0 2.94.7 3.88 1.8M12 7c0 2.76-2.24 5-5 5-1.55 0-2.94-.7-3.88-1.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10.5 2.5L12 4l-1.5 1.5M3.5 11.5L2 10l1.5-1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Chyba – zkus znovu`;
  }
}

// ── RENDER SEZNAM JÍDEL

export function renderList(container, meals) {
  const list = document.createElement('div');
  list.className = 'recipe-list';

  meals.forEach((meal, i) => {
    const item = document.createElement('div');
    item.className = 'recipe-item';
    item.id = `recipe-item-${i}`;
    const diffC = diffColor(meal.difficulty);
    const logged = (appState.foodLog || []).some(entry => entry.plannedMealId === meal.plannedMealId);

    item.innerHTML = `
      <button class="recipe-row" data-idx="${i}">
        <div class="recipe-row-body">
          <span class="recipe-meal-badge">${esc(meal.mealType)}</span>
          <span class="recipe-name">${esc(meal.name)}</span>
        </div>
        <span class="recipe-arrow"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </button>
      <div class="recipe-meta">
        <span class="recipe-kcal-tag">${esc(meal.kcal)} kcal</span>
        <span class="recipe-meta-sep"></span>
        <span class="recipe-meta-tag">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 4.5V7l1.5 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          ${esc(meal.prepTime)} min
        </span>
        <span class="recipe-meta-sep"></span>
        <span class="recipe-meta-tag">
          <span class="difficulty-dot" style="background:${diffC}"></span>
          ${esc(meal.difficulty)}
        </span>
      </div>
      <div class="recipe-footer">
        <button class="eat-btn ${logged ? 'logged' : ''}" data-eat-idx="${i}" ${logged ? 'disabled' : ''}>
          ${logged ? 'Zapsáno' : 'Snědl jsem'}
        </button>
        <button class="swap-btn" data-idx="${i}">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 7c0-2.76 2.24-5 5-5 1.55 0 2.94.7 3.88 1.8M12 7c0 2.76-2.24 5-5 5-1.55 0-2.94-.7-3.88-1.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10.5 2.5L12 4l-1.5 1.5M3.5 11.5L2 10l1.5-1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Vyměnit jídlo
        </button>
      </div>`;

    item.querySelector('.recipe-row').addEventListener('click', () => openRecipe(i));
    item.querySelector('.swap-btn').addEventListener('click', () => swapMeal(i));
    item.querySelector('.eat-btn').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('tracking:add-planned-meal', { detail: { meal, index: i } }));
    });
    list.appendChild(item);
  });

  container.innerHTML = '';
  container.appendChild(list);
}

// ── RECIPE MODAL

export function openRecipe(i) {
  const meal    = appState.currentRecipes[i];
  const modal   = document.getElementById('recipe-modal');
  const content = document.getElementById('modal-content');
  content.style.display = 'block';

  document.getElementById('modal-meal-type').textContent = meal.mealType;
  document.getElementById('modal-title').textContent     = meal.name;
  document.getElementById('modal-macros').innerHTML = `
    <div class="modal-macro-pill"><div class="modal-macro-dot" style="background:var(--blue)"></div>${esc(meal.kcal)} kcal</div>
    <div class="modal-macro-pill"><div class="modal-macro-dot" style="background:var(--red)"></div>${esc(meal.protein)}g bílkoviny</div>
    <div class="modal-macro-pill"><div class="modal-macro-dot" style="background:var(--orange)"></div>${esc(meal.carbs)}g sacharidy</div>
    <div class="modal-macro-pill"><div class="modal-macro-dot" style="background:var(--green)"></div>${esc(meal.fat)}g tuky</div>`;

  const diffC = diffColor(meal.difficulty || 'Jednoduchá');
  document.getElementById('modal-info-row').innerHTML = `
    <div class="modal-info-chip">
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 4.5V7l1.5 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      Příprava: <strong>${esc(meal.prepTime) || '?'} min</strong>
    </div>
    <div class="modal-info-chip">
      <span class="modal-difficulty-dot" style="background:${diffC}"></span>
      Náročnost: <strong>${esc(meal.difficulty) || '—'}</strong>
    </div>`;

  document.getElementById('modal-body').innerHTML =
    `<h3>Ingredience</h3><ul>${(meal.ingredients || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` +
    `<h3>Postup</h3><ol>${(meal.steps || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeRecipeModal() {
  document.getElementById('recipe-modal')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ── HELPERS

function diffColor(d) {
  return d === 'Jednoduchá' ? '#30d158' : d === 'Střední' ? '#ff9f0a' : '#ff3b30';
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
