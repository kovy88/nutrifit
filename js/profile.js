// ── PROFIL, HISTORIE, STARTUP

import { appState, DAYS, ACTIVITY_TYPES } from './state.js';
import { getCurrentUser, getProfileKey, getHistoryKey, updateNavAuth, openAuthModal } from './auth.js';
import { setDayRest, recalcFromDays } from './dayplanner.js';
import { buildShoppingList } from './shopping.js';
import { renderList } from './recipes.js';

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
    const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const avatarEl = document.getElementById('profile-avatar-initials');
    const nameEl   = document.getElementById('profile-user-fullname');
    const emailEl  = document.getElementById('profile-user-email');
    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl)   nameEl.textContent   = user.name;
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

function loadProfileIntoModal() {
  const profileKey = getProfileKey();
  try {
    const raw = localStorage.getItem(profileKey);
    if (raw) fillModalFromProfile(JSON.parse(raw));
  } catch(e) {}
  if (window.storage) {
    window.storage.get(profileKey).then(res => {
      if (res?.value) fillModalFromProfile(JSON.parse(res.value));
    }).catch(() => {});
  }
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
  const entry = {
    id: Date.now(),
    date: new Date().toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' }),
    meals: recipes.map(r => ({
      name: r.name, mealType: r.mealType, kcal: r.kcal, protein: r.protein,
      carbs: r.carbs, fat: r.fat, fiber: r.fiber, prepTime: r.prepTime,
      difficulty: r.difficulty, ingredients: r.ingredients, steps: r.steps,
    })),
    totalKcal: recipes.reduce((s, r) => s + (r.kcal || 0), 0),
  };

  const historyKey = getHistoryKey();
  let history = [];
  try {
    const res = await window.storage.get(historyKey);
    if (res?.value) history = JSON.parse(res.value);
  } catch(e) {
    try { const raw = localStorage.getItem(historyKey); if (raw) history = JSON.parse(raw); } catch(e2) {}
  }

  history.unshift(entry);
  if (history.length > 10) history = history.slice(0, 10);

  try { await window.storage.set(historyKey, JSON.stringify(history)); } catch(e) {}
  localStorage.setItem(historyKey, JSON.stringify(history));
}

async function loadHistory() {
  const historyKey = getHistoryKey();
  let history = [];
  try {
    const res = await window.storage.get(historyKey);
    if (res?.value) history = JSON.parse(res.value);
  } catch(e) {}
  if (!history.length) {
    try { const raw = localStorage.getItem(historyKey); if (raw) history = JSON.parse(raw); } catch(e) {}
  }

  const list = document.getElementById('history-list');
  if (!history.length) {
    list.innerHTML = '<div class="history-empty">Zatím žádné uložené jídelníčky</div>';
    return;
  }

  list.innerHTML = '';
  history.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <span class="history-date">${entry.date}</span>
      <span class="history-name">${entry.meals.map(m => m.mealType).join(' · ')}</span>
      <span class="history-kcal">${entry.totalKcal} kcal</span>`;
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
  const profileKey = getProfileKey();
  let profile = null;
  try {
    const res = await window.storage.get(profileKey);
    if (res?.value) profile = JSON.parse(res.value);
  } catch(e) {}
  if (!profile) {
    try { const raw = localStorage.getItem(profileKey); if (raw) profile = JSON.parse(raw); } catch(e) {}
  }
  if (profile) {
    applyProfileToForm(profile);
    document.getElementById('btn-profile')?.classList.add('has-profile');
  }
  if (!getCurrentUser()) openAuthModal();
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
  const profileKey = getProfileKey();
  try { await window.storage.set(profileKey, JSON.stringify(profile)); } catch(e) {}
  localStorage.setItem(profileKey, JSON.stringify(profile));
  document.getElementById('btn-profile')?.classList.add('has-profile');
  applyProfileToForm(profile);
  const note = document.getElementById('profile-saved-note');
  note.textContent = '✓ Profil uložen a předvyplněn';
  setTimeout(() => { note.textContent = ''; }, 3000);
}
