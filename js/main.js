// ── MAIN — init, event listenery, dark mode

import { appState, MEAL_NAMES, initAuthListener } from './state.js?v=9';
import { updateNavAuth, openAuthModal, closeAuthModal, handleLogin, handleRegister, handleLogout, getCurrentUser } from './auth.js?v=8';
import { calculate, startEdit, finishEdit, handleEditKey } from './calculator.js?v=9';
import { toggleDayPlanner } from './dayplanner.js?v=9';
import { generateMealPlan, closeRecipeModal, renderList } from './recipes.js?v=9';
import { openProfileModal, closeProfileModal, saveProfile, loadProfileOnStart } from './profile.js?v=9';
import { getUsageInfo, FREE_LIMIT } from './generation-limit.js?v=8';
import { initOnboardingWizard } from './ui/onboarding.js?v=1';
import { normalizeFoodEstimate, parseGeminiJSON } from './ai-utils.js?v=8';
import { calcMacroTargets, adjustForDay, ACTIVITY_FACTORS, planWeeklyAdjustment, calcFatTargetG } from './domain/nutrition.js?v=2';
import { buildTrainingSessionForDate, startOfWeekISO } from './services/daily-training-session.js?v=1';
import { generateTrainingPlan } from './domain/training.js?v=1';
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
      appState.macros = {
        ...appState.macros,
        ...day.target,
        age: appState.macros.age || Number(document.getElementById('age')?.value || 0),
        height: appState.macros.height || Number(document.getElementById('height')?.value || 0),
        weight: day.target.weight || appState.macros.weight || Number(document.getElementById('weight')?.value || 0),
        gender: appState.macros.gender || appState.gender,
        waterGoalMl: day.target.waterGoalMl || day.target.water_goal_ml || 0,
      };
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
  import('./shopping.js?v=9').then(({ buildShoppingList }) => buildShoppingList(appState.currentRecipes));
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

function applyDailyAdjustmentForSelectedDay() {
  const baseline = getBaselineMacrosForAdjustment();
  if (!baseline?.kcal) {
    appState.todaySession = null;
    appState.dailyAdjustment = null;
    return;
  }

  const selectedDate = appState.selectedDate || dateKey();
  const session = buildTrainingSessionForDate(selectedDate, readWizardTrainingGoal(), {
    used: appState.dayPlannerUsed,
    activities: appState.dayPlannerActivities,
  });
  const adjusted = adjustForDay(toDomainMacros(baseline), session, { weightKg: baseline.weight || 70 });
  const adjustedUi = {
    ...baseline,
    kcal: adjusted.kcal,
    protein: adjusted.proteinG,
    carbs: adjusted.carbsG,
    fat: adjusted.fatG,
    fiber: adjusted.fiberG,
    waterGoalMl: adjusted.waterMl,
  };

  appState.baselineMacros = baseline;
  appState.macros = adjustedUi;
  appState.todaySession = session;
  appState.dailyAdjustment = {
    note: adjusted.note || 'Dnešní cíl je upravený podle tréninku.',
    kcalDelta: adjustedUi.kcal - baseline.kcal,
    carbsDelta: adjustedUi.carbs - baseline.carbs,
    fatDelta: adjustedUi.fat - baseline.fat,
    proteinDelta: adjustedUi.protein - baseline.protein,
    source: appState.dayPlannerUsed ? 'day_planner' : (session ? 'wizard_training_goal' : 'rest_day'),
  };
}

function getBaselineMacrosForAdjustment() {
  if (appState.baselineMacros?.kcal && hasProfileFields(appState.baselineMacros)) {
    return { ...appState.baselineMacros };
  }
  if (!hasProfileFields(appState.macros)) return null;
  const profile = profileFromUiMacros(appState.macros);
  const target = calcMacroTargets(profile, { kind: goalToDomain(appState.macros.goal || appState.goal) });
  return {
    kcal: target.kcal,
    protein: target.proteinG,
    carbs: target.carbsG,
    fat: target.fatG,
    fiber: target.fiberG,
    bmr: target.bmr,
    tdee: target.tdee,
    waterGoalMl: target.waterMl,
    weight: appState.macros.weight,
    height: appState.macros.height,
    age: appState.macros.age,
    gender: appState.macros.gender || appState.gender,
    goal: appState.macros.goal || appState.goal,
  };
}

function hasProfileFields(macros) {
  return Number(macros?.weight) > 0 && Number(macros?.height) > 0 && Number(macros?.age) > 0;
}

function profileFromUiMacros(macros) {
  return {
    sex: (macros.gender || appState.gender) === 'muz' ? 'male' : 'female',
    ageYears: Number(macros.age),
    heightCm: Number(macros.height),
    weightKg: Number(macros.weight),
    activityLevel: activityFactorToLevel(appState.activityFactor),
  };
}

function toDomainMacros(macros) {
  return {
    kcal: Number(macros.kcal || 0),
    proteinG: Number(macros.protein || 0),
    carbsG: Number(macros.carbs || 0),
    fatG: Number(macros.fat || 0),
    fiberG: Number(macros.fiber || 0),
    waterMl: Number(macros.waterGoalMl || macros.waterMl || 0),
    bmr: Number(macros.bmr || 0),
    tdee: Number(macros.tdee || 0),
    goal: goalToDomain(macros.goal || appState.goal),
    note: macros.note,
  };
}

function goalToDomain(goal) {
  return ({
    'hubnutí': 'fat_loss',
    'udržení': 'maintenance',
    'nabírání': 'muscle_gain',
    fat_loss: 'fat_loss',
    maintenance: 'maintenance',
    muscle_gain: 'muscle_gain',
    endurance: 'endurance',
    general_fitness: 'general_fitness',
  })[goal] || 'maintenance';
}

function activityFactorToLevel(factor) {
  let best = 'light';
  let bestDiff = Infinity;
  for (const [level, value] of Object.entries(ACTIVITY_FACTORS)) {
    const diff = Math.abs(value - Number(factor || 1.375));
    if (diff < bestDiff) { best = level; bestDiff = diff; }
  }
  return best;
}

function readWizardTrainingGoal() {
  try {
    const parsed = JSON.parse(localStorage.getItem('nutriplan-training-goal') || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function renderTrackingShell() {
  applyDailyAdjustmentForSelectedDay();
  renderMacroValues();
  renderDailyAdjustmentCard();
  renderDateNav();
  renderFirstRunState();
  renderDailyOverview();
  renderPlannedLogList();
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
  if (target === 'training') {
    renderTrainingPlan();
  }
  if (options.scroll) {
    document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Přepíná mezi metodami zápisu (Ručně / Foto / Z plánu) v "Zapsat" panelu.
// Estimate output je sdílený, takže se vyčistí při změně metody.
function setActiveLogMethod(method) {
  document.querySelectorAll('[data-log-method]').forEach(btn => {
    const active = btn.dataset.logMethod === method;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('[data-log-method-panel]').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.logMethodPanel === method);
  });
  // Vyčistit estimate output při přepnutí metody (jiný typ vstupu = jiný estimate)
  appState.pendingFoodEstimate = null;
  setPhotoActionsVisible(false);
  const out = document.getElementById('photo-estimate-output');
  if (out) out.style.display = 'none';
}

// AI odhad maker z textového popisu jídla (bez fotky).
// Reuse infrastrukturu pro photo estimate — stejný preview, stejný "Přidat do dne" flow.
async function analyzeFoodText() {
  const input = document.getElementById('manual-food-text');
  const btn = document.getElementById('btn-text-estimate');
  const out = document.getElementById('photo-estimate-output');
  const description = (input?.value || '').trim();
  if (!description) {
    showToast('Napiš co jsi snědl/a — třeba „velký talíř těstovin".', 'error');
    input?.focus();
    return;
  }
  if (description.length > 500) {
    showToast('Popis je moc dlouhý. Zkrať ho na ~500 znaků.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Odhaduji…';
  appState.pendingFoodEstimate = null;
  setPhotoActionsVisible(false);
  setPhotoOutputMessage(out, 'AI počítá makra z popisu…');

  const systemPrompt = `You are NutriPlan AI, a Czech nutrition assistant. From the user's meal description, return a JSON object with an estimated nutrition breakdown. Return ONLY valid JSON with no extra text. All user-facing JSON string values must be in Czech.

Estimation rules:
- If the description contains a quantity, for example "300g", use it. Otherwise estimate an average adult portion.
- kcal must match: protein*4 + carbs*4 + fat*9 (±5 kcal).
- confidence must be "vysoká" when the description contains specific quantities, "střední" for common meals without quantities, and "nízká" for vague descriptions.`;

  const prompt = `Meal description: "${description.replace(/"/g, "'")}"

Return JSON in this format:
{"foodName":"Český název jídla","portionGuess":"Odhadovaná porce (např. 300g, 1 talíř)","kcal":0,"protein":0,"carbs":0,"fat":0,"confidence":"střední","note":"Krátká poznámka k odhadu (1 věta)"}`;

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, prompt, maxTokens: 600 }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || `Chyba serveru (${res.status})`);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('AI nevrátila odpověď.');
    const estimate = normalizeFoodEstimate(parseGeminiJSON(text, 'Odhad z popisu'));
    appState.pendingFoodEstimate = { ...buildFoodLogItem(estimate), source: 'manual' };
    renderFoodEstimate(out, estimate);
    setPhotoActionsVisible(true);
  } catch (err) {
    appState.pendingFoodEstimate = null;
    setPhotoActionsVisible(false);
    setPhotoOutputMessage(out, `Nepodařilo se odhadnout: ${err.message || 'Neznámá chyba'}`, 'error');
    showToast('Odhad z popisu selhal.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Spočítat z popisu';
  }
}

// Vykreslí seznam plánovaných jídel v "Zapsat" panelu pro rychlý one-click záznam.
function renderPlannedLogList() {
  const container = document.getElementById('log-planned-list');
  if (!container) return;
  const meals = appState.currentRecipes?.length
    ? appState.currentRecipes
    : (appState.dailyData?.mealPlan?.meals || []);
  container.replaceChildren();

  if (!meals.length) {
    const empty = document.createElement('div');
    empty.className = 'log-planned-empty';
    empty.textContent = 'Nejprve si nech vygenerovat plán dne (záložka Plán), pak tu budou jednotlivá jídla k zapsání jedním klikem.';
    container.appendChild(empty);
    return;
  }

  meals.forEach(meal => {
    const logged = (appState.foodLog || []).some(entry => entry.plannedMealId === meal.plannedMealId);
    const row = document.createElement('div');
    row.className = `log-planned-item${logged ? ' logged' : ''}`;
    const info = document.createElement('div');
    info.className = 'planned-info';
    const name = document.createElement('div');
    name.className = 'planned-name';
    name.textContent = `${meal.mealType || 'Jídlo'}: ${meal.name}`;
    const meta = document.createElement('div');
    meta.className = 'planned-meta';
    meta.textContent = `${meal.kcal} kcal · B ${meal.protein}g · S ${meal.carbs}g · T ${meal.fat}g`;
    info.append(name, meta);
    const btn = document.createElement('button');
    btn.className = 'btn-primary compact';
    btn.type = 'button';
    btn.textContent = logged ? 'Zapsáno' : 'Snědl jsem';
    btn.disabled = logged;
    if (!logged) btn.addEventListener('click', () => addPlannedMeal(meal));
    row.append(info, btn);
    container.appendChild(row);
  });
}

// Kontext-aware primary CTA: mění copy + tlačítka podle stavu uživatele.
// Cíl: aby na "Dnes" tabu byla VŽDY jasná příští akce.
function renderFirstRunState() {
  const card = document.getElementById('first-run-card');
  const title = document.getElementById('first-run-title');
  const subtitle = document.getElementById('first-run-subtitle');
  const actions = document.getElementById('first-run-actions');
  if (!card || !title || !subtitle || !actions) return;

  // Bez maker se karta nezobrazuje vůbec
  if (!appState.macros?.kcal) {
    card.style.display = 'none';
    return;
  }

  const selectedDate = appState.selectedDate || dateKey();
  const isToday = selectedDate === dateKey();
  const planMeals = appState.currentRecipes?.length
    ? appState.currentRecipes
    : (appState.dailyData?.mealPlan?.meals || []);
  const hasPlan = planMeals.length > 0;
  const log = appState.foodLog || [];
  const totals = sumFoodLog();
  const kcalGoal = appState.macros.kcal;
  const goalMetRatio = kcalGoal ? totals.kcal / kcalGoal : 0;

  // Reset card class state
  card.className = 'first-run-card';
  card.style.display = 'grid';
  actions.replaceChildren();

  // Stav 1: prohlížím minulý den, žádné akce (read-only mode)
  if (!isToday) {
    card.classList.add('state-readonly');
    title.textContent = `Prohlížíš ${formatDayLabel(selectedDate).toLowerCase()}`;
    subtitle.textContent = log.length
      ? `Tady je ${log.length} ${log.length === 1 ? 'zápis' : log.length < 5 ? 'zápisy' : 'zápisů'}. Akce (plán, foto) můžeš dělat jen pro dnešek.`
      : 'Pro tento den není nic zapsané. Pro úpravu se vrať na dnešek.';
    const backBtn = document.createElement('button');
    backBtn.className = 'btn-primary compact';
    backBtn.type = 'button';
    backBtn.textContent = '← Zpět na dnešek';
    backBtn.addEventListener('click', async () => {
      appState.selectedDate = dateKey();
      await refreshSelectedDay({ clearMissingPlan: true });
    });
    actions.appendChild(backBtn);
    return;
  }

  // Stav 2: cíl splněn (≥85 % kalorií) — celebration mode
  if (goalMetRatio >= 0.85 && goalMetRatio <= 1.10) {
    card.classList.add('state-goal-met');
    title.textContent = 'Dobrá práce, dnešek máš zapsaný';
    const streak = appState.trackingTrends?.streak || 0;
    subtitle.textContent = streak > 0
      ? `Sériový rekord: ${streak} ${streak === 1 ? 'den' : streak < 5 ? 'dny' : 'dní'} v řadě nad 80 % bílkovin. Drž se.`
      : 'Začínáš novou sérii. Drž se a uvidíš streak.';
    const moreBtn = document.createElement('button');
    moreBtn.className = 'btn-secondary compact';
    moreBtn.type = 'button';
    moreBtn.textContent = 'Přidat další jídlo';
    moreBtn.addEventListener('click', () => setActiveAppTab('log', { scroll: true }));
    actions.appendChild(moreBtn);
    return;
  }

  // Stav 3: cíl překročen — varování
  if (goalMetRatio > 1.10) {
    card.classList.add('state-goal-met');
    title.textContent = 'Překročil/a jsi denní cíl';
    subtitle.textContent = `Zapsáno ${totals.kcal} z ${kcalGoal} kcal. Není to konec světa — zkus zítra menší porce.`;
    return;
  }

  // Stav 4: plán existuje, čekají nezapsaná jídla
  if (hasPlan) {
    const next = planMeals.find(meal => !log.some(entry => entry.plannedMealId === meal.plannedMealId));
    if (next) {
      card.classList.add('state-plan-ready');
      title.textContent = `Další jídlo: ${next.mealType || 'jídlo'}`;
      subtitle.textContent = `${next.name} · ${next.kcal} kcal · ${next.prepTime || '—'} min. Klikni „Snědl jsem" až to bude na talíři.`;
      const eatBtn = document.createElement('button');
      eatBtn.className = 'btn-primary compact';
      eatBtn.type = 'button';
      eatBtn.textContent = `Snědl jsem ${mealTypeAccusative(next.mealType)}`;
      eatBtn.addEventListener('click', () => addPlannedMeal(next));
      actions.appendChild(eatBtn);
      const otherBtn = document.createElement('button');
      otherBtn.className = 'btn-secondary compact';
      otherBtn.type = 'button';
      otherBtn.textContent = 'Zapsat jiné jídlo';
      otherBtn.addEventListener('click', () => setActiveAppTab('log', { scroll: true }));
      actions.appendChild(otherBtn);
      return;
    }
    // Všechna plánovaná jídla zapsaná, ale cíl ještě nedosažený → asi user sní něco navíc
    card.classList.add('state-plan-ready');
    title.textContent = 'Všechna plánovaná jídla zapsaná';
    subtitle.textContent = `Ještě ti zbývá ${Math.max(0, kcalGoal - totals.kcal)} kcal. Můžeš přidat svačinu nebo zapsat něco navíc.`;
    const logBtn = document.createElement('button');
    logBtn.className = 'btn-primary compact';
    logBtn.type = 'button';
    logBtn.textContent = 'Zapsat další jídlo';
    logBtn.addEventListener('click', () => setActiveAppTab('log', { scroll: true }));
    actions.appendChild(logBtn);
    return;
  }

  // Stav 5: žádný plán + nějaký log existuje → user logoval ručně, asi nemá plán
  if (log.length > 0) {
    card.classList.add('state-plan-ready');
    title.textContent = 'Zatím nemáš plán dne';
    subtitle.textContent = `Zapsáno ${totals.kcal} z ${kcalGoal} kcal. Můžeš si nechat sestavit zbytek dne.`;
    const planBtn = document.createElement('button');
    planBtn.className = 'btn-primary compact';
    planBtn.type = 'button';
    planBtn.textContent = 'Sestavit plán';
    planBtn.addEventListener('click', () => {
      setActiveAppTab('plan', { scroll: true });
    });
    actions.appendChild(planBtn);
    const logBtn = document.createElement('button');
    logBtn.className = 'btn-secondary compact';
    logBtn.type = 'button';
    logBtn.textContent = 'Zapsat další';
    logBtn.addEventListener('click', () => setActiveAppTab('log', { scroll: true }));
    actions.appendChild(logBtn);
    return;
  }

  // Stav 6 (default): fresh start — žádný plán, žádný log
  title.textContent = 'Co chceš udělat teď?';
  subtitle.textContent = 'Nejjednodušší je nechat si vygenerovat dnešní jídelníček. Když už jsi jedl/a, zapiš to rovnou.';
  const planBtn = document.createElement('button');
  planBtn.className = 'btn-primary compact';
  planBtn.id = 'btn-start-plan';
  planBtn.type = 'button';
  planBtn.textContent = 'Vygenerovat jídelníček';
  planBtn.addEventListener('click', () => {
    setActiveAppTab('plan', { scroll: true });
    generateMealPlan(setStep);
  });
  actions.appendChild(planBtn);
  const photoBtn = document.createElement('button');
  photoBtn.className = 'btn-secondary compact';
  photoBtn.id = 'btn-start-photo';
  photoBtn.type = 'button';
  photoBtn.textContent = 'Zapsat jídlo';
  photoBtn.addEventListener('click', () => setActiveAppTab('log', { scroll: true }));
  actions.appendChild(photoBtn);
}

function mealTypeAccusative(mealType) {
  const value = String(mealType || 'jídlo').trim().toLowerCase();
  const forms = {
    'snídaně': 'snídani',
    'snidane': 'snídani',
    'dop. svačina': 'dopolední svačinu',
    'dopolední svačina': 'dopolední svačinu',
    'dopoledni svacina': 'dopolední svačinu',
    'svačina': 'svačinu',
    'svacina': 'svačinu',
    'oběd': 'oběd',
    'obed': 'oběd',
    'odp. svačina': 'odpolední svačinu',
    'odpolední svačina': 'odpolední svačinu',
    'odpoledni svacina': 'odpolední svačinu',
    'večeře': 'večeři',
    'vecere': 'večeři',
    'jídlo': 'jídlo',
    'jidlo': 'jídlo',
  };
  return forms[value] || value;
}

function renderMacroValues() {
  if (!appState.macros?.kcal) return;
  ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'bmr', 'tdee'].forEach(key => {
    const el = document.getElementById(`r-${key}`);
    if (el && appState.macros[key] !== undefined) el.textContent = appState.macros[key];
  });
}

function renderDailyAdjustmentCard() {
  const card = document.getElementById('daily-adjustment-card');
  const title = document.getElementById('daily-adjustment-title');
  const text = document.getElementById('daily-adjustment-text');
  const metrics = document.getElementById('daily-adjustment-metrics');
  const detail = document.getElementById('daily-adjustment-detail');
  if (!card || !title || !text || !metrics) return;
  if (!appState.macros?.kcal || !appState.baselineMacros?.kcal || !appState.dailyAdjustment) {
    card.style.display = 'none';
    if (detail) detail.style.display = 'none';
    return;
  }

  const session = appState.todaySession;
  const adjustment = appState.dailyAdjustment;
  card.style.display = 'grid';
  title.textContent = session && session.kind !== 'rest'
    ? session.title || 'Dnešní trénink'
    : 'Volný den / lehčí den';
  text.textContent = adjustment.note;
  metrics.replaceChildren(
    adjustmentPill('Kalorie', adjustment.kcalDelta, 'kcal'),
    adjustmentPill('Sacharidy', adjustment.carbsDelta, 'g'),
    adjustmentPill('Tuky', adjustment.fatDelta, 'g'),
  );

  if (detail) {
    detail.style.display = 'block';
    detail.textContent = `Baseline ${appState.baselineMacros.kcal} kcal → dnes ${appState.macros.kcal} kcal (${formatDelta(adjustment.kcalDelta)} kcal), sacharidy ${formatDelta(adjustment.carbsDelta)} g.`;
  }
}

function adjustmentPill(label, delta, unit) {
  const el = document.createElement('span');
  el.className = `adjustment-pill ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'same'}`;
  el.textContent = `${label}: ${formatDelta(delta)} ${unit}`;
  return el;
}

function formatDelta(value) {
  const rounded = Math.round(Number(value || 0));
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function renderDateNav() {
  const label = document.getElementById('selected-date-label');
  const chips = document.getElementById('date-chip-list');
  const bar = document.getElementById('global-date-bar');
  const banner = document.getElementById('past-day-banner');
  const bannerLabel = document.getElementById('past-day-banner-label');
  const selectedKey = appState.selectedDate || dateKey();
  const todayKey = dateKey();
  const isToday = selectedKey === todayKey;
  const formatted = formatDayLabel(selectedKey);

  if (label) label.textContent = formatted;

  // Zvýrazni bar a banner když user prohlíží minulý den
  if (bar) bar.classList.toggle('past-day', !isToday);
  if (banner) {
    banner.style.display = isToday ? 'none' : 'flex';
    if (bannerLabel) bannerLabel.textContent = `Prohlížíš ${formatted.toLowerCase()}`;
  }

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

async function loadRecentCheckIns() {
  const user = getCurrentUser();
  if (user) {
    try {
      const { supabase } = await import('./supabase.js?v=8');
      const { data, error } = await supabase
        .from('weekly_checkins')
        .select('*')
        .eq('user_id', user.id)
        .order('week_start_date', { ascending: true });
      if (!error && data) {
        return data.map(item => ({
          weekStartISO: item.week_start_date,
          weightKg: Number(item.weight_kg),
          adherence: Number(item.adherence),
          energyLevel: item.energy_level,
          hungerLevel: item.hunger_level,
          notes: item.notes,
          kcalDelta: item.kcal_delta,
          reason: item.reason,
        }));
      }
    } catch (err) {
      console.error('Chyba při stahování check-inů z DB:', err);
    }
  }
  
  // Local storage fallback
  try {
    const local = JSON.parse(localStorage.getItem('nutriplan-weekly-checkins') || '[]');
    return Array.isArray(local) ? local : [];
  } catch {
    return [];
  }
}

async function openCheckInModal() {
  const modal = document.getElementById('checkin-modal');
  if (!modal) return;
  
  // Pre-fill weight with current macro target weight
  const weightInput = document.getElementById('checkin-weight-input');
  if (weightInput) {
    weightInput.value = appState.dailyData?.weight?.weightKg || appState.macros?.weight || '';
  }
  
  // Reset rating groups to default active (value 3)
  document.querySelectorAll('#checkin-hunger-group .toggle-btn, #checkin-energy-group .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === '3');
  });
  
  // Reset slider
  const adherenceInput = document.getElementById('checkin-adherence-input');
  const adherenceVal = document.getElementById('checkin-adherence-val');
  if (adherenceInput && adherenceVal) {
    adherenceInput.value = '80';
    adherenceVal.textContent = '80';
  }
  
  // Hide results card
  const resultCard = document.getElementById('checkin-result-card');
  if (resultCard) resultCard.style.display = 'none';
  
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function renderTrainingPlan() {
  const listEl = document.getElementById('training-sessions-list');
  const warningsBox = document.getElementById('training-warnings-box');
  const warningsList = document.getElementById('training-warnings-list');
  if (!listEl) return;

  const wizardGoal = readWizardTrainingGoal();
  if (!wizardGoal || !wizardGoal.trainingGoal) {
    listEl.innerHTML = `
      <div class="empty-state" style="padding: 40px 20px; text-align: center; display: flex; flex-direction: column; align-items: center;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px;"><path d="M6.5 6.5h11M6.5 17.5h11M3 10h18M3 14h18M2 5v14M22 5v14"/></svg>
        <h3 style="margin-top: 16px; font-size: 1.1rem; font-weight: 700; color: var(--text);">Nemáš nastavený tréninkový cíl</h3>
        <p style="color: var(--text-secondary); max-width: 320px; margin: 8px auto 20px; font-size: 0.9rem;">
          Vyplň onboarding dotazník a získej tréninkový plán na míru pro tvůj sportovní cíl.
        </p>
      </div>
    `;
    if (warningsBox) warningsBox.style.display = 'none';
    return;
  }

  // Generate training plan using our domain core
  const selectedDate = appState.selectedDate || dateKey();
  const weekStart = startOfWeekISO(selectedDate);
  
  const plan = generateTrainingPlan({
    goal: {
      kind: wizardGoal.trainingGoal,
      sessionsPerWeek: wizardGoal.sessionsPerWeek || 3,
    },
    weekStartISO: weekStart,
    weekIndex: 0,
    recentWorkouts: [],
    recentSleep: [],
  });

  // Render warnings
  if (warningsBox && warningsList) {
    if (plan.warnings?.length) {
      warningsList.replaceChildren();
      plan.warnings.forEach(w => {
        const li = document.createElement('li');
        li.textContent = w;
        warningsList.appendChild(li);
      });
      warningsBox.style.display = 'block';
    } else {
      warningsBox.style.display = 'none';
    }
  }

  // Load completed workouts state
  let completed = {};
  try {
    completed = JSON.parse(localStorage.getItem('nutriplan-completed-workouts') || '{}');
  } catch {}

  // Render sessions
  listEl.replaceChildren();
  plan.sessions.forEach((session) => {
    const isCompleted = !!completed[session.date];
    
    const row = document.createElement('div');
    row.className = `card training-session-row ${session.intensity} ${isCompleted ? 'completed' : ''}`;
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-1);
      transition: all 0.2s ease;
      margin-bottom: 8px;
      ${isCompleted ? 'opacity: 0.7; border-color: var(--accent);' : ''}
    `;

    // Intensity color mapping
    const intensityColor = {
      easy: '#4cd964',
      moderate: '#ff9500',
      hard: '#ff3b30',
      rest: 'var(--text-tertiary)'
    }[session.intensity] || 'var(--text)';

    row.innerHTML = `
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span style="font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: ${intensityColor};">
            ${session.intensity.toUpperCase()}
          </span>
          ${session.distanceKm ? `<span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">· ${session.distanceKm} km</span>` : ''}
          ${session.durationMinutes ? `<span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">· ${session.durationMinutes} min</span>` : ''}
        </div>
        <h4 style="font-size: 0.9rem; font-weight: 600; color: var(--text); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${session.title}
        </h4>
        ${session.notes ? `<p style="font-size: 0.78rem; color: var(--text-tertiary); margin: 2px 0 0;">${session.notes}</p>` : ''}
      </div>
      <div style="display: flex; align-items: center; gap: 12px; margin-left: 16px;">
        <button class="btn-text" data-goto-date="${session.date}" style="padding: 4px 8px; font-size: 0.75rem;">Přejít</button>
        <input type="checkbox" data-complete-date="${session.date}" ${isCompleted ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer;">
      </div>
    `;

    // Add event listener to "Přejít na den"
    row.querySelector(`[data-goto-date]`).addEventListener('click', async (e) => {
      const date = e.target.dataset.gotoDate;
      appState.selectedDate = date;
      await refreshSelectedDay({ clearMissingPlan: true });
      setActiveAppTab('today');
    });

    // Add event listener to checkbox
    row.querySelector(`[data-complete-date]`).addEventListener('change', (e) => {
      const checked = e.target.checked;
      const date = e.target.dataset.completeDate;
      try {
        const comp = JSON.parse(localStorage.getItem('nutriplan-completed-workouts') || '{}');
        if (checked) {
          comp[date] = true;
          row.style.opacity = '0.7';
          row.style.borderColor = 'var(--accent)';
        } else {
          delete comp[date];
          row.style.opacity = '';
          row.style.borderColor = '';
        }
        localStorage.setItem('nutriplan-completed-workouts', JSON.stringify(comp));
      } catch (err) {
        console.error(err);
      }
    });

    listEl.appendChild(row);
  });
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

function setLegacyOnboardingVisible(visible) {
  document.querySelector('.steps-row')?.style.setProperty('display', visible ? 'flex' : 'none');
  document.querySelectorAll('.onboarding-card').forEach(card => {
    card.style.display = visible ? '' : 'none';
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
  const checkDisclaimerAndGenerate = () => {
    if (localStorage.getItem('nutriplan-safety-disclaimer-accepted') === 'true') {
      generateMealPlan(setStep);
    } else {
      const modal = document.getElementById('safety-disclaimer-modal');
      if (modal) {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
      }
    }
  };

  document.getElementById('btn-accept-disclaimer')?.addEventListener('click', () => {
    localStorage.setItem('nutriplan-safety-disclaimer-accepted', 'true');
    const modal = document.getElementById('safety-disclaimer-modal');
    if (modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
    generateMealPlan(setStep);
  });

  document.getElementById('btn-generate')?.addEventListener('click', () => {
    setActiveAppTab('plan');
    checkDisclaimerAndGenerate();
  });
  document.getElementById('btn-start-plan')?.addEventListener('click', () => {
    setActiveAppTab('plan', { scroll: true });
    checkDisclaimerAndGenerate();
  });
  document.getElementById('btn-start-photo')?.addEventListener('click', () => setActiveAppTab('log', { scroll: true }));
  document.querySelectorAll('[data-app-tab]').forEach(tab => {
    tab.addEventListener('click', () => setActiveAppTab(tab.dataset.appTab));
  });
  document.getElementById('btn-photo-estimate')?.addEventListener('click', analyzeFoodPhoto);
  document.getElementById('btn-text-estimate')?.addEventListener('click', analyzeFoodText);
  document.getElementById('btn-add-photo-meal')?.addEventListener('click', addPendingFoodEstimate);
  document.getElementById('btn-discard-photo-meal')?.addEventListener('click', discardPendingFoodEstimate);
  document.querySelectorAll('[data-log-method]').forEach(tab => {
    tab.addEventListener('click', () => setActiveLogMethod(tab.dataset.logMethod));
  });
  document.getElementById('manual-food-text')?.addEventListener('keydown', e => {
    // Cmd/Ctrl + Enter spustí odhad
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      analyzeFoodText();
    }
  });
  document.getElementById('clear-food-log')?.addEventListener('click', clearFoodLog);
  document.getElementById('date-chip-list')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-date]');
    if (!btn) return;
    appState.selectedDate = btn.dataset.date;
    await refreshSelectedDay({ clearMissingPlan: true });
  });
  document.getElementById('back-to-today-btn')?.addEventListener('click', async () => {
    appState.selectedDate = dateKey();
    await refreshSelectedDay({ clearMissingPlan: true });
  });
  document.getElementById('water-plus')?.addEventListener('click', () => changeWater(250));
  document.getElementById('water-minus')?.addEventListener('click', () => changeWater(-250));
  document.getElementById('water-reset')?.addEventListener('click', () => changeWater(-(appState.dailyData?.water?.amountMl || 0)));
  document.getElementById('save-weight-btn')?.addEventListener('click', saveWeightFromInput);
  
  document.getElementById('btn-start-checkin')?.addEventListener('click', openCheckInModal);
  
  document.getElementById('checkin-close')?.addEventListener('click', () => {
    const modal = document.getElementById('checkin-modal');
    if (modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  document.querySelectorAll('#checkin-hunger-group .toggle-btn, #checkin-energy-group .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.parentElement;
      group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const checkinAdherenceInput = document.getElementById('checkin-adherence-input');
  checkinAdherenceInput?.addEventListener('input', () => {
    const adherenceVal = document.getElementById('checkin-adherence-val');
    if (adherenceVal) adherenceVal.textContent = checkinAdherenceInput.value;
  });

  document.getElementById('checkin-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const weightVal = parseFloat(document.getElementById('checkin-weight-input').value);
    const adherenceVal = parseFloat(document.getElementById('checkin-adherence-input').value) / 100;
    const hungerVal = parseInt(document.querySelector('#checkin-hunger-group .toggle-btn.active')?.dataset.value || '3');
    const energyVal = parseInt(document.querySelector('#checkin-energy-group .toggle-btn.active')?.dataset.value || '3');
    const notesVal = document.getElementById('checkin-notes-input').value;

    const checkIn = {
      weekStartISO: appState.selectedDate || dateKey(),
      weightKg: weightVal,
      adherence: adherenceVal,
      energyLevel: energyVal,
      hungerLevel: hungerVal,
      notes: notesVal,
    };

    // Load recent check-ins
    const checkIns = await loadRecentCheckIns();
    checkIns.push(checkIn);

    // Call planWeeklyAdjustment
    const goalKind = goalToDomain(appState.macros?.goal || appState.goal);
    const nutritionGoal = { kind: goalKind };
    
    // Fallback previousBaseline if none exists
    const prevBaseline = appState.baselineMacros || appState.macros || { kcal: 2000, protein: 120, carbs: 200, fat: 70 };
    
    const adjustment = planWeeklyAdjustment(prevBaseline, nutritionGoal, checkIns);
    
    // Store adjustment globally in state so it can be committed
    appState.tempCheckIn = checkIn;
    appState.tempAdjustment = adjustment;

    // Render results
    const reasonEl = document.getElementById('checkin-result-reason');
    if (reasonEl) reasonEl.innerHTML = `<strong>Doporučení:</strong> ${adjustment.reason}<br><br>Příjem se změní o: <strong>${adjustment.kcalDelta > 0 ? '+' : ''}${adjustment.kcalDelta} kcal</strong>`;
    
    const warningsEl = document.getElementById('checkin-result-warnings');
    if (warningsEl) {
      warningsEl.replaceChildren();
      if (adjustment.warnings?.length) {
        adjustment.warnings.forEach(warn => {
          const p = document.createElement('div');
          p.style.display = 'flex';
          p.style.alignItems = 'center';
          p.style.gap = '6px';
          p.innerHTML = `<span><strong>Upozornění:</strong> ${warn}</span>`;
          warningsEl.appendChild(p);
        });
      }
    }
    
    // Show results block
    const resultCard = document.getElementById('checkin-result-card');
    if (resultCard) resultCard.style.display = 'flex';
  });

  document.getElementById('btn-apply-checkin-adjustment')?.addEventListener('click', async () => {
    if (!appState.tempAdjustment) return;
    
    const adjustment = appState.tempAdjustment;
    const checkIn = appState.tempCheckIn;
    
    // Apply calorie delta to baselineMacros
    const kcalDelta = adjustment.kcalDelta;
    if (!appState.baselineMacros) {
      appState.baselineMacros = { ...appState.macros };
    }
    appState.baselineMacros.kcal = Math.max(1200, (appState.baselineMacros.kcal || 2000) + kcalDelta);
    
    // Recalculate carbs and fats
    const profile = profileFromUiMacros(appState.baselineMacros);
    const fatG = calcFatTargetG(profile, appState.baselineMacros.kcal);
    // Keep protein targets constant
    const proteinG = appState.baselineMacros.protein || Math.round(profile.weightKg * 2.0);
    const carbsG = Math.max(0, Math.round((appState.baselineMacros.kcal - proteinG * 4 - fatG * 9) / 4));
    
    appState.baselineMacros.fat = fatG;
    appState.baselineMacros.carbs = carbsG;
    appState.baselineMacros.protein = proteinG;
    appState.baselineMacros.weight = checkIn.weightKg;
    
    // Persist check-in to Supabase and/or localStorage
    const user = getCurrentUser();
    if (user) {
      try {
        const { supabase } = await import('./supabase.js?v=8');
        const { error } = await supabase
          .from('weekly_checkins')
          .upsert({
            user_id: user.id,
            week_start_date: checkIn.weekStartISO,
            weight_kg: checkIn.weightKg,
            adherence: checkIn.adherence,
            energy_level: checkIn.energyLevel,
            hunger_level: checkIn.hungerLevel,
            notes: checkIn.notes,
            kcal_delta: kcalDelta,
            reason: adjustment.reason,
          }, { onConflict: 'user_id,week_start_date' });
        if (error) throw error;
      } catch (err) {
        console.error('Chyba při ukládání check-inu:', err.message);
      }
    }
    
    // Store check-in locally
    try {
      const local = JSON.parse(localStorage.getItem('nutriplan-weekly-checkins') || '[]');
      local.push({
        ...checkIn,
        kcalDelta,
        reason: adjustment.reason,
      });
      localStorage.setItem('nutriplan-weekly-checkins', JSON.stringify(local));
    } catch (err) {
      console.error('Chyba při ukládání check-inu do localStorage:', err);
    }
    
    // Update weight history in app state and database
    await upsertWeight(checkIn.weekStartISO, checkIn.weightKg, 'profile');
    
    // Update current macros
    appState.macros = { ...appState.baselineMacros };
    await persistCurrentTarget();
    
    // Close modal
    const modal = document.getElementById('checkin-modal');
    if (modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
    
    // Clear temporary state
    appState.tempAdjustment = null;
    appState.tempCheckIn = null;
    
    // Reset form and result card
    document.getElementById('checkin-form')?.reset();
    const resultCard = document.getElementById('checkin-result-card');
    if (resultCard) resultCard.style.display = 'none';
    
    showToast('Týdenní adaptace byla uplatněna a uložena.', 'success');
  });

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
  if (localStorage.getItem('nutriplan-onboarding-done')) setLegacyOnboardingVisible(false);
  refreshSelectedDay({ clearMissingPlan: true });

  // ── ONBOARDING WIZARD — shows only on first visit
  initOnboardingWizard({
    onComplete(result) {
      setLegacyOnboardingVisible(false);
      // Map wizard result → existing form state
      setGender(result.sex);
      const goalMap = { fat_loss: 'hubnutí', maintenance: 'udržení', muscle_gain: 'nabírání', endurance: 'hubnutí', general_fitness: 'udržení' };
      const czechGoal = goalMap[result.nutritionKind] ?? 'udržení';
      appState.goal = czechGoal;
      document.querySelectorAll('[data-goal]').forEach(c => c.classList.toggle('active', c.dataset.goal === czechGoal));
      document.getElementById('age').value = result.age;
      document.getElementById('height').value = result.height;
      document.getElementById('weight').value = result.weight;
      appState.activityFactor = result.activityFactor;
      document.querySelectorAll('.freq-card').forEach(c => c.classList.toggle('active', parseFloat(c.dataset.factor) === result.activityFactor));
      // Persist wizard-specific fields for later use by training planner
      localStorage.setItem('nutriplan-training-goal', JSON.stringify({ primaryGoal: result.primaryGoal, trainingGoal: result.trainingGoal, experience: result.experience, sessionsPerWeek: result.sessionsPerWeek }));
      
      // Save result to Supabase if logged in
      const user = getCurrentUser();
      if (user) {
        const profile = {
          gender: result.sex,
          goal: czechGoal,
          age: result.age,
          height: result.height,
          weight: result.weight,
          activities: [
            result.sessionsPerWeek >= 1 ? 'strength' : 'rest',
            result.sessionsPerWeek >= 2 ? 'cardio' : 'rest',
            result.sessionsPerWeek >= 3 ? 'strength' : 'rest',
            result.sessionsPerWeek >= 4 ? 'cardio' : 'rest',
            result.sessionsPerWeek >= 5 ? 'strength' : 'rest',
            result.sessionsPerWeek >= 6 ? 'cardio' : 'rest',
            'rest'
          ].slice(0, 7),
        };
        import('./supabase.js?v=8').then(({ supabase }) => {
          supabase
            .from('profiles')
            .upsert({ user_id: user.id, ...profile }, { onConflict: 'user_id' })
            .then(({ error }) => {
              if (error) console.error('Chyba při ukládání profilu z wizardu:', error.message);
            });
        });
      }

      // Trigger calculation automatically
      appState.selectedDate = dateKey();
      calculate(setStep);
      if (appState.macros?.kcal) {
        setActiveAppTab('today');
        persistCurrentTarget();
      }
    },
  });

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
    if (typeof window.loadVercelAnalytics === 'function') window.loadVercelAnalytics();
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
      window.location.href = 'mailto:?subject=' + encodeURIComponent('Můj jídelníček z NutriPlan') + '&body=' + encodeURIComponent(text);
    });
    sec.querySelector('[data-action="print"]')?.addEventListener('click', () => {
      openMealPlanPrintView();
    });
  }

  function buildPlainTextMealPlan() {
    const recipes = appState.currentRecipes || [];
    if (!recipes.length) return '';
    let text = 'Jídelníček z NutriPlan\n========================\n\n';
    recipes.forEach(m => {
      text += `${m.mealType}: ${m.name}\n`;
      text += `  ${m.kcal} kcal | B: ${m.protein}g | S: ${m.carbs}g | T: ${m.fat}g\n`;
      text += `  Ingredience: ${(m.ingredients || []).join(', ')}\n\n`;
    });
    const total = recipes.reduce((s, r) => s + (r.kcal || 0), 0);
    text += `Celkem: ${total} kcal\n\nVygenerováno na nutri-fit-omega.vercel.app`;
    return text;
  }

  function openMealPlanPrintView() {
    const recipes = appState.currentRecipes || [];
    if (!recipes.length) {
      showToast('Nejdřív vygeneruj jídelníček.', 'error');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) {
      window.print();
      return;
    }

    const totals = recipes.reduce((sum, meal) => ({
      kcal: sum.kcal + Number(meal.kcal || 0),
      protein: sum.protein + Number(meal.protein || 0),
      carbs: sum.carbs + Number(meal.carbs || 0),
      fat: sum.fat + Number(meal.fat || 0),
      fiber: sum.fiber + Number(meal.fiber || 0),
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
    const dateLabel = formatDayLabel(appState.selectedDate || dateKey(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NutriPlan - jídelníček</title>
  <style>
    @page { size:A4; margin:14mm; }
    * { box-sizing:border-box; }
    body { margin:0; color:#151515; background:#fff; font-family:Inter, Arial, sans-serif; font-size:12px; line-height:1.45; }
    header { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; padding-bottom:14px; border-bottom:2px solid #151515; margin-bottom:14px; }
    h1 { margin:0 0 4px; font-size:24px; line-height:1.1; }
    .muted { color:#666; }
    .summary { display:grid; grid-template-columns:repeat(5, 1fr); gap:8px; margin:0 0 14px; }
    .metric { border:1px solid #ddd; border-radius:8px; padding:8px 10px; }
    .metric strong { display:block; font-size:16px; line-height:1.15; }
    .metric span { color:#666; font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
    .meal { break-inside:avoid; page-break-inside:avoid; border:1px solid #ddd; border-radius:10px; padding:12px 14px; margin:0 0 10px; }
    .meal-head { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; margin-bottom:8px; }
    .meal-type { color:#5c8a4e; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.12em; }
    h2 { margin:2px 0 0; font-size:17px; line-height:1.25; }
    .macro-line { white-space:nowrap; color:#444; font-size:11px; text-align:right; }
    .cols { display:grid; grid-template-columns:1fr 1.35fr; gap:14px; }
    h3 { margin:6px 0 5px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#666; }
    ul, ol { margin:0; padding-left:18px; }
    li { margin:0 0 3px; }
    footer { margin-top:16px; padding-top:10px; border-top:1px solid #ddd; color:#777; font-size:10px; display:flex; justify-content:space-between; gap:12px; }
    @media print {
      .no-print { display:none !important; }
    }
    @media(max-width:700px) {
      header, footer { flex-direction:column; }
      .summary { grid-template-columns:repeat(2, 1fr); }
      .cols { grid-template-columns:1fr; }
      .meal-head { flex-direction:column; gap:6px; }
      .macro-line { text-align:left; white-space:normal; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>NutriPlan jídelníček</h1>
      <div class="muted">${escapeHtml(dateLabel)}</div>
    </div>
    <button class="no-print" onclick="window.print()" style="padding:9px 14px;border:1px solid #bbb;border-radius:8px;background:#fff;font:inherit;cursor:pointer;">Uložit jako PDF / tisk</button>
  </header>
  <section class="summary">
    <div class="metric"><strong>${Math.round(totals.kcal)}</strong><span>kcal</span></div>
    <div class="metric"><strong>${Math.round(totals.protein)} g</strong><span>bílkoviny</span></div>
    <div class="metric"><strong>${Math.round(totals.carbs)} g</strong><span>sacharidy</span></div>
    <div class="metric"><strong>${Math.round(totals.fat)} g</strong><span>tuky</span></div>
    <div class="metric"><strong>${Math.round(totals.fiber)} g</strong><span>vláknina</span></div>
  </section>
  ${recipes.map(meal => `
    <article class="meal">
      <div class="meal-head">
        <div>
          <div class="meal-type">${escapeHtml(meal.mealType || 'Jídlo')}</div>
          <h2>${escapeHtml(meal.name || '')}</h2>
        </div>
        <div class="macro-line">${escapeHtml(meal.kcal || 0)} kcal | B ${escapeHtml(meal.protein || 0)} g | S ${escapeHtml(meal.carbs || 0)} g | T ${escapeHtml(meal.fat || 0)} g</div>
      </div>
      <div class="cols">
        <section>
          <h3>Ingredience</h3>
          <ul>${(meal.ingredients || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </section>
        <section>
          <h3>Postup</h3>
          <ol>${(meal.steps || []).map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
        </section>
      </div>
    </article>
  `).join('')}
  <footer>
    <span>Vygenerováno v NutriPlan</span>
    <span>nutri-fit-omega.vercel.app</span>
  </footer>
  <script>
    window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });
  </script>
</body>
</html>`);
    printWindow.document.close();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
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
