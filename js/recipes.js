// ── INDIVIDUÁLNÍ NÁVRH JÍDELNÍČKU — generování, zobrazení receptů + recipe modal

import { appState, MEAL_NAMES } from './state.js';
import { buildShoppingList } from './shopping.js';
import { saveToHistory } from './profile.js';
import { getCurrentUser } from './auth.js';
import { checkAndIncrement } from './generation-limit.js';
import { normalizeMeal, normalizeMealPlanResponse, parseGeminiJSON } from './ai-utils.js?v=2';

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

  const likes    = document.getElementById('likes')?.value    || 'různá jídla';
  const dislikes = document.getElementById('dislikes')?.value || 'žádné omezení';
  const diet     = document.getElementById('diet-style')?.value;
  const names    = MEAL_NAMES[appState.mealCount];

  const systemPrompt = `# Role
Jsi NutriPlan AI — český výživový poradce a kreativní kuchař. Veškerý výstup je VÝHRADNĚ v češtině (ingredience, názvy, postup).

# Základní direktivy
1. MATEMATICKÁ PŘESNOST — Pro každé jídlo: kcal = bílkoviny×4 + sacharidy×4 + tuky×9. Tolerance ±5 kcal na jídlo. Součet maker všech jídel = denní cíl ±3 %.
2. REÁLNÉ GRAMÁŽE — Každá ingredience má přesné množství (např. "150g kuřecích prsou", "2 vejce", "30ml olivového oleje"). Gramáže musí odpovídat uvedeným makrům.
3. PRAKTIČNOST — Používej suroviny dostupné v českých supermarketech (Billa, Albert, Kaufland, Lidl). Uváděj realistické doby přípravy.
4. EDUKATIVNÍ POSTUP — Každý krok receptu je jasný a proveditelný i pro začátečníka. Uváděj teploty, časy a vizuální indikátory hotovosti.

# Dietní guardrails
- Pokud diet = "keto": sacharidy < 20g/den, ŽÁDNÉ obiloviny, brambory, ovoce s vysokým GI.
- Pokud diet = "vegan": ŽÁDNÉ živočišné produkty (maso, vejce, mléko, med, sýr). Bílkoviny z luštěnin, tofu, tempeh, seitan.
- Pokud diet = "bezlepkové": ŽÁDNÁ pšenice, žito, ječmen, špalda. Povoleno: rýže, kukuřice, pohanka, brambory, bezlepkové ovesné vločky.
- Pokud diet = "vegetariánské": žádné maso ani ryby, ale vejce a mléčné výrobky jsou OK.

# Myšlenkový postup (interní, nevypisuj)
Pro každé jídlo si nejdřív spočítej:
1. Rozděl denní makra mezi jídla podle typu (snídaně ~20-25%, oběd ~30-35%, svačiny ~10-15%, večeře ~25-30%).
2. Zvol hlavní zdroj bílkovin → spočítej jeho gramáž z cílového proteinu.
3. Doplň sacharidový zdroj → spočítej gramáž.
4. Doplň tukový zdroj → spočítej gramáž.
5. Ověř: protein×4 + carbs×4 + fat×9 = kcal (±5 kcal).

# Diverzita a struktura
- Hlavní zdroj bílkovin se NESMÍ opakovat ve dvou jídlech (např. ne 2× kuřecí prsa).
- Přílohy musí být pestré (ne 2× rýže — střídej rýži, brambory, těstoviny, kuskus, bulgur, quinoa dle levelu).
- Každé hlavní jídlo musí mít jiný typ zeleniny.
- Střídej textury: křupavé + krémové, teplé + studené.
- Doba přípravy: snídaně max 15 min, svačiny max 10 min, oběd/večeře max 45 min.

# Vrátíš POUZE validní JSON bez dalšího textu.`;

  const levelDesc = appState.ingredientLevel === 'úsporný'
    ? `ÚSPORNÝ level (max ~80 Kč/porci):
POVOLENO: vejce, čočka, fazole, cizrna, hrách, mražená zelenina, mrkev, cibule, zelí, rajčata, rýže, těstoviny, ovesné vločky, tvaroh, mléko, bílý jogurt, banány, jablka, chléb, brambory, tuňák v konzervě, kuřecí stehna, vepřové maso.
ZAKÁZÁNO: losos, avokádo, hovězí svíčková, quinoa, granola, kokosové mléko, kešu ořechy, pistácie, mango, borůvky mimo sezónu, dražší sýry než eidam.
PRAVIDLA: Upřednostňuj sezónní suroviny. Luštěniny jako hlavní zdroj bílkovin min. 2× denně. Mražená zelenina je OK.`
    : appState.ingredientLevel === 'gourmet'
    ? `GOURMET level (cena není omezena):
POVOLENO: losos, čerstvý tuňák, avokádo, hovězí entrecôte, telecí, jehněčí, mango, granola, řecký jogurt, quinoa, para ořechy, kešu, pistácie, chia semínka, olivový olej extra virgin, parmazán, mozzarella buffalo, tahini, kokosové mléko, čerstvé bylinky, šampaňské houby.
VYHNI SE: průmyslovým polotovarům, instantním jídlům, levným náhražkám.
PRAVIDLA: Důraz na prezentaci a chuťovou komplexitu. Používej čerstvé bylinky a koření. Každé jídlo má mít "wow" faktor.`
    : `STANDARD level (80–200 Kč/porci):
POVOLENO: kuřecí prsa, kuřecí stehna, vepřová panenka, tuňák v konzervě, sezónní zelenina, celozrnné pečivo, jogurt, sýr eidam nebo gouda, brambory, ovoce, rýže, těstoviny, vejce, tvaroh, cottage, ovesné vločky.
VYHNI SE: prémiové suroviny (losos, avokádo, quinoa) i velmi levné náhražky.
PRAVIDLA: Vyvážený poměr cena/kvalita. Sezónní ovoce a zelenina. Střídej živočišné a rostlinné zdroje bílkovin.`;

  const prompt = `Vytvoř jídelníček na 1 den s přesně ${appState.mealCount} jídly.

DENNÍ CÍLE: ${appState.macros.kcal} kcal | Bílkoviny: ${appState.macros.protein}g | Sacharidy: ${appState.macros.carbs}g | Tuky: ${appState.macros.fat}g
OSOBA: ${appState.macros.gender === 'muz' ? 'Muž' : 'Žena'}, ${appState.macros.age} let, ${appState.macros.weight} kg | CÍL: ${appState.macros.goal}
STRAVOVÁNÍ: ${diet} | OBLÍBENÁ JÍDLA: ${likes} | NEMÁ RÁD/ALERGIE: ${dislikes}
LEVEL SUROVIN: ${levelDesc}
JÍDLA: ${names.join(', ')}

POŽADAVKY NA MAKRA:
- Součet kcal všech jídel = ${appState.macros.kcal} ±3%
- Součet bílkovin = ${appState.macros.protein}g ±5%
- U každého jídla ověř: kcal = protein×4 + carbs×4 + fat×9 (±5 kcal)
- Rozděl kalorie: snídaně ~20-25%, oběd ~30-35%, svačiny ~10-15%, večeře ~25-30%

FORMÁT — vrať POUZE validní JSON:
{"meals":[{"mealType":"Snídaně","name":"Český název","kcal":450,"protein":30,"carbs":45,"fat":12,"fiber":8,"prepTime":10,"difficulty":"Jednoduchá","ingredients":["200g ovesných vloček","300ml mléka"],"steps":["Krok 1.","Krok 2."]}]}

PRAVIDLA:
- difficulty: "Jednoduchá" | "Střední" | "Náročná"
- prepTime: celé číslo v minutách (snídaně max 15, svačiny max 10, hlavní jídla max 45)
- fiber: vláknina v gramech (celé číslo)
- ingredients: formát "množství + název" (např. "150g kuřecích prsou", "2 vejce")
- steps: jasné kroky s teplotami a časy (např. "Předehřej troubu na 200°C.", "Opékej 3 minuty do zlatova.")
- Pokryj přesně: ${names.join(', ')}
- Hlavní bílkovina se NESMÍ opakovat ve dvou jídlech
- VEŠKERÝ text česky, ŽÁDNÁ angličtina`;

  try {
    const text = await callGemini(systemPrompt, prompt, 3500);
    const parsed = parseGeminiJSON(text, 'Jídelníček');
    appState.currentRecipes = normalizeMealPlanResponse(parsed, appState.mealCount).map(fixMacros);
    renderList(out, appState.currentRecipes);
    buildShoppingList(appState.currentRecipes);
    saveToHistory(appState.currentRecipes);
    setStepFn('done');
    window.dispatchEvent(new CustomEvent('mealplan:ready'));
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

  const likes    = document.getElementById('likes')?.value    || 'různá jídla';
  const dislikes = document.getElementById('dislikes')?.value || 'žádné omezení';
  const diet     = document.getElementById('diet-style')?.value;
  const usedNames = appState.currentRecipes.filter((_, i) => i !== index).map(m => m.name).join(', ');

  const systemPrompt = `Jsi NutriPlan AI — český výživový poradce. Veškerý text česky. Vrátíš POUZE validní JSON bez dalšího textu.
Pravidla: kcal = bílkoviny×4 + sacharidy×4 + tuky×9 (tolerance ±5 kcal). Reálné gramáže ingrediencí. Praktické postupy s teplotami a časy.`;

  const levelDescSwap = appState.ingredientLevel === 'úsporný'
    ? 'ÚSPORNÝ level — levné suroviny: vejce, luštěniny, mražená zelenina, rýže, ovesné vločky, tvaroh, banány. ŽÁDNÉ drahé suroviny (losos, avokádo, quinoa).'
    : appState.ingredientLevel === 'gourmet'
    ? 'GOURMET level — prémiové suroviny povoleny: losos, avokádo, hovězí, mango, quinoa, ořechy, řecký jogurt, čerstvé bylinky. Důraz na chuťovou komplexitu.'
    : 'STANDARD level — kuřecí maso, vejce, sezónní zelenina, celozrnné pečivo, jogurt, sýr, brambory, ovoce. Vyvážený poměr cena/kvalita.';

  const prompt = `Navrhni JEDNO alternativní jídlo místo "${meal.name}" (${meal.mealType}).

CÍLOVÉ MAKRA: kcal: ${meal.kcal} | Bílkoviny: ${meal.protein}g | Sacharidy: ${meal.carbs}g | Tuky: ${meal.fat}g
STRAVOVÁNÍ: ${diet} | OBLÍBENÁ JÍDLA: ${likes} | NEMÁ RÁD/ALERGIE: ${dislikes}
LEVEL SUROVIN: ${levelDescSwap}
NESMÍ SE OPAKOVAT (už v jídelníčku): ${usedNames || 'žádné omezení'}

POŽADAVKY:
- Makra musí odpovídat cíli: kcal = protein×4 + carbs×4 + fat×9 (±5 kcal)
- Jiný hlavní zdroj bílkovin než původní jídlo
- Ingredience s přesnými gramážemi
- Postup s teplotami a časy
- prepTime: max 15 min (snídaně/svačina), max 45 min (oběd/večeře)

Vrať POUZE validní JSON, vše česky:
{"mealType":"${meal.mealType}","name":"Český název","kcal":${meal.kcal},"protein":${meal.protein},"carbs":${meal.carbs},"fat":${meal.fat},"fiber":6,"prepTime":15,"difficulty":"Jednoduchá","ingredients":["150g ingredience"],"steps":["Krok s teplotou a časem."]}
ŽÁDNÁ angličtina.`;

  try {
    const text = await callGemini(systemPrompt, prompt, 1200);
    const newMeal = fixMacros(normalizeMeal(parseGeminiJSON(text, 'Alternativní jídlo'), index));
    appState.currentRecipes[index] = newMeal;

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
        <button class="swap-btn" data-idx="${i}">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 7c0-2.76 2.24-5 5-5 1.55 0 2.94.7 3.88 1.8M12 7c0 2.76-2.24 5-5 5-1.55 0-2.94-.7-3.88-1.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10.5 2.5L12 4l-1.5 1.5M3.5 11.5L2 10l1.5-1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Vyměnit jídlo
        </button>
      </div>`;

    item.querySelector('.recipe-row').addEventListener('click', () => openRecipe(i));
    item.querySelector('.swap-btn').addEventListener('click', () => swapMeal(i));
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
