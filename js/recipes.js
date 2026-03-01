// ── INDIVIDUÁLNÍ NÁVRH JÍDELNÍČKU — generování, zobrazení receptů + recipe modal

import { appState, MEAL_NAMES } from './state.js';
import { buildShoppingList } from './shopping.js';
import { saveToHistory } from './profile.js';

// ── GOOGLE GEMINI API — volání přes serverless proxy /api/generate
// API klíč je uložen jako env proměnná na serveru (Vercel), nikdy nedorazí do prohlížeče

async function callGemini(systemPrompt, prompt, maxTokens = 2000) {
  const res = await fetch('/api/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt, prompt, maxTokens }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates[0].content.parts[0].text.trim();
}

// ── OPRAVA MAKER (přepočítá kcal ze skutečných maker)
function fixMacros(meal) {
  meal.kcal = Math.round((meal.protein || 0) * 4 + (meal.carbs || 0) * 4 + (meal.fat || 0) * 9);
  return meal;
}

// ── GENEROVÁNÍ JÍDELNÍČKU

export async function generateMealPlan(setStepFn) {
  const sec = document.getElementById('meal-plan-section');
  const out = document.getElementById('meal-plan-output');
  sec.style.display = 'block';
  sec.style.animation = 'slideIn 0.42s ease both';
  out.innerHTML = '<div class="loading"><div class="spinner-wrap"></div>Generuji jídelníček…</div>';
  setStepFn(3);
  setTimeout(() => sec.scrollIntoView({ behavior: 'smooth' }), 100);

  const likes    = document.getElementById('likes')?.value    || 'různá jídla';
  const dislikes = document.getElementById('dislikes')?.value || 'žádné omezení';
  const diet     = document.getElementById('diet-style')?.value;
  const names    = MEAL_NAMES[appState.mealCount];

  const systemPrompt = `Jsi český výživový poradce a kuchař. Pravidla:
1. VEŠKERÝ text musí být česky — názvy jídel, ingredience, postup, vše. Nikdy nepoužívej angličtinu.
2. Kalorie VŽDY počítej přesně: kcal = bílkoviny×4 + sacharidy×4 + tuky×9. Každé jídlo ověř před odesláním.
3. Ingredience piš ve formátu "200g ovesných vloček" nebo "2 vejce" (množství + jednotka + název).
4. Vrátíš validní JSON přesně dle zadané struktury bez dalšího textu.`;

  const levelDesc = appState.ingredientLevel === 'úsporný'
    ? `ÚSPORNÝ level (levné suroviny, max ~80 Kč/porci):
POVOLENO: vejce, čočka, fazole, cizrna, hrách, mražená zelenina, mrkev, cibule, zelí, rajčata, rýže, těstoviny, ovesné vločky, tvaroh, mléko, bílý jogurt, banány, jablka, chléb, brambory, tuňák v konzervě, kuřecí stehna.
ZAKÁZÁNO: losos, avokádo, hovězí svíčková, quinoa, granola, kokosové mléko, kešu ořechy, pistácie, mango, borůvky mimo sezónu, dražší sýry než eidam.`
    : appState.ingredientLevel === 'gourmet'
    ? `GOURMET level (prémiové suroviny, cena není omezena):
POVOLENO: losos, čerstvý tuňák, avokádo, hovězí entrecôte, telecí, mango, granola, řecký jogurt, quinoa, para ořechy, kešu, pistácie, chia semínka, olivový olej extra virgin, parmazán, mozzarella buffalo, tahini, kokosové mléko, šampaňské houby.
VYHNI SE: průmyslovým polotovarům, instantním jídlům, levným náhražkám.`
    : `STANDARD level (běžná obchodní dostupnost, střední cena 80–200 Kč/porci):
POVOLENO: kuřecí prsa, kuřecí stehna, vepřová panenka, tuňák v konzervě, sezónní zelenina, celozrnné pečivo, jogurt, sýr eidam nebo gouda, brambory, ovoce, rýže, těstoviny, vejce, tvaroh, cottage.
VYHNI SE: prémiové suroviny (losos, avokádo, quinoa) i velmi levné náhražky.`;

  const prompt = `Vytvoř jídelníček na 1 den s přesně ${appState.mealCount} jídly. VEŠKERÝ TEXT MUSÍ BÝT V ČEŠTINĚ.

MAKRA: ${appState.macros.kcal} kcal | Bílkoviny: ${appState.macros.protein}g | Sacharidy: ${appState.macros.carbs}g | Tuky: ${appState.macros.fat}g
OSOBA: ${appState.macros.gender === 'muz' ? 'Muž' : 'Žena'}, ${appState.macros.age} let, ${appState.macros.weight} kg | CÍL: ${appState.macros.goal}
STRAVOVÁNÍ: ${diet} | OBLÍBENÁ JÍDLA: ${likes} | NEMÁ RÁD: ${dislikes}
LEVEL SUROVIN: ${levelDesc}
JÍDLA (česky): ${names.join(', ')}

Vrať POUZE validní JSON, vše česky:
{"meals":[{"mealType":"Snídaně","name":"Český název receptu","kcal":450,"protein":30,"carbs":45,"fat":12,"fiber":8,"prepTime":10,"difficulty":"Jednoduchá","ingredients":["200g ovesných vloček","300ml plnotučného mléka"],"steps":["Uvař vločky v mléce 5 minut za občasného míchání.","Přidej ovoce a podávej."]}]}

Pole difficulty musí být vždy jedno z: "Jednoduchá", "Střední", "Náročná". Pole prepTime je celé číslo v minutách. Pole fiber je vláknina v gramech (celé číslo).
Pokryj přesně tato jídla česky: ${names.join(', ')}. Makra musí dávat dohromady přibližně celkový cíl. ŽÁDNÉ anglické texty.
DŮLEŽITÉ: Makra vypočítej přesně ze surovin. Vzorec: kcal = protein×4 + sacharidy×4 + tuk×9. Ověř každé jídlo před odesláním.`;

  try {
    const text = await callGemini(systemPrompt, prompt, 2000);
    appState.currentRecipes = JSON.parse(text).meals.map(fixMacros);
    renderList(out, appState.currentRecipes);
    buildShoppingList(appState.currentRecipes);
    saveToHistory(appState.currentRecipes);
    setStepFn('done');
  } catch (err) {
    out.innerHTML = `<div class="error-box">${err.message || 'Chyba při generování. Zkus znovu.'}</div>`;
  }
}

// ── VYMĚNIT JÍDLO

export async function swapMeal(index) {
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

  const systemPrompt = `Jsi český výživový poradce a kuchař. Veškerý text česky. Kalorie: kcal = bílkoviny×4 + sacharidy×4 + tuky×9. Vrátíš validní JSON.`;
  const levelDescSwap = appState.ingredientLevel === 'úsporný'
    ? 'ÚSPORNÝ level — levné suroviny: vejce, luštěniny, mražená zelenina, rýže, ovesné vločky, tvaroh, banány. ŽÁDNÉ drahé suroviny (losos, avokádo, quinoa).'
    : appState.ingredientLevel === 'gourmet'
    ? 'GOURMET level — prémiové suroviny: losos, avokádo, hovězí, mango, quinoa, ořechy, řecký jogurt, semínka.'
    : 'STANDARD level — kuřecí maso, vejce, sezónní zelenina, celozrnné pečivo, jogurt, sýr, brambory, ovoce.';

  const prompt = `Navrhni JEDNO alternativní jídlo místo "${meal.name}" (${meal.mealType}). VEŠKERÝ TEXT V ČEŠTINĚ.

MAKRA PRO TOTO JÍDLO: ~${meal.kcal} kcal | Bílkoviny: ~${meal.protein}g | Sacharidy: ~${meal.carbs}g | Tuky: ~${meal.fat}g
STRAVOVÁNÍ: ${diet} | OBLÍBENÁ JÍDLA: ${likes} | NEMÁ RÁD: ${dislikes}
LEVEL SUROVIN: ${levelDescSwap}
NESMÍ BÝT: ${usedNames || 'žádné omezení'}

Vrať POUZE validní JSON jednoho jídla, vše česky:
{"mealType":"${meal.mealType}","name":"Jiný český název","kcal":${meal.kcal},"protein":${meal.protein},"carbs":${meal.carbs},"fat":${meal.fat},"prepTime":15,"difficulty":"Jednoduchá","ingredients":["ingredience česky"],"steps":["Postup česky."]}
ŽÁDNÉ anglické texty.`;

  try {
    const text = await callGemini(systemPrompt, prompt, 800);
    const newMeal = fixMacros(JSON.parse(text));
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
