// ── TRAINING PLAN CORE
//
// Generuje týdenní strukturu tréninků pro běžecké cíle (5k/10k/půl/maraton),
// silové základy, sportovní kondici a obecnou fitness. Žádný DOM přístup,
// žádný stav — funkce jsou čisté nad [[types]].
//
// Bezpečnostní pravidla:
//  - Týdenní objem nikdy nezvyšuj o víc než 10 % (klasické pravidlo 10 %).
//  - Pokud uživatel nemá běžeckou historii, začni konzervativně.
//  - Pokud spánek je špatný (< 6 h průměr) nebo HRV výrazně klesá, sniž
//    intenzitu a vynech kvalitní session.

/** @typedef {import('./types.js').TrainingGoal} TrainingGoal */
/** @typedef {import('./types.js').TrainingGoalKind} TrainingGoalKind */
/** @typedef {import('./types.js').TrainingPlan} TrainingPlan */
/** @typedef {import('./types.js').TrainingSession} TrainingSession */
/** @typedef {import('./types.js').SessionKind} SessionKind */
/** @typedef {import('./types.js').WorkoutSummary} WorkoutSummary */
/** @typedef {import('./types.js').SleepSummary} SleepSummary */

export const TRAINING_RULES = Object.freeze({
  MAX_WEEKLY_VOLUME_INCREASE_PCT: 0.10,
  MIN_RUN_KM_BEGINNER: 12,        // kdo nemá historii, dostane low-volume start
  AVG_SLEEP_RED_FLAG_MIN: 360,    // 6 h
  HRV_DROP_RED_FLAG_PCT: 0.10,
  EASY_PACE_BUFFER: 60,           // +60 s/km nad běžné tempo = easy
});

/**
 * Spočítá výchozí týdenní km na základě historie.
 * @param {TrainingGoal} goal
 * @param {WorkoutSummary[]} recentWorkouts  Posledních ~14 dní.
 */
export function estimateWeeklyBaseKm(goal, recentWorkouts) {
  if (goal.currentWeeklyKm && goal.currentWeeklyKm > 0) return goal.currentWeeklyKm;
  const runs = (recentWorkouts || []).filter(w => w.kind === 'run' && w.distanceKm);
  if (!runs.length) return null;
  const totalKm = runs.reduce((s, w) => s + (w.distanceKm || 0), 0);
  // 14 dní → /2 pro týdenní průměr
  return Math.round((totalKm / 2) * 10) / 10;
}

/**
 * Cílový týdenní objem pro daný cíl. Slouží jako horní cíl plánu, ne jako
 * okamžitý objem — progressLoad() pak interpoluje.
 * @param {TrainingGoalKind} kind
 */
export function peakWeeklyKm(kind) {
  switch (kind) {
    case 'run_5k': return 30;
    case 'run_10k': return 45;
    case 'half_marathon': return 60;
    case 'marathon': return 80;
    default: return 0;
  }
}

/**
 * Spočítej bezpečný týdenní objem pro week N. Drží pravidlo 10 %.
 * @param {number} baseKm
 * @param {number} weekIndex
 * @param {number} peakKm
 */
export function progressVolume(baseKm, weekIndex, peakKm) {
  if (!baseKm) baseKm = TRAINING_RULES.MIN_RUN_KM_BEGINNER;
  const target = Math.min(peakKm || baseKm, baseKm * Math.pow(1 + TRAINING_RULES.MAX_WEEKLY_VOLUME_INCREASE_PCT, weekIndex));
  // Každý 4. týden je deload (−30 %)
  if (weekIndex > 0 && weekIndex % 4 === 3) return Math.round(target * 0.7 * 10) / 10;
  return Math.round(target * 10) / 10;
}

/**
 * Vyhodnotí, jestli má smysl dnes / tento týden zatlačit. Vrací 'red' / 'amber' / 'green'.
 * @param {SleepSummary[]} recentSleep
 * @param {number} [hrvLatest]
 * @param {number} [hrvBaseline]
 */
export function readinessSignal(recentSleep, hrvLatest, hrvBaseline) {
  const avgSleep = avgMinutes(recentSleep);
  if (avgSleep && avgSleep < TRAINING_RULES.AVG_SLEEP_RED_FLAG_MIN) return 'red';
  if (hrvLatest != null && hrvBaseline != null && hrvBaseline > 0) {
    const drop = (hrvBaseline - hrvLatest) / hrvBaseline;
    if (drop >= TRAINING_RULES.HRV_DROP_RED_FLAG_PCT) return 'red';
    if (drop >= 0.05) return 'amber';
  }
  return 'green';
}

function avgMinutes(sleep) {
  if (!sleep?.length) return 0;
  const total = sleep.reduce((s, n) => s + (n.totalMinutes || 0), 0);
  return total / sleep.length;
}

// ── PLAN GENERATORS ─────────────────────────────────────────────────────

const DAYS_CS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];

/**
 * Hlavní generátor. Vrací plán na týden.
 * @param {Object} input
 * @param {TrainingGoal} input.goal
 * @param {string} input.weekStartISO
 * @param {number} [input.weekIndex]
 * @param {WorkoutSummary[]} [input.recentWorkouts]
 * @param {SleepSummary[]} [input.recentSleep]
 * @param {number} [input.hrvLatest]
 * @param {number} [input.hrvBaseline]
 * @returns {TrainingPlan}
 */
export function generateTrainingPlan(input) {
  const { goal, weekStartISO, weekIndex = 0, recentWorkouts = [], recentSleep = [], hrvLatest, hrvBaseline } = input;
  const readiness = readinessSignal(recentSleep, hrvLatest, hrvBaseline);
  const warnings = [];
  if (readiness === 'red') warnings.push('Únava nebo špatný spánek — kvalitní session vyměněna za snadný běh.');
  if (readiness === 'amber') warnings.push('Lehký pokles HRV — drž intenzitu spíš pod kontrolou.');

  if (goal.kind === 'strength_basics') return strengthPlan(weekStartISO, weekIndex, readiness, warnings);
  if (goal.kind === 'sports_conditioning') return conditioningPlan(weekStartISO, weekIndex, readiness, warnings);
  if (goal.kind === 'general_fitness') return generalFitnessPlan(weekStartISO, weekIndex, readiness, warnings);

  return runningPlan(goal, weekStartISO, weekIndex, recentWorkouts, readiness, warnings);
}

function runningPlan(goal, weekStartISO, weekIndex, recentWorkouts, readiness, warnings) {
  const baseKm = estimateWeeklyBaseKm(goal, recentWorkouts) || TRAINING_RULES.MIN_RUN_KM_BEGINNER;
  if (!goal.currentWeeklyKm && !(recentWorkouts || []).some(w => w.kind === 'run')) {
    warnings.push('Bez běžecké historie startujeme konzervativně (~12 km/týden).');
  }

  const peak = peakWeeklyKm(goal.kind);
  const targetKm = progressVolume(baseKm, weekIndex, peak);

  // Rozložení: 4 běhy (easy/quality/easy/long) + 1 silový/mobilita + 2 rest
  // Distribuce km: easy 25 %, quality 20 %, easy 15 %, long 40 %
  const easyKm = round(targetKm * 0.25);
  const qualityKm = round(targetKm * 0.20);
  const midEasyKm = round(targetKm * 0.15);
  const longKm = round(targetKm - easyKm - qualityKm - midEasyKm);

  const sessions = /** @type {TrainingSession[]} */ ([]);
  sessions.push(session(weekStartISO, 0, 'easy_run', `Lehký běh ${easyKm} km`, easyKm, 'easy'));

  const qualityKind = readiness === 'red' ? 'easy_run' : pickQuality(goal.kind, weekIndex);
  const qualityTitle = readiness === 'red'
    ? `Náhradní lehký běh ${qualityKm} km (přesun kvality kvůli únavě)`
    : qualityKind === 'intervals'
      ? `Intervaly ${qualityKm} km (např. 6×800 m s pauzou na klus)`
      : `Tempo běh ${qualityKm} km (cca 20 min v komfortně silném tempu)`;
  sessions.push(session(weekStartISO, 1, qualityKind, qualityTitle, qualityKm, readiness === 'red' ? 'easy' : 'hard'));

  sessions.push(session(weekStartISO, 2, 'rest', 'Volno / mobilita 15 min', 0, 'rest'));
  sessions.push(session(weekStartISO, 3, 'easy_run', `Lehký běh ${midEasyKm} km`, midEasyKm, 'easy'));
  sessions.push(session(weekStartISO, 4, 'strength', 'Silový základ 30 min (dřep, mrtvý tah, kliky, plank)', 0, 'moderate'));
  sessions.push(session(weekStartISO, 5, 'long_run', `Long run ${longKm} km v konverzačním tempu`, longKm, 'moderate'));
  sessions.push(session(weekStartISO, 6, 'recovery_run', `Recovery klus ${Math.max(3, round(longKm * 0.3))} km nebo volno`, Math.max(3, round(longKm * 0.3)), 'easy'));

  return {
    goalKind: goal.kind,
    weekStartISO,
    weekIndex,
    sessions,
    totalKm: targetKm,
    warnings,
  };
}

function pickQuality(kind, weekIndex) {
  // Maraton + půlmaraton: tempo dominuje. 5k/10k: intervaly častěji.
  if (kind === 'marathon' || kind === 'half_marathon') return weekIndex % 3 === 2 ? 'intervals' : 'tempo';
  return weekIndex % 2 === 0 ? 'intervals' : 'tempo';
}

function strengthPlan(weekStartISO, weekIndex, readiness, warnings) {
  const intensity = readiness === 'red' ? 'moderate' : 'hard';
  const sessions = [
    session(weekStartISO, 0, 'strength', 'Full body A (dřep, lavička, veslování, plank)', 0, intensity),
    session(weekStartISO, 1, 'mobility', 'Mobilita 25 min + chůze 30 min', 0, 'easy'),
    session(weekStartISO, 2, 'strength', 'Full body B (mrtvý tah, tlak nad hlavu, shyby, side plank)', 0, intensity),
    session(weekStartISO, 3, 'rest', 'Volno', 0, 'rest'),
    session(weekStartISO, 4, 'strength', 'Full body C (výpady, tlak na šikmé lavici, přítahy, břicho)', 0, intensity),
    session(weekStartISO, 5, 'cross_training', 'Kardio na výběr 30–40 min, nízká až střední intenzita', 0, 'moderate'),
    session(weekStartISO, 6, 'rest', 'Volno', 0, 'rest'),
  ];
  return { goalKind: 'strength_basics', weekStartISO, weekIndex, sessions, totalKm: 0, warnings };
}

function conditioningPlan(weekStartISO, weekIndex, readiness, warnings) {
  const sessions = [
    session(weekStartISO, 0, 'intervals', 'HIIT 25 min (např. 8×30/30)', 0, readiness === 'red' ? 'moderate' : 'hard'),
    session(weekStartISO, 1, 'strength', 'Síla 40 min (dolní polovina)', 0, 'moderate'),
    session(weekStartISO, 2, 'easy_run', 'Lehký běh 5 km nebo kolo 30 min', 5, 'easy'),
    session(weekStartISO, 3, 'strength', 'Síla 40 min (horní polovina)', 0, 'moderate'),
    session(weekStartISO, 4, 'mobility', 'Mobilita + core 30 min', 0, 'easy'),
    session(weekStartISO, 5, 'cross_training', 'Sport / hra 60–90 min', 0, 'moderate'),
    session(weekStartISO, 6, 'rest', 'Volno', 0, 'rest'),
  ];
  return { goalKind: 'sports_conditioning', weekStartISO, weekIndex, sessions, totalKm: 5, warnings };
}

function generalFitnessPlan(weekStartISO, weekIndex, readiness, warnings) {
  const sessions = [
    session(weekStartISO, 0, 'strength', 'Síla 30 min (full body)', 0, readiness === 'red' ? 'moderate' : 'hard'),
    session(weekStartISO, 1, 'easy_run', 'Svižná chůze nebo lehký běh 30 min', 3, 'easy'),
    session(weekStartISO, 2, 'mobility', 'Mobilita 20 min', 0, 'easy'),
    session(weekStartISO, 3, 'strength', 'Síla 30 min (full body)', 0, 'moderate'),
    session(weekStartISO, 4, 'easy_run', 'Lehký běh nebo kolo 35 min', 4, 'easy'),
    session(weekStartISO, 5, 'cross_training', 'Aktivita podle chuti 45 min', 0, 'moderate'),
    session(weekStartISO, 6, 'rest', 'Volno', 0, 'rest'),
  ];
  return { goalKind: 'general_fitness', weekStartISO, weekIndex, sessions, totalKm: 7, warnings };
}

/**
 * @param {string} weekStartISO
 * @param {number} dayOffset
 * @param {SessionKind} kind
 * @param {string} title
 * @param {number} distanceKm
 * @param {'easy'|'moderate'|'hard'|'rest'} intensity
 * @returns {TrainingSession}
 */
function session(weekStartISO, dayOffset, kind, title, distanceKm, intensity) {
  return {
    date: addDays(weekStartISO, dayOffset),
    kind,
    title: `${DAYS_CS[dayOffset]} — ${title}`,
    distanceKm: distanceKm || undefined,
    durationMinutes: estimateMinutes(kind, distanceKm),
    intensity,
  };
}

function estimateMinutes(kind, km) {
  if (kind === 'rest') return 0;
  if (kind === 'mobility') return 20;
  if (kind === 'strength') return 35;
  if (kind === 'cross_training') return 45;
  if (kind === 'intervals') return 35;
  if (kind === 'tempo') return 40;
  if (!km) return 30;
  // Easy ~6:30/km, recovery ~7:00/km
  const paceMin = kind === 'recovery_run' ? 7 : kind === 'long_run' ? 6.5 : 6.2;
  return Math.round(km * paceMin);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function round(n) { return Math.round(n * 10) / 10; }
