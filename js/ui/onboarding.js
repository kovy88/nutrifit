// ── ONBOARDING WIZARD
//
// 4-step first-run wizard. Renders a full-screen overlay, guides the user
// through PrimaryGoal → TrainingGoalKind → fitness data → schedule, then
// fills the existing calculator form and triggers calculation.
//
// Called once from main.js on startup; no-ops silently for returning users.

import { GOAL_CONSTRAINTS } from '../domain/types.js';
import { primaryGoalToNutritionKind } from '../domain/nutrition.js';

const STORAGE_KEY = 'nutriplan-onboarding-done';

// ── CONFIG ──────────────────────────────────────────────────────────────────

const PRIMARY_GOALS = [
  { value: 'lose_weight',        icon: '🔥', label: 'Zhubnout',           desc: 'Kalorický deficit, zachovat sval' },
  { value: 'maintain_weight',    icon: '⚖️',  label: 'Udržet váhu',        desc: 'Rovnováha příjmu a výdeje' },
  { value: 'gain_muscle',        icon: '💪',  label: 'Nabrat sval',         desc: 'Silový trénink + surplus' },
  { value: 'run_race',           icon: '🏃',  label: 'Závodit v běhu',      desc: '5k, 10k, půlmaraton, maraton' },
  { value: 'triathlon',          icon: '🏊',  label: 'Triatlon / Ironman',  desc: 'Sprint, Olympic, 70.3, Full' },
  { value: 'hyrox_ocr',          icon: '🏋️',  label: 'Hyrox / OCR',         desc: 'Funkční závody a obstacle races' },
  { value: 'get_fit',            icon: '✨',  label: 'Celková kondice',      desc: 'Zdraví, energie, pohyb' },
  { value: 'sport_conditioning', icon: '⚡',  label: 'Sportovní výkon',     desc: 'Kondice pro kolektivní sport' },
];

const TRAINING_GOAL_LABELS = {
  general_fitness:    { icon: '✨', label: 'Obecná kondice' },
  run_5k:             { icon: '🏃', label: '5 km' },
  run_10k:            { icon: '🏃', label: '10 km' },
  half_marathon:      { icon: '🏅', label: 'Půlmaraton' },
  marathon:           { icon: '🏆', label: 'Maraton' },
  strength_basics:    { icon: '💪', label: 'Silové základy' },
  sports_conditioning:{ icon: '⚡', label: 'Sportovní kondice' },
  hyrox:              { icon: '🏋️', label: 'Hyrox' },
  ocr:                { icon: '🧱', label: 'OCR (Spartan/Tough Mudder)' },
  sprint_triathlon:   { icon: '🏊', label: 'Sprint triatlon' },
  olympic_triathlon:  { icon: '🏊', label: 'Olympic triatlon' },
  half_ironman:       { icon: '🚴', label: 'Half Ironman (70.3)' },
  full_ironman:       { icon: '🌟', label: 'Full Ironman' },
};

const EXPERIENCE_OPTIONS = [
  { value: 'beginner',     label: 'Začátečník',    desc: 'Méně než 6 měsíců pravidelného tréninku' },
  { value: 'intermediate', label: 'Pokročilý',     desc: '6 měsíců až 3 roky' },
  { value: 'advanced',     label: 'Zkušený',       desc: '3+ let pravidelného tréninku' },
];

// ── STATE ────────────────────────────────────────────────────────────────────

let state = {
  step: 1,
  primaryGoal: null,
  trainingGoal: null,
  sex: 'muz',
  age: '',
  height: '',
  weight: '',
  experience: 'beginner',
  sessionsPerWeek: 3,
};

// ── MAIN EXPORT ──────────────────────────────────────────────────────────────

/**
 * Call once on app startup. Shows wizard if user hasn't completed onboarding yet.
 * @param {{ onComplete: (result: object) => void }} opts
 */
export function initOnboardingWizard({ onComplete }) {
  if (localStorage.getItem(STORAGE_KEY)) return;

  // Reset to blank state for each new wizard session
  state = { step: 1, primaryGoal: null, trainingGoal: null, sex: 'muz', age: '', height: '', weight: '', experience: 'beginner', sessionsPerWeek: 3 };

  const overlay = buildOverlay();
  document.body.appendChild(overlay);
  renderStep(overlay);
  overlay.style.display = 'flex';

  overlay.addEventListener('wizard-complete', (e) => {
    localStorage.setItem(STORAGE_KEY, '1');
    overlay.remove();
    onComplete(e.detail);
  });

  overlay.addEventListener('wizard-skip', () => {
    localStorage.setItem(STORAGE_KEY, '1');
    overlay.remove();
  });
}

/** Reset onboarding so the wizard shows again (useful for testing / re-onboarding). */
export function resetOnboarding() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── BUILDER ──────────────────────────────────────────────────────────────────

function buildOverlay() {
  const el = document.createElement('div');
  el.id = 'goal-wizard';
  el.style.cssText = 'display:none;position:fixed;inset:0;z-index:9000;background:var(--bg,#111);overflow-y:auto;';
  return el;
}

function renderStep(overlay) {
  overlay.innerHTML = buildStepHTML(state.step);
  // Use onclick (not addEventListener) so re-renders don't stack listeners
  overlay.onclick = makeStepHandler(overlay);
}

function buildStepHTML(step) {
  const progress = `
    <div class="wizard-progress">
      ${[1,2,3,4].map(i => `
        <div class="wizard-dot ${i < step ? 'done' : i === step ? 'active' : ''}">
          ${i < step ? '✓' : i}
        </div>
        ${i < 4 ? '<div class="wizard-line' + (i < step ? ' done' : '') + '"></div>' : ''}
      `).join('')}
    </div>`;

  const skip = `<button class="wizard-skip" data-action="skip">Přeskočit wizard</button>`;

  if (step === 1) return `
    <div class="wizard-inner">
      ${progress}
      <div class="wizard-title">Co chceš dosáhnout?</div>
      <div class="wizard-subtitle">Vyber hlavní cíl — zbytek nastavíme automaticky.</div>
      <div class="wizard-goal-grid" id="pg-grid">
        ${PRIMARY_GOALS.map(g => `
          <div class="wizard-goal-card ${state.primaryGoal === g.value ? 'selected' : ''}"
               data-action="select-primary" data-value="${g.value}">
            <span class="wgc-icon">${g.icon}</span>
            <span class="wgc-label">${g.label}</span>
            <span class="wgc-desc">${g.desc}</span>
          </div>
        `).join('')}
      </div>
      <button class="wizard-btn-primary" data-action="next" ${!state.primaryGoal ? 'disabled' : ''}>Dál →</button>
      ${skip}
    </div>`;

  if (step === 2) {
    const options = GOAL_CONSTRAINTS[state.primaryGoal] || [];
    return `
    <div class="wizard-inner">
      ${progress}
      <div class="wizard-title">Jaký je tvůj závodní / tréninkový cíl?</div>
      <div class="wizard-subtitle">Na co konkrétně chceš trénovat?</div>
      <div class="wizard-training-grid" id="tg-grid">
        ${options.map(k => {
          const meta = TRAINING_GOAL_LABELS[k] || { icon: '🏅', label: k };
          return `
          <div class="wizard-training-card ${state.trainingGoal === k ? 'selected' : ''}"
               data-action="select-training" data-value="${k}">
            <span class="wtc-icon">${meta.icon}</span>
            <span class="wtc-label">${meta.label}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="wizard-btn-row">
        <button class="wizard-btn-secondary" data-action="back">← Zpět</button>
        <button class="wizard-btn-primary" data-action="next" ${!state.trainingGoal ? 'disabled' : ''}>Dál →</button>
      </div>
      ${skip}
    </div>`;
  }

  if (step === 3) return `
    <div class="wizard-inner">
      ${progress}
      <div class="wizard-title">Tvoje aktuální kondice</div>
      <div class="wizard-subtitle">Potřebujeme tě změřit, abychom spočítali kalorie přesně.</div>
      <div class="wizard-form">
        <div class="wizard-field-label">Pohlaví</div>
        <div class="wizard-toggle-row">
          <button class="wizard-toggle ${state.sex === 'muz' ? 'active' : ''}"
                  data-action="set-sex" data-value="muz">Muž</button>
          <button class="wizard-toggle ${state.sex === 'zena' ? 'active' : ''}"
                  data-action="set-sex" data-value="zena">Žena</button>
        </div>
        <div class="wizard-inputs-grid">
          <div class="wizard-input-group">
            <label>Věk</label>
            <input type="number" id="w-age" value="${state.age}" placeholder="25" min="10" max="100" inputmode="numeric">
          </div>
          <div class="wizard-input-group">
            <label>Výška (cm)</label>
            <input type="number" id="w-height" value="${state.height}" placeholder="175" min="100" max="250" inputmode="numeric">
          </div>
          <div class="wizard-input-group">
            <label>Váha (kg)</label>
            <input type="number" id="w-weight" value="${state.weight}" placeholder="75" min="30" max="300" inputmode="numeric">
          </div>
        </div>
      </div>
      <div class="wizard-btn-row">
        <button class="wizard-btn-secondary" data-action="back">← Zpět</button>
        <button class="wizard-btn-primary" data-action="next-step3">Dál →</button>
      </div>
      ${skip}
    </div>`;

  if (step === 4) return `
    <div class="wizard-inner">
      ${progress}
      <div class="wizard-title">Jak moc trénuješ?</div>
      <div class="wizard-subtitle">Ovlivňuje tvůj denní kalorický výdej.</div>
      <div class="wizard-field-label">Tréninků týdně</div>
      <div class="wizard-sessions-grid">
        ${[1,2,3,4,5,6].map(n => `
          <button class="wizard-sessions-btn ${state.sessionsPerWeek === n ? 'active' : ''}"
                  data-action="set-sessions" data-value="${n}">${n}×</button>
        `).join('')}
      </div>
      <div class="wizard-field-label" style="margin-top:20px;">Zkušenosti</div>
      <div class="wizard-exp-grid">
        ${EXPERIENCE_OPTIONS.map(e => `
          <div class="wizard-exp-card ${state.experience === e.value ? 'selected' : ''}"
               data-action="set-exp" data-value="${e.value}">
            <span class="wec-label">${e.label}</span>
            <span class="wec-desc">${e.desc}</span>
          </div>
        `).join('')}
      </div>
      <div class="wizard-btn-row">
        <button class="wizard-btn-secondary" data-action="back">← Zpět</button>
        <button class="wizard-btn-primary" data-action="complete">Spustit Trenr →</button>
      </div>
      ${skip}
    </div>`;

  return '';
}

// ── EVENTS ────────────────────────────────────────────────────────────────────

function makeStepHandler(overlay) {
  return (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const value = el.dataset.value;

    if (action === 'skip') {
      overlay.dispatchEvent(new CustomEvent('wizard-skip'));
      return;
    }

    if (action === 'select-primary') {
      state.primaryGoal = value;
      state.trainingGoal = null; // reset when primary changes
      overlay.querySelectorAll('.wizard-goal-card').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      const nextBtn = overlay.querySelector('[data-action="next"]');
      if (nextBtn) nextBtn.disabled = false;
      return;
    }

    if (action === 'select-training') {
      state.trainingGoal = value;
      overlay.querySelectorAll('.wizard-training-card').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      const nextBtn = overlay.querySelector('[data-action="next"]');
      if (nextBtn) nextBtn.disabled = false;
      return;
    }

    if (action === 'set-sex') {
      state.sex = value;
      overlay.querySelectorAll('[data-action="set-sex"]').forEach(b => b.classList.toggle('active', b.dataset.value === value));
      return;
    }

    if (action === 'set-sessions') {
      state.sessionsPerWeek = Number(value);
      overlay.querySelectorAll('.wizard-sessions-btn').forEach(b => b.classList.toggle('active', b.dataset.value === value));
      return;
    }

    if (action === 'set-exp') {
      state.experience = value;
      overlay.querySelectorAll('.wizard-exp-card').forEach(c => c.classList.toggle('selected', c.dataset.value === value));
      return;
    }

    if (action === 'back') {
      state.step = Math.max(1, state.step - 1);
      renderStep(overlay);
      return;
    }

    if (action === 'next') {
      state.step++;
      renderStep(overlay);
      return;
    }

    if (action === 'next-step3') {
      const age    = overlay.querySelector('#w-age')?.value;
      const height = overlay.querySelector('#w-height')?.value;
      const weight = overlay.querySelector('#w-weight')?.value;
      if (!age || !height || !weight) {
        showValidationError(overlay, 'Vyplň prosím věk, výšku i váhu.');
        return;
      }
      state.age    = age;
      state.height = height;
      state.weight = weight;
      state.step++;
      renderStep(overlay);
      return;
    }

    if (action === 'complete') {
      const result = buildResult();
      overlay.dispatchEvent(new CustomEvent('wizard-complete', { detail: result }));
      return;
    }
  };
}

function showValidationError(overlay, msg) {
  let err = overlay.querySelector('.wizard-error');
  if (!err) {
    err = document.createElement('div');
    err.className = 'wizard-error';
    overlay.querySelector('.wizard-btn-row')?.before(err);
  }
  err.textContent = msg;
}

// ── RESULT ────────────────────────────────────────────────────────────────────

function buildResult() {
  const nutritionKind = primaryGoalToNutritionKind(state.primaryGoal);

  // Map sessionsPerWeek → activity factor (matches existing freq-card values)
  const activityFactor = [1.2, 1.375, 1.375, 1.55, 1.55, 1.725, 1.725][Math.min(state.sessionsPerWeek, 6)];

  return {
    sex: state.sex,
    age: Number(state.age),
    height: Number(state.height),
    weight: Number(state.weight),
    primaryGoal: state.primaryGoal,
    trainingGoal: state.trainingGoal,
    nutritionKind,
    activityFactor,
    experience: state.experience,
    sessionsPerWeek: state.sessionsPerWeek,
  };
}
