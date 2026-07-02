// ── NÁKUPNÍ SEZNAM

import { SHOP_CATEGORIES } from './state.js?v=9';
import { esc } from './recipes.js?v=9';

// Položky, které se nekupují (voda, koření v stopovém množství, dochucovadla)
const TRIVIAL_KEYWORDS = [
  'voda', 'vody', 'teplá voda', 'studená voda',
  'sůl', 'soli', 'solí', 'mořská sůl',
  'pepř', 'pepře', 'pepří', 'černý pepř',
  'špetka', 'špetku',
  'dle chuti', 'dle potřeby', 'na dochucení', 'na ochucení',
  'trochu', 'kapka',
];

function isTrivial(ingredient) {
  const low = ingredient.toLowerCase().trim();
  return TRIVIAL_KEYWORDS.some(kw => low === kw || low.startsWith(kw + ' ') || low.includes(' ' + kw));
}

// Parsuje "200g ovesných vloček" → {qty:200, unit:'g', name:'ovesných vloček'}
function parseIngredient(str) {
  const m = str.trim().match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|lžíce|lžičky?|lžíci|hrnk[uy]?|ks|kus[yů]?|plátk[yůi]?|porci?[ei]?)?\s+(.+)$/i);
  if (!m || !m[3]) return null;
  let qty  = parseFloat(m[1].replace(',', '.'));
  let unit = (m[2] || '').toLowerCase();
  const name = m[3].trim();
  if (unit === 'kg') { qty *= 1000; unit = 'g'; }
  else if (unit === 'l') { qty *= 1000; unit = 'ml'; }
  else if (!unit) { unit = 'ks'; }
  return { qty, unit, name };
}

// Sečte stejné ingredience (stejná jednotka + název) z více jídel
function aggregateIngredients(items) {
  const map = new Map();
  const rest = [];
  items.forEach(ing => {
    const p = parseIngredient(ing);
    if (!p) { rest.push(ing); return; }
    const key = p.unit + '|' + p.name.toLowerCase();
    if (map.has(key)) {
      map.get(key).qty += p.qty;
    } else {
      map.set(key, { ...p });
    }
  });
  const aggregated = [...map.values()].map(({ qty, unit, name }) => {
    const q = qty % 1 === 0 ? qty : parseFloat(qty.toFixed(1));
    return unit === 'ks' ? `${q}× ${name}` : `${q}${unit} ${name}`;
  });
  return [...aggregated, ...rest];
}

function categorize(ingredient) {
  const low = ingredient.toLowerCase();
  for (const [cat, keywords] of Object.entries(SHOP_CATEGORIES)) {
    if (cat === 'Ostatní') continue;
    if (keywords.some(k => low.includes(k))) return cat;
  }
  return 'Ostatní';
}

export function buildShoppingList(meals) {
  const raw = [];
  meals.forEach(meal => (meal.ingredients || []).forEach(ing => {
    if (!isTrivial(ing)) raw.push(ing);
  }));
  const all = aggregateIngredients(raw);

  const groups = {};
  all.forEach(ing => {
    const cat = categorize(ing);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(ing);
  });

  const catIcons = {
    'Maso & ryby': '🥩', 'Vejce & mléčné': '🥛', 'Zelenina': '🥦',
    'Ovoce': '🍎', 'Obiloviny & přílohy': '🌾', 'Luštěniny & ořechy': '🫘', 'Ostatní': '🛒',
  };

  document.getElementById('shop-total-count').textContent = all.length + ' položek';

  const out = document.getElementById('shopping-output');
  out.innerHTML = '';

  for (const [cat, items] of Object.entries(groups)) {
    if (!items.length) continue;
    const icon = catIcons[cat] || '🛒';
    const group = document.createElement('div');
    group.className = 'shop-group';
    group.innerHTML = `
      <div class="shop-group-label">${icon} ${cat}</div>
      <div class="shop-items-list">
        ${items.map(item => `<div class="shop-item"><div class="shop-check"></div><span>${esc(item)}</span></div>`).join('')}
      </div>`;
    group.querySelectorAll('.shop-item').forEach(el => {
      el.addEventListener('click', () => el.classList.toggle('checked'));
    });
    out.appendChild(group);
  }

  document.getElementById('shopping-section').style.display = 'block';
}
