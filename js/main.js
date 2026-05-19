// ── MAIN — init, event listenery, dark mode

import { appState, MEAL_NAMES, initAuthListener } from './state.js';
import { updateNavAuth, openAuthModal, closeAuthModal, handleLogin, handleRegister, handleLogout } from './auth.js';
import { calculate, startEdit, finishEdit, handleEditKey } from './calculator.js';
import { toggleDayPlanner } from './dayplanner.js';
import { generateMealPlan, closeRecipeModal } from './recipes.js?v=2';
import { openProfileModal, closeProfileModal, saveProfile, loadProfileOnStart } from './profile.js';
import { getUsageInfo, FREE_LIMIT } from './generation-limit.js';
import { normalizeFoodEstimate, parseGeminiJSON } from './ai-utils.js?v=2';

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
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return String(dataUrl).split(',')[1];
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
    if (!text) throw new Error('AI nevrátila odpověď.');
    renderFoodEstimate(out, normalizeFoodEstimate(parseGeminiJSON(text, 'Odhad z fotky')));
  } catch (err) {
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
  document.getElementById('btn-calculate')?.addEventListener('click', () => calculate(setStep));
  document.getElementById('mc-minus')?.addEventListener('click', () => changeMealCount(-1));
  document.getElementById('mc-plus')?.addEventListener('click', () => changeMealCount(1));
  document.getElementById('btn-generate')?.addEventListener('click', () => generateMealPlan(setStep));
  document.getElementById('btn-photo-estimate')?.addEventListener('click', analyzeFoodPhoto);
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
    if (!file.type.startsWith('image/') || file.size > MAX_PHOTO_SIZE) {
      preview.style.display = 'none';
      showToast(file.size > MAX_PHOTO_SIZE ? 'Fotka je moc velká. Maximum je 5 MB.' : 'Vyber prosím obrázek.', 'error');
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
    if (out) out.style.display = 'none';
  });

  // Macro tile clicks
  document.querySelectorAll('.macro-tile.editable').forEach(tile => {
    tile.addEventListener('click', () => startEdit(tile.dataset.macro));
  });
  ['kcal', 'protein', 'carbs', 'fat'].forEach(m => {
    const inp = document.getElementById('input-' + m);
    inp.addEventListener('blur', () => finishEdit(m));
    inp.addEventListener('keydown', e => handleEditKey(e, m));
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
    const user = (await import('./auth.js')).getCurrentUser();
    if (!user) { closePaywallModal(); (await import('./auth.js')).openAuthModal(); return; }

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
  window.addEventListener('auth:login', () => {
    loadProfileOnStart();
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
    const user = (await import('./auth.js')).getCurrentUser();
    if (!user) { closeProfileModal(); (await import('./auth.js')).openAuthModal(); return; }

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
  const origSetGender = setGender;
  // Overwrite click handlers to also save
  window.addEventListener('click', e => {
    const t = e.target.closest('.goal-card, .level-btn, .freq-card, .mc-btn, .toggle-btn');
    if (t) setTimeout(saveFormToLS, 50);
  });

  // Načti uložené hodnoty při startu (jen pokud není přihlášen — profil ho přepíše)
  loadFormFromLS();

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
    sec.querySelector('.card')?.appendChild(clone);

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
      window.print();
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
    () => { loadProfileOnStart(); getUsageInfo().then(updateUsageBadge); },
    () => { updateNavAuth(); document.getElementById('usage-badge').style.display = 'none'; }
  );

})();
