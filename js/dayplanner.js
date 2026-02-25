// ── DENNÍ PLÁNOVAČ AKTIVIT

import { appState, DAYS, ACTIVITY_TYPES, DUR_OPTIONS } from './state.js';

export function toggleDayPlanner() {
  appState.dayPlannerOpen = !appState.dayPlannerOpen;
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

    const pillsHtml = DUR_OPTIONS.map(d =>
      `<button class="dur-pill${d === 60 ? ' active' : ''}" data-min="${d}">${d} min</button>`
    ).join('');

    row.innerHTML = `
      <div class="day-row-top">
        <div class="day-row-name">${day}</div>
        <select id="day-type-${i}">${opts}</select>
        <button class="day-rest-btn" id="day-rest-${i}" title="Označit jako volno">—</button>
      </div>
      <div class="dur-pills" id="day-dur-pills-${i}">${pillsHtml}</div>`;
    container.appendChild(row);

    row.querySelector(`#day-type-${i}`).addEventListener('change', recalcFromDays);

    row.querySelector(`#day-dur-pills-${i}`).addEventListener('click', e => {
      const pill = e.target.closest('.dur-pill');
      if (!pill) return;
      appState.dayDurations[i] = parseInt(pill.dataset.min);
      row.querySelectorAll('.dur-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
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
  const pills = document.getElementById(`day-dur-pills-${i}`);

  sel.disabled = isRest;
  sel.style.opacity = isRest ? '0.4' : '1';
  pills.style.opacity = isRest ? '0.35' : '1';
  pills.style.pointerEvents = isRest ? 'none' : '';

  btn.dataset.resting = String(isRest);
  btn.classList.toggle('resting', isRest);
  btn.textContent = isRest ? '✓' : '—';
  btn.title = isRest ? 'Klikni pro trénink' : 'Označit jako volno';
  row.classList.toggle('is-resting', isRest);
}

export function recalcFromDays() {
  let totalMET = 0, activeMin = 0;
  DAYS.forEach((_, i) => {
    const sel = document.getElementById(`day-type-${i}`);
    const btn = document.getElementById(`day-rest-${i}`);
    if (!sel || btn?.dataset.resting === 'true') return;
    const d   = appState.dayDurations[i] || 0;
    const met = ACTIVITY_TYPES.find(t => t.value === sel.value)?.met || 5;
    if (d > 0) { totalMET += met * (d / 60); activeMin += d; }
  });
  appState.activityFactor = Math.min(1.95, Math.round((1.2 + (totalMET / 7) * 0.055) * 1000) / 1000);
  document.querySelectorAll('.freq-card').forEach(c => c.classList.remove('active'));
  document.getElementById('day-planner-note').textContent =
    `Faktor aktivity: ×${appState.activityFactor.toFixed(2)} · ${activeMin} min / týden`;
}
