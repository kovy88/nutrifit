// ── MAIN — init, event listenery, dark mode

import { appState, MEAL_NAMES, initAuthListener } from './state.js';
import { updateNavAuth, openAuthModal, closeAuthModal, handleLogin, handleRegister, handleLogout } from './auth.js';
import { calculate, startEdit, finishEdit, handleEditKey } from './calculator.js';
import { toggleDayPlanner } from './dayplanner.js';
import { generateMealPlan, closeRecipeModal } from './recipes.js';
import { openProfileModal, closeProfileModal, saveProfile, loadProfileOnStart } from './profile.js';
import { getUsageInfo, FREE_LIMIT } from './generation-limit.js';

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
      alert(err.message);
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

  // Stripe checkout return — zobraz feedback
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') {
    window.history.replaceState({}, '', window.location.pathname);
    setTimeout(() => alert('Platba proběhla úspěšně! Premium je nyní aktivní.'), 500);
  } else if (params.get('checkout') === 'cancel') {
    window.history.replaceState({}, '', window.location.pathname);
  }

  // Bootstrap — obnova session + naslouchání změnám autentizace
  initAuthListener(
    () => { loadProfileOnStart(); getUsageInfo().then(updateUsageBadge); },
    () => { updateNavAuth(); openAuthModal(); document.getElementById('usage-badge').style.display = 'none'; }
  );

})();
