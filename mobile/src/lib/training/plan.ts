// ── TRAINING PLAN CORE (ported from js/domain/training.js)
//
// Generuje týdenní strukturu tréninků pro běžecké cíle (5k/10k/půl/maraton),
// silové základy, sportovní kondici, obecnou fitness, Hyrox, triatlon a OCR.
// Čisté funkce nad doménovými typy — žádný React, žádný stav.
//
// Bezpečnostní pravidla:
//  - Týdenní objem nikdy nezvyšuj o víc než 10 % (klasické pravidlo 10 %).
//  - Pokud uživatel nemá běžeckou historii, začni konzervativně.
//  - Pokud spánek je špatný (< 6 h průměr) nebo HRV výrazně klesá, sniž
//    intenzitu a vynech kvalitní session.
//
// Tituly NEobsahují název dne (mobil renderuje den zvlášť) — na rozdíl od
// webové verze, která prefixovala "Pondělí — …".

import type { SessionKind, TrainingGoalKind, TrainingSession } from '../../types';
import type { SleepSummary, WorkoutSummary } from '../../types/health';

export type TrainingGoal = {
  kind: TrainingGoalKind;
  /** Aktuální týdenní běžecký objem (km), pokud ho uživatel zná. */
  currentWeeklyKm?: number;
  /** Triatlon: aktuální týdenní objem plavání (km). */
  currentWeeklySwimKm?: number;
  /** Triatlon: aktuální týdenní objem cyklistiky (km). */
  currentWeeklyBikeKm?: number;
};

export type TrainingPlan = {
  goalKind: TrainingGoalKind;
  weekStartISO: string;
  weekIndex: number;
  sessions: TrainingSession[];
  /** Pouze běžecké km. Swim a bike jsou oddělené. */
  totalKm: number;
  totalSwimKm?: number;
  totalBikeKm?: number;
  warnings: string[];
};

export type GenerateTrainingPlanInput = {
  goal: TrainingGoal;
  weekStartISO: string;
  weekIndex?: number;
  recentWorkouts?: WorkoutSummary[];
  recentSleep?: SleepSummary[];
  hrvLatest?: number;
  hrvBaseline?: number;
};

export type ReadinessSignal = 'red' | 'amber' | 'green';

export const TRAINING_RULES = Object.freeze({
  MAX_WEEKLY_VOLUME_INCREASE_PCT: 0.1,
  MIN_RUN_KM_BEGINNER: 12, // kdo nemá historii, dostane low-volume start
  AVG_SLEEP_RED_FLAG_MIN: 360, // 6 h
  HRV_DROP_RED_FLAG_PCT: 0.1,
  EASY_PACE_BUFFER: 60, // +60 s/km nad běžné tempo = easy
});

/** Spočítá výchozí týdenní km na základě historie. */
export function estimateWeeklyBaseKm(goal: TrainingGoal, recentWorkouts: WorkoutSummary[]): number | null {
  if (goal.currentWeeklyKm && goal.currentWeeklyKm > 0) return goal.currentWeeklyKm;
  const runs = (recentWorkouts || []).filter(w => w.kind === 'run' && w.distanceKm);
  if (!runs.length) return null;
  const totalKm = runs.reduce((s, w) => s + (w.distanceKm || 0), 0);
  // 14 dní → /2 pro týdenní průměr
  return Math.round((totalKm / 2) * 10) / 10;
}

/** Cílový týdenní objem pro daný cíl (horní cíl plánu, ne okamžitý objem). */
export function peakWeeklyKm(kind: TrainingGoalKind): number {
  switch (kind) {
    case 'run_5k':            return 30;
    case 'run_10k':           return 45;
    case 'half_marathon':     return 60;
    case 'marathon':          return 80;
    case 'hyrox':             return 45;
    case 'sprint_triathlon':  return 20;
    case 'olympic_triathlon': return 35;
    case 'half_ironman':      return 45;
    case 'full_ironman':      return 60;
    case 'ocr':               return 50;
    case 'couch_to_5k':       return 18;
    default:                  return 0;
  }
}

/** Spočítej bezpečný týdenní objem pro week N. Drží pravidlo 10 %. */
export function progressVolume(baseKm: number, weekIndex: number, peakKm: number): number {
  if (!baseKm) baseKm = TRAINING_RULES.MIN_RUN_KM_BEGINNER;
  const target = Math.min(peakKm || baseKm, baseKm * Math.pow(1 + TRAINING_RULES.MAX_WEEKLY_VOLUME_INCREASE_PCT, weekIndex));
  // Každý 4. týden je deload (−30 %)
  if (weekIndex > 0 && weekIndex % 4 === 3) return Math.round(target * 0.7 * 10) / 10;
  return Math.round(target * 10) / 10;
}

/** Vyhodnotí, jestli má smysl tento týden zatlačit. Vrací 'red' | 'amber' | 'green'. */
export function readinessSignal(recentSleep: SleepSummary[], hrvLatest?: number, hrvBaseline?: number): ReadinessSignal {
  const avgSleep = avgMinutes(recentSleep);
  if (avgSleep && avgSleep < TRAINING_RULES.AVG_SLEEP_RED_FLAG_MIN) return 'red';
  if (hrvLatest != null && hrvBaseline != null && hrvBaseline > 0) {
    const drop = (hrvBaseline - hrvLatest) / hrvBaseline;
    if (drop >= TRAINING_RULES.HRV_DROP_RED_FLAG_PCT) return 'red';
    if (drop >= 0.05) return 'amber';
  }
  return 'green';
}

function avgMinutes(sleep: SleepSummary[]): number {
  if (!sleep?.length) return 0;
  const total = sleep.reduce((s, n) => s + (n.totalMinutes || 0), 0);
  return total / sleep.length;
}

// ── PLAN GENERATORS ─────────────────────────────────────────────────────

/** Hlavní generátor. Vrací plán na týden. */
export function generateTrainingPlan(input: GenerateTrainingPlanInput): TrainingPlan {
  const { goal, weekStartISO, weekIndex = 0, recentWorkouts = [], recentSleep = [], hrvLatest, hrvBaseline } = input;
  const readiness = readinessSignal(recentSleep, hrvLatest, hrvBaseline);
  const warnings: string[] = [];
  if (readiness === 'red') warnings.push('Únava nebo špatný spánek — kvalitní session vyměněna za snadný běh.');
  if (readiness === 'amber') warnings.push('Lehký pokles HRV — drž intenzitu spíš pod kontrolou.');

  if (goal.kind === 'walking_more') return walkingPlan(weekStartISO, weekIndex, warnings);
  if (goal.kind === 'couch_to_5k') return couchTo5kPlan(weekStartISO, weekIndex, goal, recentWorkouts, readiness, warnings);
  if (goal.kind === 'strength_basics') return strengthPlan(weekStartISO, weekIndex, readiness, warnings);
  if (goal.kind === 'sports_conditioning') return conditioningPlan(weekStartISO, weekIndex, readiness, warnings);
  if (goal.kind === 'general_fitness') return generalFitnessPlan(weekStartISO, weekIndex, readiness, warnings);
  if (goal.kind === 'hyrox') return hyroxPlan(weekStartISO, weekIndex, goal, recentWorkouts, readiness, warnings);
  if (goal.kind === 'sprint_triathlon' || goal.kind === 'olympic_triathlon' ||
      goal.kind === 'half_ironman'     || goal.kind === 'full_ironman') {
    return triathlonPlan(goal.kind, weekStartISO, weekIndex, goal, readiness, warnings);
  }
  if (goal.kind === 'ocr') return ocrPlan(weekStartISO, weekIndex, goal, recentWorkouts, readiness, warnings);

  return runningPlan(goal, weekStartISO, weekIndex, recentWorkouts, readiness, warnings);
}

function runningPlan(goal: TrainingGoal, weekStartISO: string, weekIndex: number, recentWorkouts: WorkoutSummary[], readiness: ReadinessSignal, warnings: string[]): TrainingPlan {
  const baseKm = estimateWeeklyBaseKm(goal, recentWorkouts) || TRAINING_RULES.MIN_RUN_KM_BEGINNER;
  if (!goal.currentWeeklyKm && !(recentWorkouts || []).some(w => w.kind === 'run')) {
    warnings.push('Bez běžecké historie startujeme konzervativně (~12 km/týden).');
  }

  const peak = peakWeeklyKm(goal.kind);
  const targetKm = progressVolume(baseKm, weekIndex, peak);

  const easyKm = round(targetKm * 0.25);
  const qualityKm = round(targetKm * 0.2);
  const midEasyKm = round(targetKm * 0.15);
  const longKm = round(targetKm - easyKm - qualityKm - midEasyKm);

  const sessions: TrainingSession[] = [];
  sessions.push(session(weekStartISO, 0, 'easy_run', `Lehký běh ${easyKm} km`, easyKm, 'easy'));

  const qualityKind: SessionKind = readiness === 'red' ? 'easy_run' : pickQuality(goal.kind, weekIndex);
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

  return { goalKind: goal.kind, weekStartISO, weekIndex, sessions, totalKm: targetKm, warnings };
}

function pickQuality(kind: TrainingGoalKind, weekIndex: number): SessionKind {
  if (kind === 'marathon' || kind === 'half_marathon') return weekIndex % 3 === 2 ? 'intervals' : 'tempo';
  return weekIndex % 2 === 0 ? 'intervals' : 'tempo';
}

function strengthPlan(weekStartISO: string, weekIndex: number, readiness: ReadinessSignal, warnings: string[]): TrainingPlan {
  const intensity: TrainingSession['intensity'] = readiness === 'red' ? 'moderate' : 'hard';
  const sessions: TrainingSession[] = [
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

function conditioningPlan(weekStartISO: string, weekIndex: number, readiness: ReadinessSignal, warnings: string[]): TrainingPlan {
  const sessions: TrainingSession[] = [
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

function generalFitnessPlan(weekStartISO: string, weekIndex: number, readiness: ReadinessSignal, warnings: string[]): TrainingPlan {
  const sessions: TrainingSession[] = [
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

// ── WALKING MORE (beginner, no running) ─────────────────────────────────
function walkingPlan(weekStartISO: string, weekIndex: number, warnings: string[]): TrainingPlan {
  const sessions: TrainingSession[] = [
    session(weekStartISO, 0, 'easy_run', 'Svižná chůze (lehké tempo)', 0, 'easy'),
    session(weekStartISO, 1, 'mobility', 'Mobilita + protažení 15 min', 0, 'easy'),
    session(weekStartISO, 2, 'easy_run', 'Svižná chůze (lehké tempo)', 0, 'easy'),
    session(weekStartISO, 3, 'rest', 'Volno', 0, 'rest'),
    session(weekStartISO, 4, 'easy_run', 'Delší procházka', 0, 'easy'),
    session(weekStartISO, 5, 'cross_training', 'Aktivita podle chuti (kolo, plavání, výlet)', 0, 'easy'),
    session(weekStartISO, 6, 'rest', 'Volno', 0, 'rest'),
  ];
  return { goalKind: 'walking_more', weekStartISO, weekIndex, sessions, totalKm: 0, warnings };
}

// ── COUCH TO 5K (beginner run/walk, never hard) ─────────────────────────
function couchTo5kPlan(weekStartISO: string, weekIndex: number, goal: TrainingGoal, recentWorkouts: WorkoutSummary[], readiness: ReadinessSignal, warnings: string[]): TrainingPlan {
  if (!(recentWorkouts || []).some(w => w.kind === 'run')) {
    warnings.push('Bez běžecké historie startujeme konzervativně — střídání běhu a chůze.');
  }
  const runKm = progressVolume(8, weekIndex, 18); // 8 km báze → max 18, drží 10 % pravidlo
  // Začátečník: nikdy ne 'hard'. Při špatné readiness i delší den jen 'easy'.
  const longIntensity: TrainingSession['intensity'] = readiness === 'red' ? 'easy' : 'moderate';
  const sessions: TrainingSession[] = [
    session(weekStartISO, 0, 'easy_run', `Běh/chůze intervaly ${round(runKm * 0.3)} km (1 min běh / 2 min chůze)`, round(runKm * 0.3), 'easy'),
    session(weekStartISO, 1, 'rest', 'Volno', 0, 'rest'),
    session(weekStartISO, 2, 'easy_run', `Běh/chůze intervaly ${round(runKm * 0.3)} km`, round(runKm * 0.3), 'easy'),
    session(weekStartISO, 3, 'mobility', 'Mobilita + síla 20 min (dřepy, výpady, plank)', 0, 'easy'),
    session(weekStartISO, 4, 'rest', 'Volno', 0, 'rest'),
    session(weekStartISO, 5, 'easy_run', `Delší běh/chůze ${round(runKm * 0.4)} km`, round(runKm * 0.4), longIntensity),
    session(weekStartISO, 6, 'rest', 'Volno / procházka', 0, 'rest'),
  ];
  return { goalKind: 'couch_to_5k', weekStartISO, weekIndex, sessions, totalKm: runKm, warnings };
}

// ── HYROX ──────────────────────────────────────────────────────────────
function hyroxPlan(weekStartISO: string, weekIndex: number, goal: TrainingGoal, recentWorkouts: WorkoutSummary[], readiness: ReadinessSignal, warnings: string[]): TrainingPlan {
  const baseKm = estimateWeeklyBaseKm(goal, recentWorkouts) || 20;
  if (!goal.currentWeeklyKm && !(recentWorkouts || []).some(w => w.kind === 'run')) {
    warnings.push('Bez běžecké historie startujeme konzervativně. Hyrox vyžaduje solidní aerobní základ.');
  }
  const isDeload = weekIndex > 0 && weekIndex % 4 === 3;
  const runKm = progressVolume(baseKm, weekIndex, 45);
  const satRunKm = isDeload ? 6 : Math.min(10, round(runKm * 0.35));
  const funcDur = isDeload ? 30 : 50;

  const sessions: TrainingSession[] = [
    session(weekStartISO, 0, 'easy_run',   `Lehký běh ${round(runKm * 0.30)} km (aerobní báze, tempo závodu)`, round(runKm * 0.30), 'easy'),
    session(weekStartISO, 1, 'functional', `Stanice A ${funcDur} min — SkiErg, farmer carry, wall balls, burpee broad jump`, 0, readiness === 'red' ? 'moderate' : 'hard'),
    session(weekStartISO, 2, 'strength',   'Silový základ 35 min — výpady, pull-upy, nošení zátěže, plank', 0, 'moderate'),
    session(weekStartISO, 3, 'easy_run',   `Recovery běh ${round(runKm * 0.20)} km`, round(runKm * 0.20), 'easy'),
    session(weekStartISO, 4, 'functional', `Stanice B ${funcDur} min — RowErg, sled push/pull, box jump, kettlebell carry`, 0, readiness === 'red' ? 'moderate' : 'hard'),
    session(weekStartISO, 5, 'brick',      `Závod-simulace: ${satRunKm} km běh + funkční dokončovací okruh 20 min`, satRunKm, readiness === 'red' ? 'moderate' : 'hard'),
    session(weekStartISO, 6, 'rest',       'Volno — aktivní regenerace (chůze, strečink)', 0, 'rest'),
  ];

  return { goalKind: 'hyrox', weekStartISO, weekIndex, sessions, totalKm: runKm, warnings };
}

// ── TRIATHLON ──────────────────────────────────────────────────────────
const TRIATHLON_VOLUMES: Record<string, { swim: { base: number; peak: number }; bike: { base: number; peak: number }; run: { base: number; peak: number } }> = {
  sprint_triathlon:  { swim: { base: 2,  peak: 6  }, bike: { base: 30,  peak: 80  }, run: { base: 10, peak: 20 } },
  olympic_triathlon: { swim: { base: 3,  peak: 10 }, bike: { base: 50,  peak: 120 }, run: { base: 15, peak: 35 } },
  half_ironman:      { swim: { base: 5,  peak: 14 }, bike: { base: 80,  peak: 200 }, run: { base: 20, peak: 45 } },
  full_ironman:      { swim: { base: 8,  peak: 20 }, bike: { base: 120, peak: 300 }, run: { base: 30, peak: 60 } },
};

function triathlonPlan(goalKind: TrainingGoalKind, weekStartISO: string, weekIndex: number, goal: TrainingGoal, readiness: ReadinessSignal, warnings: string[]): TrainingPlan {
  const vol = TRIATHLON_VOLUMES[goalKind];
  const swimBase = goal.currentWeeklySwimKm || vol.swim.base;
  const bikeBase = goal.currentWeeklyBikeKm || vol.bike.base;
  const runBase  = goal.currentWeeklyKm     || vol.run.base;

  const swimKm = progressVolume(swimBase, weekIndex, vol.swim.peak);
  const bikeKm = progressVolume(bikeBase, weekIndex, vol.bike.peak);
  const runKm  = progressVolume(runBase,  weekIndex, vol.run.peak);

  const swimMon  = round(swimKm * 0.55);
  const swimFri  = round(swimKm - swimMon);
  const brickBikeKm = round(bikeKm * 0.55);
  const brickRunKm  = round(runKm  * 0.30);
  const easyRunKm   = round(runKm  * 0.40);
  const isLongDistance = goalKind === 'half_ironman' || goalKind === 'full_ironman';

  const friSwimIntensity: TrainingSession['intensity'] = readiness === 'red' ? 'easy' : 'hard';
  const friSwimTitle = readiness === 'red'
    ? `Lehké plavání ${swimFri} km (náhrada threshold za únavu)`
    : `Threshold plavání ${swimFri} km — intervalové série`;

  const sessions: TrainingSession[] = [
    session(weekStartISO, 0, 'swim',     `Technicko-aerobní plavání ${swimMon} km — drily a základní tempo`, swimMon, 'easy'),
    session(weekStartISO, 1, 'bike',     `Vytrvalostní kolo ${round(bikeKm * 0.35)} km — zóna 2`, round(bikeKm * 0.35), 'moderate'),
    session(weekStartISO, 2, 'easy_run', `Lehký běh ${easyRunKm} km + volitelné plavecké drily`, easyRunKm, 'easy'),
    session(weekStartISO, 3, 'strength', 'Triatlon síla 35 min — jednonohé dřepy, stabilita kyčle, tlak ramene, core', 0, 'moderate'),
    session(weekStartISO, 4, 'swim',     friSwimTitle, swimFri, friSwimIntensity),
    session(weekStartISO, 5, 'brick',    `Brick: ${brickBikeKm} km kolo + ${brickRunKm} km běh (trénink přechodu)`, brickBikeKm + brickRunKm, readiness === 'red' ? 'moderate' : 'hard'),
    isLongDistance
      ? session(weekStartISO, 6, 'easy_run', `Recovery běh ${round(runKm * 0.20)} km`, round(runKm * 0.20), 'easy')
      : session(weekStartISO, 6, 'rest',     'Volno — aktivní regenerace', 0, 'rest'),
  ];

  return { goalKind, weekStartISO, weekIndex, sessions, totalKm: runKm, totalSwimKm: swimKm, totalBikeKm: bikeKm, warnings };
}

// ── OCR (Spartan / Tough Mudder) ────────────────────────────────────────
function ocrPlan(weekStartISO: string, weekIndex: number, goal: TrainingGoal, recentWorkouts: WorkoutSummary[], readiness: ReadinessSignal, warnings: string[]): TrainingPlan {
  const baseKm = estimateWeeklyBaseKm(goal, recentWorkouts) || TRAINING_RULES.MIN_RUN_KM_BEGINNER;
  if (!goal.currentWeeklyKm && !(recentWorkouts || []).some(w => w.kind === 'run')) {
    warnings.push('Bez běžecké historie startujeme konzervativně. OCR vyžaduje solidní běžeckou i silovou bázi.');
  }
  const runKm = progressVolume(baseKm, weekIndex, 50);
  const funcIntensity: TrainingSession['intensity'] = readiness === 'red' ? 'moderate' : 'hard';

  const sessions: TrainingSession[] = [
    session(weekStartISO, 0, 'easy_run',  `Trail běh ${round(runKm * 0.25)} km (terén, nerovný povrch)`, round(runKm * 0.25), 'easy'),
    session(weekStartISO, 1, 'functional', `Překážkový okruh 45 min — grip (dead hangs, rope climb), přenášení, burpees`, 0, funcIntensity),
    session(weekStartISO, 2, 'strength',   'Síla horní poloviny těla 40 min — shyby, farmer carry, sandbag, core', 0, 'moderate'),
    session(weekStartISO, 3, 'easy_run',   `Trail běh ${round(runKm * 0.18)} km`, round(runKm * 0.18), 'easy'),
    session(weekStartISO, 4, 'mobility',   'Mobilita + příprava 25 min (ramena, kyčle, kotníky)', 0, 'easy'),
    session(weekStartISO, 5, 'long_run',   `Trail long run ${round(runKm * 0.45)} km s převýšením`, round(runKm * 0.45), 'moderate'),
    session(weekStartISO, 6, 'rest',       'Volno', 0, 'rest'),
  ];

  return { goalKind: 'ocr', weekStartISO, weekIndex, sessions, totalKm: runKm, warnings };
}

function session(weekStartISO: string, dayOffset: number, kind: SessionKind, title: string, distanceKm: number, intensity: TrainingSession['intensity']): TrainingSession {
  return {
    date: addDays(weekStartISO, dayOffset),
    kind,
    title,
    distanceKm: distanceKm || undefined,
    durationMinutes: estimateMinutes(kind, distanceKm),
    intensity,
  };
}

function estimateMinutes(kind: SessionKind, km: number): number {
  if (kind === 'rest') return 0;
  if (kind === 'mobility') return 20;
  if (kind === 'strength') return 35;
  if (kind === 'cross_training') return 45;
  if (kind === 'intervals') return 35;
  if (kind === 'tempo') return 40;
  if (kind === 'functional') return 50;
  if (kind === 'swim') return km ? Math.round(km * 25) : 40;   // ~2 min/100m easy
  if (kind === 'bike') return km ? Math.round(km * 2.5) : 60;  // ~24 km/h easy
  if (kind === 'brick') return km ? Math.round(km * 3.5) : 75; // bike+run combined
  if (!km) return 30;
  const paceMin = kind === 'recovery_run' ? 7 : kind === 'long_run' ? 6.5 : 6.2;
  return Math.round(km * paceMin);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
