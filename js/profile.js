// ── PROFIL, HISTORIE, STARTUP

import { appState, DAYS, ACTIVITY_TYPES } from './state.js';
import { supabase } from './supabase.js';
import { getCurrentUser, updateNavAuth, openAuthModal } from './auth.js';
import { setDayRest, recalcFromDays } from './dayplanner.js';
import { buildShoppingList } from './shopping.js';
import { renderList, esc } from './recipes.js';

// ── PROFILE MODAL

function buildProfileDayRows() {
  const container = document.getElementById('p-day-rows');
  container.innerHTML = '';
  const opts = ACTIVITY_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
  DAYS.forEach((day, i) => {
    const row = document.createElement('div');
    row.className = 'day-row-top';
    row.innerHTML = `<div class="day-row-name">${day}</div><select id="p-day-type-${i}">${opts}</select>`;
    container.appendChild(row);
  });
}

export function openProfileModal() {
  buildProfileDayRows();
  loadProfileIntoModal();
  loadHistory();

  const user   = getCurrentUser();
  const header = document.getElementById('profile-user-header');
  const anon   = document.getElementById('profile-anon');
  if (user) {
    const name     = user.user_metadata?.full_name || user.email;
    const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const avatarEl = document.getElementById('profile-avatar-initials');
    const nameEl   = document.getElementById('profile-user-fullname');
    const emailEl  = document.getElementById('profile-user-email');
    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl)   nameEl.textContent   = name;
    if (emailEl)  emailEl.textContent  = user.email;
    if (header) header.style.display = 'flex';
    if (anon)   anon.style.display   = 'none';
  } else {
    if (header) header.style.display = 'none';
    if (anon)   anon.style.display   = 'flex';
  }
  const m = document.getElementById('profile-modal');
  if (m) m.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

export function closeProfileModal() {
  const m = document.getElementById('profile-modal');
  if (m) m.style.display = 'none';
  document.body.style.overflow = '';
}

async function loadProfileIntoModal() {
  const user = getCurrentUser();
  if (!user) return;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (data) fillModalFromProfile(data);
}

function fillModalFromProfile(p) {
  if (!p) return;
  appState.profileGenderVal = p.gender || 'muz';
  document.getElementById('p-btn-muz')?.classList.toggle('active', appState.profileGenderVal === 'muz');
  document.getElementById('p-btn-zena')?.classList.toggle('active', appState.profileGenderVal === 'zena');
  appState.profileGoalVal = p.goal || 'hubnutí';
  document.querySelectorAll('[data-profile-goal]').forEach(c => {
    c.classList.toggle('active', c.dataset.profileGoal === appState.profileGoalVal);
  });
  const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  set('p-age', p.age); set('p-height', p.height); set('p-weight', p.weight);
  set('p-likes', p.likes); set('p-dislikes', p.dislikes); set('p-diet', p.diet);
  if (p.activities) {
    p.activities.forEach((act, i) => {
      const sel = document.getElementById(`p-day-type-${i}`);
      if (sel) sel.value = act;
    });
  }
}

// ── APPLY PROFILE TO MAIN FORM

export function applyProfileToForm(p) {
  if (!p) return;
  if (p.gender) {
    appState.gender = p.gender;
    document.getElementById('btn-muz')?.classList.toggle('active', p.gender === 'muz');
    document.getElementById('btn-zena')?.classList.toggle('active', p.gender === 'zena');
  }
  if (p.goal) {
    appState.goal = p.goal;
    document.querySelectorAll('[data-goal]').forEach(c => c.classList.toggle('active', c.dataset.goal === p.goal));
  }
  const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  set('age', p.age); set('height', p.height); set('weight', p.weight);
  set('likes', p.likes); set('dislikes', p.dislikes); set('diet-style', p.diet);
  if (p.activities && p.activities.length) {
    const firstRow = document.getElementById('day-type-0');
    if (firstRow) {
      p.activities.forEach((act, i) => {
        const sel = document.getElementById(`day-type-${i}`);
        if (sel) { sel.value = act; setDayRest(i, act === 'rest'); }
      });
      recalcFromDays();
    }
    window._pendingActivities = p.activities;
  }
}

// ── HISTORY

export async function saveToHistory(recipes) {
  const user = getCurrentUser();
  if (!user) return;   // anonymní uživatel — tiše přeskočit
  await supabase.from('meal_history').insert({
    user_id:    user.id,
    date_label: new Date().toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' }),
    meals:      recipes.map(r => ({
      name:        r.name,
      mealType:    r.mealType,
      kcal:        r.kcal,
      protein:     r.protein,
      carbs:       r.carbs,
      fat:         r.fat,
      fiber:       r.fiber,
      prepTime:    r.prepTime,
      difficulty:  r.difficulty,
      ingredients: r.ingredients,
      steps:       r.steps,
    })),
    total_kcal: recipes.reduce((s, r) => s + (r.kcal || 0), 0),
  });
  // Cap na 10 záznamů řídí DB trigger cap_meal_history — žádné JS ořezávání
}

async function loadHistory() {
  const user = getCurrentUser();
  const list = document.getElementById('history-list');
  if (!user) {
    list.innerHTML = '<div class="history-empty">Zatím žádné uložené jídelníčky</div>';
    return;
  }
  const { data: history } = await supabase
    .from('meal_history')
    .select('id, date_label, meals, total_kcal')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!history || !history.length) {
    list.innerHTML = '<div class="history-empty">Zatím žádné uložené jídelníčky</div>';
    return;
  }

  list.innerHTML = '';
  history.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <span class="history-date">${esc(entry.date_label)}</span>
      <span class="history-name">${entry.meals.map(m => esc(m.mealType)).join(' · ')}</span>
      <span class="history-kcal">${esc(entry.total_kcal)} kcal</span>`;
    item.addEventListener('click', () => {
      appState.currentRecipes = entry.meals;
      renderList(document.getElementById('meal-plan-output'), appState.currentRecipes);
      buildShoppingList(appState.currentRecipes);
      document.getElementById('meal-plan-section').style.display = 'block';
      closeProfileModal();
      setTimeout(() => document.getElementById('meal-plan-section').scrollIntoView({ behavior: 'smooth' }), 100);
    });
    list.appendChild(item);
  });
}

// ── STARTUP

export async function loadProfileOnStart() {
  updateNavAuth();
  const user = getCurrentUser();
  if (!user) return;   // openAuthModal volá initAuthListener v main.js při SIGNED_OUT
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (profile) {
    applyProfileToForm(profile);
    document.getElementById('btn-profile')?.classList.add('has-profile');
  }
}

// ── PROFILE SAVE (voláno z main.js)

export async function saveProfile() {
  const profile = {
    gender:     appState.profileGenderVal,
    goal:       appState.profileGoalVal,
    age:        document.getElementById('p-age')?.value,
    height:     document.getElementById('p-height')?.value,
    weight:     document.getElementById('p-weight')?.value,
    likes:      document.getElementById('p-likes')?.value,
    dislikes:   document.getElementById('p-dislikes')?.value,
    diet:       document.getElementById('p-diet')?.value,
    activities: DAYS.map((_, i) => document.getElementById(`p-day-type-${i}`)?.value || 'rest'),
  };
  const user = getCurrentUser();
  if (user) {
    const { error } = await supabase
      .from('profiles')
      .upsert({ user_id: user.id, ...profile }, { onConflict: 'user_id' });
    if (error) console.error('Chyba při ukládání profilu:', error.message);
  }
  document.getElementById('btn-profile')?.classList.add('has-profile');
  applyProfileToForm(profile);
  const note = document.getElementById('profile-saved-note');
  note.textContent = '✓ Profil uložen a předvyplněn';
  setTimeout(() => { note.textContent = ''; }, 3000);
}
