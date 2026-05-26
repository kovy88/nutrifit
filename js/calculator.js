// ── KALKULAČKA MAKER + EDITACE MAKER

import { appState, MACRO_LIMITS } from './state.js?v=6';

// ── ANIMACE HODNOT

export function animateVal(el, end, dur = 800) {
  const id = el.id;
  if (appState.afs[id]) cancelAnimationFrame(appState.afs[id]);
  let t0 = null;
  const step = ts => {
    if (!t0) t0 = ts;
    const progress = Math.min((ts - t0) / dur, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * end);
    if (progress < 1) {
      appState.afs[id] = requestAnimationFrame(step);
    } else {
      el.textContent = end;
      delete appState.afs[id];
    }
  };
  appState.afs[id] = requestAnimationFrame(step);
}

// ── HLAVNÍ VÝPOČET

export function calculate(setStepFn) {
  // 1. Čtení a validace vstupů s rozsahovou kontrolou
  const ranges = { age: { min: 10, max: 100, label: 'Věk' }, height: { min: 100, max: 250, label: 'Výška' }, weight: { min: 30, max: 300, label: 'Váha' } };
  let hasError = false;
  let firstError = null;

  Object.entries(ranges).forEach(([id, r]) => {
    const inp = document.getElementById(id);
    const val = parseInt(inp.value);
    const invalid = !inp.value || isNaN(val) || val < r.min || val > r.max;
    if (invalid) {
      hasError = true;
      if (!firstError) firstError = inp;
      inp.style.borderColor = '#ff3b30';
      inp.style.boxShadow   = '0 0 0 4px rgba(255,59,48,0.12)';
      let hint = inp.parentElement.querySelector('.input-error');
      if (!hint) { hint = document.createElement('div'); hint.className = 'input-error'; inp.parentElement.appendChild(hint); }
      hint.textContent = !inp.value ? `Zadej ${r.label.toLowerCase()}` : `${r.label}: ${r.min}–${r.max}`;
      setTimeout(() => { inp.style.borderColor = ''; inp.style.boxShadow = ''; if (hint) hint.remove(); }, 3000);
    }
  });
  if (hasError) { if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }

  const age    = parseInt(document.getElementById('age').value);
  const height = parseInt(document.getElementById('height').value);
  const weight = parseInt(document.getElementById('weight').value);

  // 2. Výpočet maker (Mifflin-St Jeor)
  const bmr  = appState.gender === 'muz'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161;
  const tdee = Math.round(bmr * appState.activityFactor);

  // BMI auto-switch: při podváze hubnutí nemá smysl → přepni na udržení
  const bmi = weight / ((height / 100) ** 2);
  if (bmi < 18.5 && appState.goal === 'hubnutí') {
    appState.goal = 'udržení';
    document.querySelectorAll('.goal-card').forEach(c => c.classList.remove('active'));
    document.querySelector('.goal-card[data-goal="udržení"]')?.classList.add('active');
  }

  const cal     = appState.goal === 'hubnutí' ? Math.round(tdee * 0.82) : appState.goal === 'nabírání' ? Math.round(tdee * 1.12) : tdee;
  const protein = Math.round(weight * 2);
  const fat     = Math.round(cal * 0.27 / 9);
  const carbs   = Math.max(Math.round((cal - protein * 4 - fat * 9) / 4), 0);
  const fiber   = appState.goal === 'hubnutí' ? Math.round(weight * 0.42) : Math.round(weight * 0.35);

  appState.macros = { kcal: cal, protein, carbs, fat, fiber, tdee, bmr: Math.round(bmr), weight, height, age, gender: appState.gender, goal: appState.goal };
  setMacroLimits(weight, Math.round(bmr));

  // 3. Zobrazení výsledků + animace hodnot
  const res = document.getElementById('results');
  const mc  = document.getElementById('macros-card');
  const pc  = document.getElementById('prefs-card');
  res.style.display = 'block';
  document.getElementById('meal-plan-section').style.display = 'none';
  document.getElementById('shopping-section').style.display  = 'none';
  document.getElementById('water-section').style.display     = 'none';
  document.getElementById('meal-plan-output').innerHTML = '';
  mc.style.animation = 'none';
  pc.style.animation = 'none';
  void mc.offsetWidth;
  mc.style.animation = 'slideIn 0.42s ease both';
  pc.style.animation = 'slideIn 0.42s 0.16s ease both';
  setStepFn(2);

  animateVal(document.getElementById('r-kcal'),    cal);
  animateVal(document.getElementById('r-protein'), protein);
  animateVal(document.getElementById('r-carbs'),   carbs);
  animateVal(document.getElementById('r-fat'),     fat);
  animateVal(document.getElementById('r-fiber'),   fiber);
  animateVal(document.getElementById('r-bmr'),     Math.round(bmr));
  animateVal(document.getElementById('r-tdee'),    tdee);

  // 4. Note o cíli
  const diff = Math.abs(tdee - cal);
  const kpw  = (diff * 7 / 7700).toFixed(2);
  const goalText = appState.goal === 'hubnutí'
    ? `kalorický deficit −${diff} kcal · ≈ <strong>${kpw} kg / týden</strong>`
    : appState.goal === 'nabírání'
    ? `kalorický surplus +${diff} kcal · ≈ <strong>+${kpw} kg / týden</strong>`
    : 'udržení váhy';
  document.getElementById('result-note').innerHTML = `Tvůj cíl: <strong>${goalText}</strong>`;

  renderWater(weight, appState.activityFactor);
  renderBmiWarning(bmi, appState.goal);

  setTimeout(() => res.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

// ── VODA

export function renderWater(weight, activityFactor = 1.375) {
  const base  = Math.round(weight * 35);  // 35 ml / kg
  // Bonus za intenzivní trénink dle activity factoru
  const bonus = activityFactor >= 1.725 ? 1000
              : activityFactor >= 1.55  ? 500
              : 0;
  const water   = base + bonus;
  const glasses = Math.round(water / 250);

  const bonusNote = bonus > 0
    ? ` + ${bonus / 1000} l bonus za trénink`
    : '';
  document.getElementById('water-amount').textContent        = (water / 1000).toFixed(1) + ' l / den';
  document.getElementById('water-desc').textContent          = `${weight} kg × 35 ml = ${(base/1000).toFixed(1)} l${bonusNote}`;
  document.getElementById('water-glasses-count').textContent = glasses + ' sklenic';
  setTimeout(() => { document.getElementById('water-fill').style.width = '100%'; }, 300);
  const shown = Math.min(glasses, 12);
  let dropsHtml = '';
  for (let i = 0; i < shown; i++) {
    dropsHtml += `<div class="water-dot filled" style="transition-delay:${i * 40}ms"></div>`;
  }
  document.getElementById('water-drops').innerHTML = dropsHtml;
  document.getElementById('water-section').style.display = 'block';
}

// ── BMI VAROVÁNÍ

export function renderBmiWarning(bmi, goal) {
  const warnEl = document.getElementById('bmi-warning');
  warnEl.className     = 'bmi-warning';
  warnEl.style.display = 'none';
  if (bmi < 16) {
    warnEl.style.display = 'flex';
    warnEl.classList.add('danger');
    warnEl.innerHTML = `<div class="bmi-warning-icon">🚨</div><div class="bmi-warning-body"><div class="bmi-warning-title">Tvoje BMI je ${bmi.toFixed(1)} — těžká podváha</div><div class="bmi-warning-text">Při takovém BMI může být jakékoliv omezování kalorií nebezpečné. Důrazně doporučujeme konzultaci s lékařem nebo nutričním terapeutem, než začneš s jakýmkoliv dietním plánem.</div></div>`;
  } else if (bmi < 18.5) {
    warnEl.style.display = 'flex';
    if (goal === 'hubnutí') {
      warnEl.classList.add('danger');
      warnEl.innerHTML = `<div class="bmi-warning-icon">⚠️</div><div class="bmi-warning-body"><div class="bmi-warning-title">Hubnutí při podváze se nedoporučuje (BMI ${bmi.toFixed(1)})</div><div class="bmi-warning-text">Zdá se, že tvoje váha je již pod zdravým rozmezím. Místo hubnutí by mohlo být vhodnější zaměřit se na udržení váhy nebo zdravé přibírání. Zvažte konzultaci s odborníkem.</div></div>`;
    } else {
      warnEl.innerHTML = `<div class="bmi-warning-icon">💛</div><div class="bmi-warning-body"><div class="bmi-warning-title">Tvoje BMI je ${bmi.toFixed(1)} — mírná podváha</div><div class="bmi-warning-text">Jsi mírně pod zdravým rozmezím BMI (18,5–24,9). Jídelníček jsme sestavili, ale doporučujeme konzultaci s lékařem nebo nutričním terapeutem.</div></div>`;
    }
  }
}

// ── LIMITY MAKER

export function setMacroLimits(w, bmr) {
  MACRO_LIMITS.kcal    = { min: Math.round(bmr * 0.7),  max: Math.round(bmr * 2.5) };
  MACRO_LIMITS.protein = { min: Math.round(w * 0.8),    max: Math.round(w * 3.5)   };
  MACRO_LIMITS.carbs   = { min: 0,                       max: Math.round(w * 8)     };
  MACRO_LIMITS.fat     = { min: Math.round(w * 0.5),    max: Math.round(w * 2.5)   };
}

// ── EDITACE MAKER

export function startEdit(m) {
  ['kcal', 'protein', 'carbs', 'fat'].forEach(x => {
    document.querySelector(`.macro-tile.${x}`).classList.remove('editing');
  });
  const tile = document.querySelector(`.macro-tile.${m}`);
  const inp  = document.getElementById('input-' + m);
  tile.classList.add('editing');
  inp.value = appState.macros[m] || 0;
  setTimeout(() => { inp.focus(); inp.select(); }, 10);
}

export function finishEdit(m) {
  const tile = document.querySelector(`.macro-tile.${m}`);
  if (!tile.classList.contains('editing')) return;
  tile.classList.remove('editing');
  const inp = document.getElementById('input-' + m);
  const lim = MACRO_LIMITS[m];
  let v = parseInt(inp.value);
  if (isNaN(v)) v = appState.macros[m];
  v = Math.max(lim.min, Math.min(lim.max, v));
  appState.macros[m] = v;
  document.getElementById('r-' + m).textContent = v;
  flash(m);
  if (m === 'kcal') recalcFromKcal(); else recalcCarbs();
  showNote();
}

export function handleEditKey(e, m) {
  if (e.key === 'Enter')  { e.preventDefault(); finishEdit(m); }
  if (e.key === 'Escape') { document.querySelector(`.macro-tile.${m}`).classList.remove('editing'); }
  e.stopPropagation();
}

function recalcFromKcal() {
  const tot = appState.macros.protein * 4 + appState.macros.carbs * 4 + appState.macros.fat * 9;
  if (!tot) return;
  const r = appState.macros.kcal / tot;
  appState.macros.protein = Math.max(MACRO_LIMITS.protein.min, Math.round(appState.macros.protein * r));
  appState.macros.fat     = Math.max(MACRO_LIMITS.fat.min,     Math.round(appState.macros.fat * r));
  appState.macros.carbs   = Math.max(0, Math.round((appState.macros.kcal - appState.macros.protein * 4 - appState.macros.fat * 9) / 4));
  ['protein', 'carbs', 'fat'].forEach(m => {
    document.getElementById('r-' + m).textContent = appState.macros[m];
    flash(m);
  });
}

function recalcCarbs() {
  appState.macros.carbs = Math.max(0, Math.round((appState.macros.kcal - appState.macros.protein * 4 - appState.macros.fat * 9) / 4));
  document.getElementById('r-carbs').textContent = appState.macros.carbs;
  flash('carbs');
}

function flash(m) {
  const t = document.querySelector(`.macro-tile.${m}`);
  if (!t) return;
  t.classList.remove('macro-flash');
  void t.offsetWidth;
  t.classList.add('macro-flash');
}

function showNote() {
  const warn = [];
  if (appState.macros.protein < MACRO_LIMITS.protein.min) warn.push(`Bílkoviny pod minimem (${MACRO_LIMITS.protein.min} g)`);
  if (appState.macros.fat     < MACRO_LIMITS.fat.min)     warn.push(`Tuky pod minimem (${MACRO_LIMITS.fat.min} g)`);
  if (appState.macros.kcal    < MACRO_LIMITS.kcal.min)    warn.push(`Příjem pod ${MACRO_LIMITS.kcal.min} kcal — konzultuj s odborníkem`);
  const tot = appState.macros.protein * 4 + appState.macros.carbs * 4 + appState.macros.fat * 9;
  const n = document.getElementById('macro-note');
  n.style.display = 'block';
  if (warn.length) {
    n.className = 'macro-note macro-note-warn';
    n.innerHTML = warn.map(w => `⚠ ${w}`).join('<br>');
  } else {
    const d = tot - appState.macros.kcal;
    n.className = 'macro-note macro-note-ok';
    n.innerHTML = Math.abs(d) <= 5
      ? `Makra v pořádku · Celkem: <strong>${tot} kcal</strong>`
      : `Celkem: <strong>${tot} kcal</strong> · Cíl: <strong>${appState.macros.kcal} kcal</strong> · Rozdíl: <strong>${d > 0 ? '+' : ''}${d} kcal</strong>`;
  }
}
