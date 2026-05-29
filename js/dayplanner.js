// ── DENNÍ PLÁNOVAČ AKTIVIT

import { appState, DAYS, ACTIVITY_TYPES } from './state.js?v=9';

export function toggleDayPlanner() {
  appState.dayPlannerOpen = !appState.dayPlannerOpen;
  if (appState.dayPlannerOpen) appState.dayPlannerUsed = true;
  document.getElementById('day-planner').style.display = appState.dayPlannerOpen ? 'block' : 'none';
  document.getElementById('day-toggle')?.classList.toggle('open', appState.dayPlannerOpen);
  if (appState.dayPlannerOpen && !document.getElementById('day-rows').children.length) {
    buildDayRows();
    if (window._pendingActivities) {
      window._pendingActivities.forEach((act, i) => {
        const sel = document.getElementById(`day-type-${i}`);
        if (sel) { sel.value = act; setDayRest(i, act === 'rest'); }
      });
      recalcFromDays();
      window._pendingActivities = null;
    }
  }
}

export function buildDayRows() {
  const container = document.getElementById('day-rows');
  container.innerHTML = '';
  const opts = ACTIVITY_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('');

  DAYS.forEach((day, i) => {
    const row = document.createElement('div');
    row.className = 'day-row';
    row.id = `day-row-${i}`;

    row.innerHTML = `
      <div class="day-row-top">
        <div class="day-row-name">${day}</div>
        <select id="day-type-${i}">${opts}</select>
        <button class="day-rest-btn" id="day-rest-${i}" title="Označit jako volno">—</button>
      </div>
      <div class="dur-slider-wrap" id="day-dur-wrap-${i}">
        <input type="range" class="dur-slider" id="day-dur-${i}" min="10" max="180" step="5" value="60">
        <span class="dur-slider-val" id="day-dur-val-${i}">60 min</span>
      </div>`;
    container.appendChild(row);

    row.querySelector(`#day-type-${i}`).addEventListener('change', recalcFromDays);

    const slider = row.querySelector(`#day-dur-${i}`);
    slider.addEventListener('input', () => {
      const val = parseInt(slider.value);
      appState.dayDurations[i] = val;
      row.querySelector(`#day-dur-val-${i}`).textContent = `${val} min`;
      recalcFromDays();
    });

    const btn = row.querySelector(`#day-rest-${i}`);
    btn.dataset.resting = 'false';
    btn.addEventListener('click', () => {
      setDayRest(i, btn.dataset.resting !== 'true');
      recalcFromDays();
    });
  });

  ['gym', 'rest', 'boxing', 'gym', 'rest', 'cardio', 'rest'].forEach((v, i) => {
    document.getElementById(`day-type-${i}`).value = v;
    if (v === 'rest') setDayRest(i, true);
  });
  recalcFromDays();
}

export function setDayRest(i, isRest) {
  const sel  = document.getElementById(`day-type-${i}`);
  const btn  = document.getElementById(`day-rest-${i}`);
  const row  = document.getElementById(`day-row-${i}`);
  const wrap = document.getElementById(`day-dur-wrap-${i}`);

  sel.disabled = isRest;
  sel.style.opacity = isRest ? '0.4' : '1';
  wrap.style.opacity = isRest ? '0.35' : '1';
  wrap.style.pointerEvents = isRest ? 'none' : '';

  btn.dataset.resting = String(isRest);
  btn.classList.toggle('resting', isRest);
  btn.textContent = isRest ? '✓' : '—';
  btn.title = isRest ? 'Klikni pro trénink' : 'Označit jako volno';
  row.classList.toggle('is-resting', isRest);
}

export function recalcFromDays() {
  let totalMET = 0, activeMin = 0;
  const activities = [];
  DAYS.forEach((_, i) => {
    const sel = document.getElementById(`day-type-${i}`);
    const btn = document.getElementById(`day-rest-${i}`);
    const isRest = btn?.dataset.resting === 'true';
    const durationMinutes = appState.dayDurations[i] || 0;
    activities[i] = {
      type: isRest ? 'rest' : (sel?.value || 'rest'),
      durationMinutes: isRest ? 0 : durationMinutes,
      isRest,
    };
    if (!sel || isRest) return;
    const d   = appState.dayDurations[i] || 0;
    const met = ACTIVITY_TYPES.find(t => t.value === sel.value)?.met || 5;
    if (d > 0) { totalMET += met * (d / 60); activeMin += d; }
  });
  appState.dayPlannerActivities = activities;
  appState.activityFactor = Math.min(1.95, Math.round((1.2 + (totalMET / 7) * 0.055) * 1000) / 1000);
  document.querySelectorAll('.freq-card').forEach(c => c.classList.remove('active'));
  document.getElementById('day-planner-note').textContent =
    `Faktor aktivity: ×${appState.activityFactor.toFixed(2)} · ${activeMin} min / týden`;
}
