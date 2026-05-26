// ── MAIN — init, event listenery, dark mode

import { appState, MEAL_NAMES, initAuthListener } from './state.js?v=8';
import { updateNavAuth, openAuthModal, closeAuthModal, handleLogin, handleRegister, handleLogout } from './auth.js?v=8';
import { calculate, startEdit, finishEdit, handleEditKey } from './calculator.js?v=8';
import { toggleDayPlanner } from './dayplanner.js?v=8';
import { generateMealPlan, closeRecipeModal, renderList } from './recipes.js?v=8';
import { openProfileModal, closeProfileModal, saveProfile, loadProfileOnStart } from './profile.js?v=8';
import { getUsageInfo, FREE_LIMIT } from './generation-limit.js?v=8';
import { normalizeFoodEstimate, parseGeminiJSON } from './ai-utils.js?v=8';
import {
  addFoodLogItem,
  calcWaterGoal,
  clearFoodLog as clearStoredFoodLog,
  dateKey,
  formatDayLabel,
  lastDays,
  loadDay,
  loadTrends,
  migrateAnonymousTracking,
  removeFoodLogItem as removeStoredFoodLogItem,
  saveDailyTarget,
  saveMealPlan,
  updateWater,
  upsertWeight,
} from './tracking-store.js?v=8';

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

// ── TOAST
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const icon  = document.getElementById('toast-icon');
  const text  = document.getElementById('toast-text');
  if (!toast) return;
  icon.textContent = type === 'success' ? '✓' : '✕';
  text.textContent = message;
  toast.className = 'toast ' + type;
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => toast.classList.remove('visible'), 4000);
}

async function fileToBase64(file) {
  const dataUrl = await fileToDataUrl(file);
  return String(dataUrl).split(',')[1];
}

async function fileToDataUrl(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return String(dataUrl);
}

async function analyzeFoodPhoto() {
  const fileInput = document.getElementById('food-photo-input');
  const out = document.getElementById('photo-estimate-output');
  const btn = document.getElementById('btn-photo-estimate');
  const file = fileInput?.files?.[0];
  if (!file) {
    showToast('Nejdřív vyber fotku jídla.', 'error');
    return;
  }
  if (!file.type.startsWith('image/')) {
    showToast('Vyber prosím obrázek jídla.', 'error');
    return;
  }
  if (file.size > MAX_PHOTO_SIZE) {
    showToast('Fotka je moc velká. Maximum je 5 MB.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Analyzuju fotku…';
  appState.pendingFoodEstimate = null;
  setPhotoActionsVisible(false);
  setPhotoOutputMessage(out, 'Probíhá odhad maker z obrázku...');

  try {
    const imageBase64 = await fileToBase64(file);
    const res = await fetch('/api/analyze-food-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType: file.type || 'image/jpeg' }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || `Chyba serveru (${res.status})`);

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    const estimate = normalizeFoodEstimate(data.estimate || parseGeminiJSON(text, 'Odhad z fotky'));
    appState.pendingFoodEstimate = buildFoodLogItem(estimate);
    renderFoodEstimate(out, estimate);
    setPhotoActionsVisible(true);
  } catch (err) {
    appState.pendingFoodEstimate = null;
    setPhotoActionsVisible(false);
    setPhotoOutputMessage(out, `Nepodařilo se analyzovat fotku: ${err.message || 'Neznámá chyba'}`, 'error');
    showToast('Analýza fotky selhala.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Odhadnout z fotky';
  }
}

function setPhotoOutputMessage(out, message, type = '') {
  if (!out) return;
  out.className = `photo-estimate-output${type ? ` ${type}` : ''}`;
  out.style.display = 'block';
  out.textContent = message;
}

function setPhotoActionsVisible(visible) {
  const actions = document.getElementById('photo-actions');
  if (actions) actions.style.display = visible ? 'grid' : 'none';
}

function renderFoodEstimate(out, estimate) {
  if (!out) return;
  out.className = 'photo-estimate-output';
  out.style.display = 'block';
  out.replaceChildren();

  const heading = document.createElement('div');
  heading.className = 'photo-estimate-heading';

  const titleWrap = document.createElement('div');
  const food = document.createElement('div');
  food.className = 'photo-estimate-food';
  food.textContent = estimate.foodName;
  const portion = document.createElement('div');
  portion.className = 'photo-estimate-portion';
  portion.textContent = estimate.portionGuess;
  titleWrap.append(food, portion);

  const confidence = document.createElement('div');
  confidence.className = 'photo-confidence';
  confidence.textContent = estimate.confidence;
  heading.append(titleWrap, confidence);

  const grid = document.createElement('div');
  grid.className = 'photo-macro-grid';
  [
    ['Kalorie', `${estimate.kcal} kcal`],
    ['Bílkoviny', `${estimate.protein} g`],
    ['Sacharidy', `${estimate.carbs} g`],
    ['Tuky', `${estimate.fat} g`],
  ].forEach(([label, value]) => {
    const tile = document.createElement('div');
    tile.className = 'photo-macro-tile';
    const valueEl = document.createElement('span');
    valueEl.className = 'photo-macro-value';
    valueEl.textContent = value;
    const labelEl = document.createElement('span');
    labelEl.className = 'photo-macro-label';
    labelEl.textContent = label;
    tile.append(valueEl, labelEl);
    grid.appendChild(tile);
  });

  const note = document.createElement('div');
  note.className = 'photo-estimate-note';
  note.textContent = estimate.note;

  out.append(heading, grid, note);
}

function buildFoodLogItem(estimate) {
  return {
    id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `photo-${Date.now()}`,
    createdAt: new Date().toISOString(),
    source: 'photo',
    foodName: estimate.foodName,
    portionGuess: estimate.portionGuess,
    kcal: estimate.kcal,
    protein: estimate.protein,
    carbs: estimate.carbs,
    fat: estimate.fat,
    confidence: estimate.confidence,
    note: estimate.note,
  };
}

async function refreshSelectedDay(options = {}) {
  const key = appState.selectedDate || dateKey();
  appState.selectedDate = key;
  appState.weeklyDays = lastDays(7);

  try {
    const day = await loadDay(key);
    appState.dailyData = day;
    appState.foodLog = day.foodLog || [];

    if (day.target && options.applyTarget !== false) {
      appState.macros = { ...appState.macros, ...day.target, waterGoalMl: day.target.waterGoalMl || day.target.water_goal_ml || 0 };
      appState.waterGoalMl = appState.macros.waterGoalMl || appState.waterGoalMl;
      const results = document.getElementById('results');
      if (results) results.style.display = 'block';
    }

    if (day.mealPlan?.meals?.length) {
      appState.currentRecipes = day.mealPlan.meals;
      const sec = document.getElementById('meal-plan-section');
      const out = document.getElementById('meal-plan-output');
      if (sec && out) {
        sec.style.display = 'block';
        renderList(out, appState.currentRecipes);
        buildShoppingListIfPossible();
      }
    } else if (options.clearMissingPlan) {
      appState.currentRecipes = [];
      document.getElementById('meal-plan-section').style.display = 'none';
      document.getElementById('meal-plan-output').innerHTML = '';
    }

    appState.trackingTrends = await loadTrends(30);
  } catch (err) {
    showToast('Nepodařilo se načíst tracking data.', 'error');
    console.error(err);
  }

  renderTrackingShell();
}

function buildShoppingListIfPossible() {
  const output = document.getElementById('shopping-output');
  if (!output || !appState.currentRecipes?.length) return;
  import('./shopping.js?v=8').then(({ buildShoppingList }) => buildShoppingList(appState.currentRecipes));
}

async function persistCurrentTarget() {
  if (!appState.macros?.kcal) return;
  const key = appState.selectedDate || dateKey();
  const waterGoalMl = calcWaterGoal(appState.macros.weight, appState.activityFactor);
  appState.waterGoalMl = waterGoalMl;
  appState.macros.waterGoalMl = waterGoalMl;
  await saveDailyTarget(key, appState.macros);
  await upsertWeight(key, appState.macros.weight, 'profile');
  const currentWater = appState.dailyData?.water || { amountMl: 0, goalMl: waterGoalMl };
  await updateWater(key, currentWater.amountMl || 0, waterGoalMl);
  await refreshSelectedDay({ applyTarget: false });
}

async function addPendingFoodEstimate() {
  if (!appState.pendingFoodEstimate) {
    showToast('Nejdřív analyzuj fotku jídla.', 'error');
    return;
  }
  const key = appState.selectedDate || dateKey();
  const saved = await addFoodLogItem(key, appState.pendingFoodEstimate);
  appState.foodLog = [saved, ...appState.foodLog];
  appState.pendingFoodEstimate = null;
  await refreshSelectedDay({ applyTarget: false });
  setActiveAppTab('today', { scroll: true });
  setPhotoActionsVisible(false);
  document.getElementById('photo-estimate-output').style.display = 'none';
  document.getElementById('food-photo-preview').style.display = 'none';
  document.getElementById('food-photo-input').value = '';
  document.getElementById('food-photo-name').textContent = 'JPG, PNG nebo WebP do 5 MB';
  showToast('Jídlo přidáno do dne.', 'success');
}

function discardPendingFoodEstimate() {
  appState.pendingFoodEstimate = null;
  setPhotoActionsVisible(false);
  document.getElementById('photo-estimate-output').style.display = 'none';
  showToast('Odhad z fotky zahozen.', 'success');
}

async function removeFoodLogItem(id) {
  await removeStoredFoodLogItem(appState.selectedDate || dateKey(), id);
  await refreshSelectedDay({ applyTarget: false });
}

async function clearFoodLog() {
  if (!appState.foodLog.length) return;
  await clearStoredFoodLog(appState.selectedDate || dateKey());
  await refreshSelectedDay({ applyTarget: false });
  showToast('Příjem pro vybraný den je vymazaný.', 'success');
}

function sumFoodLog() {
  return appState.foodLog.reduce((sum, item) => ({
    kcal: sum.kcal + (item.kcal || 0),
    protein: sum.protein + (item.protein || 0),
    carbs: sum.carbs + (item.carbs || 0),
    fat: sum.fat + (item.fat || 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

function renderTrackingShell() {
  renderMacroValues();
  renderDateNav();
  renderFirstRunState();
  renderDailyOverview();
  renderWaterTracker();
  renderTrends();
}

function setActiveAppTab(tabName, options = {}) {
  const target = tabName || 'today';
  document.querySelectorAll('[data-app-tab]').forEach(btn => {
    const active = btn.dataset.appTab === target;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('[data-app-panel]').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.appPanel === target);
  });
  if (options.scroll) {
    document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderFirstRunState() {
  const card = document.getElementById('first-run-card');
  if (!card) return;
  const hasPlan = Boolean(appState.currentRecipes?.length || appState.dailyData?.mealPlan?.meals?.length);
  const hasLog = Boolean(appState.foodLog?.length);
  card.style.display = appState.macros?.kcal && !hasPlan && !hasLog ? 'grid' : 'none';
}

function renderMacroValues() {
  if (!appState.macros?.kcal) return;
  ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'bmr', 'tdee'].forEach(key => {
    const el = document.getElementById(`r-${key}`);
    if (el && appState.macros[key] !== undefined) el.textContent = appState.macros[key];
  });
}

function renderDateNav() {
  const label = document.getElementById('selected-date-label');
  const chips = document.getElementById('date-chip-list');
  if (label) label.textContent = formatDayLabel(appState.selectedDate || dateKey());
  if (!chips) return;

  chips.replaceChildren();
  appState.weeklyDays = lastDays(7);
  appState.weeklyDays.forEach(key => {
    const btn = document.createElement('button');
    btn.className = `date-chip${key === appState.selectedDate ? ' active' : ''}`;
    btn.type = 'button';
    btn.dataset.date = key;
    btn.innerHTML = `<span>${formatDayLabel(key, { short: true })}</span><strong>${new Date(`${key}T12:00:00`).getDate()}</strong>`;
    chips.appendChild(btn);
  });
}

function renderDailyOverview() {
  const overview = document.getElementById('daily-overview');
  if (!overview || !appState.macros?.kcal) return;
  overview.style.display = 'block';

  const totals = sumFoodLog();
  const count = appState.foodLog.length;
  const summary = document.getElementById('daily-summary');
  const photoCount = appState.foodLog.filter(x => x.source === 'photo').length;
  const plannedCount = appState.foodLog.filter(x => x.source === 'planned').length;
  summary.textContent = count
    ? `${count} ${count === 1 ? 'jídlo zapsané' : count < 5 ? 'jídla zapsaná' : 'jídel zapsáno'} · plán ${plannedCount} · fotka ${photoCount}.`
    : 'Zatím není zapsané žádné jídlo.';

  updateBudgetTile('kcal', totals.kcal, appState.macros.kcal, 'kcal');
  updateBudgetTile('protein', totals.protein, appState.macros.protein, 'g');
  updateBudgetTile('carbs', totals.carbs, appState.macros.carbs, 'g');
  updateBudgetTile('fat', totals.fat, appState.macros.fat, 'g');

  const clearBtn = document.getElementById('clear-food-log');
  if (clearBtn) clearBtn.style.display = count ? 'inline-flex' : 'none';

  const list = document.getElementById('food-log-list');
  if (!list) return;
  list.replaceChildren();
  if (!count) {
    const empty = document.createElement('div');
    empty.className = 'food-log-empty';
    empty.textContent = 'Až klikneš na „Snědl jsem“ u receptu nebo přidáš fotku jídla, objeví se tady záznam a odečte se od denního cíle.';
    list.appendChild(empty);
    return;
  }

  appState.foodLog.forEach(item => {
    const row = document.createElement('div');
    row.className = 'food-log-item';

    const body = document.createElement('div');
    body.className = 'food-log-body';
    const name = document.createElement('strong');
    name.textContent = item.foodName;
    const meta = document.createElement('span');
    const time = new Date(item.createdAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    const source = item.source === 'planned' ? 'z jídelníčku' : item.source === 'photo' ? 'z fotky' : 'ručně';
    meta.textContent = `${time} · ${source}${item.portionGuess ? ` · ${item.portionGuess}` : ''}${item.confidence ? ` · ${item.confidence} jistota` : ''}`;
    body.append(name, meta);

    const macros = document.createElement('div');
    macros.className = 'food-log-macros';
    macros.textContent = `${item.kcal} kcal · B ${item.protein}g · S ${item.carbs}g · T ${item.fat}g`;

    const remove = document.createElement('button');
    remove.className = 'food-log-remove';
    remove.type = 'button';
    remove.dataset.removeFoodId = item.id;
    remove.setAttribute('aria-label', `Odebrat ${item.foodName}`);
    remove.textContent = '×';

    row.append(body, macros, remove);
    list.appendChild(row);
  });
}

function updateBudgetTile(key, used, goal, unit) {
  const left = Math.max(goal - used, 0);
  const pct = goal ? Math.min((used / goal) * 100, 100) : 0;
  document.getElementById(`budget-${key}-left`).textContent = `${left} ${unit} zbývá`;
  document.getElementById(`budget-${key}-used`).textContent = `${used} / ${goal} ${unit}`;
  document.getElementById(`budget-${key}-bar`).style.width = `${pct}%`;
}

function finishMacroEdit(m) {
  finishEdit(m);
  persistCurrentTarget();
}

async function addPlannedMeal(meal) {
  if (!meal) return;
  if ((appState.foodLog || []).some(item => item.plannedMealId === meal.plannedMealId)) {
    showToast('Tohle jídlo už je zapsané.', 'error');
    return;
  }
  const item = {
    id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `planned-${Date.now()}`,
    source: 'planned',
    foodName: meal.name,
    mealType: meal.mealType,
    plannedMealId: meal.plannedMealId,
    portionGuess: meal.mealType,
    kcal: meal.kcal,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    confidence: 'vysoká',
    note: 'Zapsáno z vygenerovaného jídelníčku.',
    createdAt: new Date().toISOString(),
  };
  await addFoodLogItem(appState.selectedDate || dateKey(), item);
  await refreshSelectedDay({ applyTarget: false });
  setActiveAppTab('today', { scroll: true });
  renderList(document.getElementById('meal-plan-output'), appState.currentRecipes);
  showToast('Jídlo zapsané do dne.', 'success');
}

function renderWaterTracker() {
  const section = document.getElementById('water-section');
  if (!section) return;
  const water = appState.dailyData?.water || { amountMl: 0, goalMl: appState.waterGoalMl || appState.macros?.waterGoalMl || 0 };
  const goal = water.goalMl || appState.waterGoalMl || appState.macros?.waterGoalMl || calcWaterGoal(appState.macros?.weight, appState.activityFactor);
  const amount = water.amountMl || 0;
  const pct = goal ? Math.min((amount / goal) * 100, 100) : 0;
  const glassesGoal = goal ? Math.round(goal / 250) : 0;
  const glassesDone = Math.floor(amount / 250);

  document.getElementById('water-amount').textContent = `${(amount / 1000).toFixed(1)} / ${(goal / 1000).toFixed(1)} l`;
  document.getElementById('water-desc').textContent = goal ? `Cíl podle váhy a aktivity: ${glassesGoal} sklenic` : 'Spočítej makra a nastaví se denní cíl.';
  document.getElementById('water-glasses-count').textContent = `${glassesDone}/${glassesGoal} sklenic`;
  document.getElementById('water-fill').style.width = `${pct}%`;

  const drops = document.getElementById('water-drops');
  if (drops) {
    drops.innerHTML = '';
    const shown = Math.min(Math.max(glassesGoal, 4), 12);
    for (let i = 0; i < shown; i++) {
      const dot = document.createElement('div');
      dot.className = `water-dot${i < glassesDone ? ' filled' : ''}`;
      drops.appendChild(dot);
    }
  }
  section.style.display = appState.macros?.kcal ? 'block' : 'none';
}

async function changeWater(delta) {
  const key = appState.selectedDate || dateKey();
  const current = appState.dailyData?.water || { amountMl: 0, goalMl: appState.waterGoalMl || 0 };
  const goal = current.goalMl || appState.waterGoalMl || appState.macros?.waterGoalMl || 0;
  await updateWater(key, Math.max(0, (current.amountMl || 0) + delta), goal);
  await refreshSelectedDay({ applyTarget: false });
}

async function saveWeightFromInput() {
  const input = document.getElementById('today-weight-input');
  const weight = Number(input?.value || 0);
  if (!weight) {
    showToast('Zadej váhu v kg.', 'error');
    return;
  }
  await upsertWeight(appState.selectedDate || dateKey(), weight, 'manual');
  await refreshSelectedDay({ applyTarget: false });
  showToast('Váha uložená.', 'success');
}

function renderTrends() {
  const streakEl = document.getElementById('streak-count');
  const streakText = document.getElementById('streak-desc');
  if (streakEl) streakEl.textContent = `${appState.trackingTrends?.streak || 0}`;
  if (streakText) streakText.textContent = 'dní v řadě nad 80 % bílkovin';

  const input = document.getElementById('today-weight-input');
  const selectedWeight = appState.dailyData?.weight?.weightKg || appState.macros?.weight || '';
  if (input && selectedWeight) input.value = selectedWeight;

  const spark = document.getElementById('weight-sparkline');
  const label = document.getElementById('weight-trend-label');
  if (!spark) return;
  const weights = (appState.trackingTrends?.days || [])
    .map(day => ({ date: day.date, value: Number(day.weight?.weightKg || 0) }))
    .filter(point => point.value > 0)
    .slice(-30);
  spark.replaceChildren();
  if (weights.length < 2) {
    if (label) label.textContent = weights.length ? `${weights[0].value} kg` : 'Zatím žádný trend';
    return;
  }
  const min = Math.min(...weights.map(p => p.value));
  const max = Math.max(...weights.map(p => p.value));
  const range = Math.max(max - min, 1);
  const points = weights.map((p, i) => {
    const x = weights.length === 1 ? 100 : (i / (weights.length - 1)) * 100;
    const y = 34 - ((p.value - min) / range) * 28;
    return `${x},${y}`;
  }).join(' ');
  spark.innerHTML = `<polyline points="${points}" fill="none" stroke="var(--blue)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>`;
  if (label) {
    const first = weights[0].value;
    const last = weights[weights.length - 1].value;
    const diff = last - first;
    label.textContent = `${last} kg · ${diff >= 0 ? '+' : ''}${diff.toFixed(1)} kg`;
  }
}

// ── DARK MODE (spouští se okamžitě, před DOMContentLoaded)
const savedTheme = localStorage.getItem('nutriplan-theme');
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

// ── HELPERS

function setStep(n) {
  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i < (n === 'done' ? 4 : n));
    dot.classList.toggle('done', n === 'done');
  });
}

function setGender(g) {
  appState.gender = g;
  document.getElementById('btn-muz')?.classList.toggle('active', g === 'muz');
  document.getElementById('btn-zena')?.classList.toggle('active', g === 'zena');
}

function changeMealCount(delta) {
  const next = appState.mealCount + delta;
  if (next < 2 || next > 6) return;
  appState.mealCount = next;
  document.getElementById('meal-count-display').textContent = next;
  document.getElementById('meal-count-label').textContent = next === 1 ? 'jídlo' : next < 5 ? 'jídla' : 'jídel';
  document.getElementById('meal-count-names').textContent = MEAL_NAMES[next].join(' · ');
  document.getElementById('mc-minus').disabled = next <= 2;
  document.getElementById('mc-plus').disabled  = next >= 6;
}

// ── PAYWALL MODAL

function openPaywallModal(detail) {
  const modal = document.getElementById('paywall-modal');
  if (!modal) return;
  const count = detail?.count ?? FREE_LIMIT;
  const limit = detail?.limit ?? FREE_LIMIT;
  document.getElementById('paywall-count').textContent = count;
  document.getElementById('paywall-limit-label').textContent = limit;
  document.getElementById('paywall-limit').textContent = limit;
  document.getElementById('paywall-progress-bar').style.width = '100%';
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePaywallModal() {
  document.getElementById('paywall-modal')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ── USAGE BADGE

function updateUsageBadge(info) {
  const badge = document.getElementById('usage-badge');
  const text  = document.getElementById('usage-badge-text');
  if (!badge || !text) return;

  if (info.premium) {
    badge.style.display = 'none';
    return;
  }

  const remaining = Math.max(0, info.limit - info.count);
  badge.style.display = 'block';
  text.textContent = `${remaining}/${info.limit} generací zbývá`;
  badge.className = 'usage-badge' + (remaining === 0 ? ' exhausted' : remaining === 1 ? ' low' : '');
}

// ── INIT

(function init() {
  // Scroll reveal
  const obs = new IntersectionObserver(entries =>
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
    { threshold: 0.1 }
  );
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

  // Dark mode toggle
  document.getElementById('dark-toggle')?.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('nutriplan-theme', next);
  });

  // Level surovin
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.ingredientLevel = btn.dataset.level;
      document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Quick-pick chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const targetId = chip.dataset.target;
      const textarea = document.getElementById(targetId);
      chip.classList.toggle('active');
      const manualLines = (textarea.dataset.manual || '').trim();
      const activeValues = [...document.querySelectorAll(`.chip[data-target="${targetId}"].active`)]
        .map(c => c.dataset.value);
      textarea.value = [...activeValues, ...(manualLines ? [manualLines] : [])].join(', ');
    });
  });

  ['likes', 'dislikes'].forEach(id => {
    const ta = document.getElementById(id);
    ta.addEventListener('input', () => {
      const chipValues = [...document.querySelectorAll(`.chip[data-target="${id}"].active`)]
        .map(c => c.dataset.value);
      let manual = ta.value;
      chipValues.forEach(v => { manual = manual.replace(v, ''); });
      manual = manual.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim();
      ta.dataset.manual = manual;
    });
  });

  // Gender
  document.getElementById('btn-muz')?.addEventListener('click', () => setGender('muz'));
  document.getElementById('btn-zena')?.addEventListener('click', () => setGender('zena'));

  // Goals
  document.querySelectorAll('.goal-card').forEach(c => {
    c.addEventListener('click', () => {
      appState.goal = c.dataset.goal;
      document.querySelectorAll('.goal-card').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
    });
  });

  // Freq cards
  document.querySelectorAll('.freq-card').forEach(c => {
    c.addEventListener('click', () => {
      appState.activityFactor = parseFloat(c.dataset.factor);
      document.querySelectorAll('.freq-card').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      if (appState.dayPlannerOpen) {
        appState.dayPlannerOpen = false;
        document.getElementById('day-planner').style.display = 'none';
        document.getElementById('day-toggle')?.classList.remove('open');
      }
    });
  });

  document.getElementById('day-toggle')?.addEventListener('click', toggleDayPlanner);
  document.getElementById('btn-calculate')?.addEventListener('click', async () => {
    appState.selectedDate = dateKey();
    calculate(setStep);
    if (appState.macros?.kcal) {
      setActiveAppTab('today');
      await persistCurrentTarget();
    }
  });
  document.getElementById('mc-minus')?.addEventListener('click', () => changeMealCount(-1));
  document.getElementById('mc-plus')?.addEventListener('click', () => changeMealCount(1));
  document.getElementById('btn-generate')?.addEventListener('click', () => {
    setActiveAppTab('plan');
    generateMealPlan(setStep);
  });
  document.getElementById('btn-start-plan')?.addEventListener('click', () => {
    setActiveAppTab('plan', { scroll: true });
    generateMealPlan(setStep);
  });
  document.getElementById('btn-start-photo')?.addEventListener('click', () => setActiveAppTab('log', { scroll: true }));
  document.querySelectorAll('[data-app-tab]').forEach(tab => {
    tab.addEventListener('click', () => setActiveAppTab(tab.dataset.appTab));
  });
  document.getElementById('btn-photo-estimate')?.addEventListener('click', analyzeFoodPhoto);
  document.getElementById('btn-add-photo-meal')?.addEventListener('click', addPendingFoodEstimate);
  document.getElementById('btn-discard-photo-meal')?.addEventListener('click', discardPendingFoodEstimate);
  document.getElementById('clear-food-log')?.addEventListener('click', clearFoodLog);
  document.getElementById('date-chip-list')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-date]');
    if (!btn) return;
    appState.selectedDate = btn.dataset.date;
    await refreshSelectedDay({ clearMissingPlan: true });
  });
  document.getElementById('water-plus')?.addEventListener('click', () => changeWater(250));
  document.getElementById('water-minus')?.addEventListener('click', () => changeWater(-250));
  document.getElementById('water-reset')?.addEventListener('click', () => changeWater(-(appState.dailyData?.water?.amountMl || 0)));
  document.getElementById('save-weight-btn')?.addEventListener('click', saveWeightFromInput);
  document.getElementById('food-log-list')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-food-id]');
    if (btn) removeFoodLogItem(btn.dataset.removeFoodId);
  });
  document.querySelector('.photo-upload-btn')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.getElementById('food-photo-input')?.click();
    }
  });
  document.getElementById('food-photo-input')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    const preview = document.getElementById('food-photo-preview');
    const out = document.getElementById('photo-estimate-output');
    const name = document.getElementById('food-photo-name');
    if (!file || !preview) return;
    if (name) name.textContent = file.name;
    appState.pendingFoodEstimate = null;
    setPhotoActionsVisible(false);
    if (!file.type.startsWith('image/') || file.size > MAX_PHOTO_SIZE) {
      preview.style.display = 'none';
      showToast(file.size > MAX_PHOTO_SIZE ? 'Fotka je moc velká. Maximum je 5 MB.' : 'Vyber prosím obrázek.', 'error');
      return;
    }
    fileToDataUrl(file).then(dataUrl => {
      preview.src = dataUrl;
      preview.style.display = 'block';
    }).catch(() => {
      preview.removeAttribute('src');
      preview.style.display = 'none';
      showToast('Náhled fotky se nepodařilo načíst.', 'error');
    });
    if (out) out.style.display = 'none';
  });

  // Macro tile clicks
  document.querySelectorAll('.macro-tile.editable').forEach(tile => {
    tile.addEventListener('click', () => startEdit(tile.dataset.macro));
  });
  ['kcal', 'protein', 'carbs', 'fat'].forEach(m => {
    const inp = document.getElementById('input-' + m);
    inp.addEventListener('blur', () => finishMacroEdit(m));
    inp.addEventListener('keydown', e => {
      handleEditKey(e, m);
      if (e.key === 'Enter') persistCurrentTarget();
    });
    inp.addEventListener('click', e => e.stopPropagation());
  });

  // Recipe modal
  document.getElementById('modal-close-btn')?.addEventListener('click', closeRecipeModal);
  document.getElementById('recipe-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('recipe-modal')) closeRecipeModal();
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeRecipeModal(); closeProfileModal(); closeAuthModal(); closePaywallModal(); }
  });

  // Paywall modal
  document.getElementById('paywall-close-btn')?.addEventListener('click', closePaywallModal);
  document.getElementById('paywall-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('paywall-modal')) closePaywallModal();
  });
  document.getElementById('paywall-cta-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('paywall-cta-btn');
    const user = (await import('./auth.js?v=8')).getCurrentUser();
    if (!user) { closePaywallModal(); (await import('./auth.js?v=8')).openAuthModal(); return; }

    btn.disabled = true;
    btn.textContent = 'Přesměrovávám…';
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Chyba při vytváření platby.');
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Odemknout Premium';
      showToast(err.message, 'error');
    }
  });

  // Custom events z recipes.js
  window.addEventListener('paywall:show', e => openPaywallModal(e.detail));
  window.addEventListener('usage:update', e => updateUsageBadge(e.detail));
  window.addEventListener('tracking:add-planned-meal', e => addPlannedMeal(e.detail?.meal));
  window.addEventListener('mealplan:ready', async e => {
    if (e.detail?.meals?.length) {
      await saveMealPlan(appState.selectedDate || dateKey(), e.detail.meals);
      await refreshSelectedDay({ applyTarget: false });
    }
  });
  window.addEventListener('mealplan:updated', async e => {
    if (e.detail?.meals?.length) {
      await saveMealPlan(appState.selectedDate || dateKey(), e.detail.meals);
      await refreshSelectedDay({ applyTarget: false });
    }
  });
  window.addEventListener('profile:saved', async e => {
    const weight = Number(e.detail?.profile?.weight || 0);
    if (weight) {
      await upsertWeight(appState.selectedDate || dateKey(), weight, 'profile');
      await refreshSelectedDay({ applyTarget: false });
    }
  });

  // Shopping accordion
  document.getElementById('shop-accordion-header')?.addEventListener('click', () => {
    document.querySelector('.shop-accordion')?.classList.toggle('open');
  });

  // Auth
  document.getElementById('btn-login')?.addEventListener('click', openAuthModal);
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  document.getElementById('nav-user-chip')?.addEventListener('click', openProfileModal);
  document.getElementById('auth-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('auth-modal')) closeAuthModal();
  });
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      document.getElementById('auth-login-form').style.display    = which === 'login'    ? 'flex' : 'none';
      document.getElementById('auth-register-form').style.display = which === 'register' ? 'flex' : 'none';
    });
  });
  document.getElementById('auth-login-btn')?.addEventListener('click', handleLogin);
  document.getElementById('auth-register-btn')?.addEventListener('click', handleRegister);
  document.getElementById('auth-skip-login')?.addEventListener('click', closeAuthModal);
  document.getElementById('auth-skip-register')?.addEventListener('click', closeAuthModal);
  document.getElementById('auth-email')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  document.getElementById('auth-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  document.getElementById('reg-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleRegister(); });
  document.getElementById('profile-anon-login-btn')?.addEventListener('click', () => {
    closeProfileModal(); openAuthModal();
  });

  // Auth login event (fired by auth.js after successful login)
  window.addEventListener('auth:login', async () => {
    await migrateAnonymousTracking();
    await loadProfileOnStart();
    await refreshSelectedDay({ clearMissingPlan: true });
    getUsageInfo().then(updateUsageBadge);
  });

  // Profile modal
  document.getElementById('btn-profile')?.addEventListener('click', openProfileModal);
  document.getElementById('profile-close')?.addEventListener('click', closeProfileModal);
  document.getElementById('profile-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('profile-modal')) closeProfileModal();
  });
  document.getElementById('p-btn-muz')?.addEventListener('click', () => {
    appState.profileGenderVal = 'muz';
    document.getElementById('p-btn-muz')?.classList.add('active');
    document.getElementById('p-btn-zena')?.classList.remove('active');
  });
  document.getElementById('p-btn-zena')?.addEventListener('click', () => {
    appState.profileGenderVal = 'zena';
    document.getElementById('p-btn-zena')?.classList.add('active');
    document.getElementById('p-btn-muz')?.classList.remove('active');
  });
  document.querySelectorAll('[data-profile-goal]').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('[data-profile-goal]').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      appState.profileGoalVal = card.dataset.profileGoal;
    });
  });
  document.getElementById('profile-save-btn')?.addEventListener('click', saveProfile);

  // Premium banner button in profile modal
  document.getElementById('premium-banner-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('premium-banner-btn');
    if (btn.disabled) return;
    const user = (await import('./auth.js?v=8')).getCurrentUser();
    if (!user) { closeProfileModal(); (await import('./auth.js?v=8')).openAuthModal(); return; }

    const isManage = btn.dataset.action === 'manage';
    const endpoint = isManage ? '/api/create-portal' : '/api/create-checkout';
    const body = isManage
      ? { email: user.email }
      : { userId: user.id, email: user.email };
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = 'Přesměrovávám…';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Chyba při vytváření platby.');
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = originalText;
      showToast(err.message, 'error');
    }
  });

  // ── LOCALSTORAGE AUTO-SAVE PRO NEPŘIHLÁŠENÉ UŽIVATELE
  const LS_KEY = 'nutriplan-form';

  function saveFormToLS() {
    const data = {
      gender: appState.gender,
      goal: appState.goal,
      age: document.getElementById('age')?.value || '',
      height: document.getElementById('height')?.value || '',
      weight: document.getElementById('weight')?.value || '',
      likes: document.getElementById('likes')?.value || '',
      dislikes: document.getElementById('dislikes')?.value || '',
      diet: document.getElementById('diet-style')?.value || 'standardní',
      ingredientLevel: appState.ingredientLevel,
      mealCount: appState.mealCount,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  }

  function loadFormFromLS() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.gender) setGender(d.gender);
      if (d.goal) {
        appState.goal = d.goal;
        document.querySelectorAll('[data-goal]').forEach(c => c.classList.toggle('active', c.dataset.goal === d.goal));
      }
      if (d.age) document.getElementById('age').value = d.age;
      if (d.height) document.getElementById('height').value = d.height;
      if (d.weight) document.getElementById('weight').value = d.weight;
      if (d.likes) document.getElementById('likes').value = d.likes;
      if (d.dislikes) document.getElementById('dislikes').value = d.dislikes;
      if (d.diet) document.getElementById('diet-style').value = d.diet;
      if (d.ingredientLevel) {
        appState.ingredientLevel = d.ingredientLevel;
        document.querySelectorAll('.level-btn').forEach(b => b.classList.toggle('active', b.dataset.level === d.ingredientLevel));
      }
      if (d.mealCount && d.mealCount >= 2 && d.mealCount <= 6) {
        const delta = d.mealCount - appState.mealCount;
        if (delta !== 0) changeMealCount(delta);
      }
    } catch {}
  }

  // Auto-save na každou změnu relevantních polí
  ['age', 'height', 'weight', 'likes', 'dislikes'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', saveFormToLS);
  });
  document.getElementById('diet-style')?.addEventListener('change', saveFormToLS);
  // Hooks do existujících akcí (gender, goal, level, mealCount) — uložit po kliknutí
  window.addEventListener('click', e => {
    const t = e.target.closest('.goal-card, .level-btn, .freq-card, .mc-btn, .toggle-btn');
    if (t) setTimeout(saveFormToLS, 50);
  });

  // Načti uložené hodnoty při startu (jen pokud není přihlášen — profil ho přepíše)
  appState.selectedDate = dateKey();
  loadFormFromLS();
  refreshSelectedDay({ clearMissingPlan: true });

  // ── COOKIE CONSENT BANNER
  const consent = localStorage.getItem('nutriplan-consent');
  if (!consent) {
    const banner = document.getElementById('cookie-consent');
    if (banner) banner.style.display = 'flex';
  }
  document.getElementById('cookie-accept')?.addEventListener('click', () => {
    localStorage.setItem('nutriplan-consent', 'accepted');
    document.getElementById('cookie-consent').style.display = 'none';
    if (typeof loadGA === 'function') loadGA();
  });
  document.getElementById('cookie-reject')?.addEventListener('click', () => {
    localStorage.setItem('nutriplan-consent', 'rejected');
    document.getElementById('cookie-consent').style.display = 'none';
  });

  // ── SHARE TOOLBAR — injektuje se po generování meal planu
  window.addEventListener('mealplan:ready', () => setTimeout(injectShareToolbar, 300));

  function injectShareToolbar() {
    if (document.querySelector('.share-toolbar')) return;
    const sec = document.getElementById('meal-plan-section');
    if (!sec || sec.style.display === 'none') return;
    const tpl = document.getElementById('share-toolbar-tpl');
    if (!tpl) return;
    const clone = tpl.content.cloneNode(true);
    (sec.querySelector('.card') || sec)?.appendChild(clone);

    sec.querySelector('[data-action="copy"]')?.addEventListener('click', () => {
      const text = buildPlainTextMealPlan();
      navigator.clipboard.writeText(text).then(() => showToast('Jídelníček zkopírován do schránky', 'success'));
    });
    sec.querySelector('[data-action="whatsapp"]')?.addEventListener('click', () => {
      const text = buildPlainTextMealPlan();
      window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
    });
    sec.querySelector('[data-action="email"]')?.addEventListener('click', () => {
      const text = buildPlainTextMealPlan();
      window.location.href = 'mailto:?subject=' + encodeURIComponent('Můj jídelníček z NutriFit') + '&body=' + encodeURIComponent(text);
    });
    sec.querySelector('[data-action="print"]')?.addEventListener('click', () => {
      window.print();
    });
  }

  function buildPlainTextMealPlan() {
    const recipes = appState.currentRecipes || [];
    if (!recipes.length) return '';
    let text = 'Jídelníček z NutriFit\n========================\n\n';
    recipes.forEach(m => {
      text += `${m.mealType}: ${m.name}\n`;
      text += `  ${m.kcal} kcal | B: ${m.protein}g | S: ${m.carbs}g | T: ${m.fat}g\n`;
      text += `  Ingredience: ${(m.ingredients || []).join(', ')}\n\n`;
    });
    const total = recipes.reduce((s, r) => s + (r.kcal || 0), 0);
    text += `Celkem: ${total} kcal\n\nVygenerováno na nutri-fit-omega.vercel.app`;
    return text;
  }

  // Stripe checkout return — zobraz feedback
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') {
    window.history.replaceState({}, '', window.location.pathname);
    setTimeout(() => showToast('Platba proběhla úspěšně! Premium je nyní aktivní.', 'success'), 500);
  } else if (params.get('checkout') === 'cancel') {
    window.history.replaceState({}, '', window.location.pathname);
  }

  // Bootstrap — obnova session + naslouchání změnám autentizace
  initAuthListener(
    async () => {
      await migrateAnonymousTracking();
      await loadProfileOnStart();
      await refreshSelectedDay({ clearMissingPlan: true });
      getUsageInfo().then(updateUsageBadge);
    },
    () => {
      updateNavAuth();
      document.getElementById('usage-badge').style.display = 'none';
      refreshSelectedDay({ clearMissingPlan: true });
    }
  );

})();
