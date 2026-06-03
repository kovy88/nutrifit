// ── INDIVIDUÁLNÍ NÁVRH JÍDELNÍČKU — generování, zobrazení receptů + recipe modal

import { appState, MEAL_NAMES } from './state.js?v=9';
import { buildShoppingList } from './shopping.js?v=9';
import { saveToHistory } from './profile.js?v=9';
import { getCurrentUser } from './auth.js?v=8';
import { checkAndIncrement } from './generation-limit.js?v=8';
import { normalizeMeal, normalizeMealPlanResponse, parseGeminiJSON, sanitizeUserPrompt } from './ai-utils.js?v=8';
import { dateKey } from './tracking-store.js?v=8';
import { buildAIPlanPrompt, validateAIPlanOutput } from './services/ai-plan-service.js?v=1';

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

  const goalToDomain = (g) => ({
    'hubnutí': 'fat_loss',
    'udržení': 'maintenance',
    'nabírání': 'muscle_gain',
    fat_loss: 'fat_loss',
    maintenance: 'maintenance',
    muscle_gain: 'muscle_gain',
    endurance: 'endurance',
    general_fitness: 'general_fitness',
  })[g] || 'maintenance';

  const readWizardTrainingGoal = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem('nutriplan-training-goal') || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  };

  const wizardGoal = readWizardTrainingGoal();
  const inputPromptData = {
    profile: {
      sex: appState.macros.gender === 'muz' ? 'male' : 'female',
      ageYears: Number(appState.macros.age || 30),
      heightCm: Number(appState.macros.height || 175),
      weightKg: Number(appState.macros.weight || 70),
      diet: diet,
      likes: likes.split(',').map(x => x.trim()).filter(Boolean),
      dislikes: dislikes.split(',').map(x => x.trim()).filter(Boolean),
    },
    nutritionGoal: { kind: goalToDomain(appState.macros.goal || appState.goal) },
    trainingGoal: wizardGoal ? { kind: wizardGoal.trainingGoal } : null,
    macros: {
      kcal: appState.macros.kcal,
      proteinG: appState.macros.protein,
      carbsG: appState.macros.carbs,
      fatG: appState.macros.fat,
      fiberG: appState.macros.fiber,
      waterMl: appState.macros.waterGoalMl || appState.waterGoalMl || 0,
      bmr: appState.macros.bmr || 0,
      tdee: appState.macros.tdee || 0,
    },
    options: {
      mealsPerDay: appState.mealCount,
      ingredientLevel: appState.ingredientLevel || 'standard',
      includeWeek: false,
    }
  };

  const { systemPrompt, prompt } = buildAIPlanPrompt(inputPromptData);

  try {
    const text = await callGemini(systemPrompt, prompt, 3500);
    const parsed = parseGeminiJSON(text, 'Jídelníček');
    
    // Validate output using domain validator
    const validation = validateAIPlanOutput(parsed, inputPromptData.macros);
    if (!validation.ok) {
      console.warn('AI validation errors:', validation.errors);
      localStorage.setItem('nutriplan-ai-retry-count', String(Number(localStorage.getItem('nutriplan-ai-retry-count') || 0) + 1));
      throw new Error(`Validační chyba AI výstupu: ${validation.errors[0]}`);
    }

    const dayPlan = validation.value.mealPlan[0];
    const meals = dayPlan.meals.map((m, idx) => ({
      mealType: m.name || names[idx] || 'Jídlo',
      name: m.title || 'Recept',
      kcal: m.calories,
      protein: m.protein,
      carbs: m.carbs,
      fat: m.fat,
      fiber: m.calories > 0 ? Math.round(m.calories * 0.01) : 4,
      prepTime: m.prepTimeMinutes || 15,
      difficulty: m.calories > 500 ? 'Střední' : 'Jednoduchá',
      ingredients: m.ingredients || [],
      steps: m.steps || [],
    }));

    appState.currentRecipes = withPlannedMealIds(meals.map(fixMacros));
    renderList(out, appState.currentRecipes);
    buildShoppingList(appState.currentRecipes);
    saveToHistory(appState.currentRecipes);
    setStepFn('done');
    window.dispatchEvent(new CustomEvent('mealplan:ready', { detail: { meals: appState.currentRecipes } }));
  } catch (err) {
    const msg = err instanceof SyntaxError
      ? 'AI vrátila neplatný JSON formát.'
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

  const systemPrompt = `You are Trenr AI, a Czech nutrition assistant. Return ONLY valid JSON with no extra text. All user-facing JSON string values must be in Czech only.
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
