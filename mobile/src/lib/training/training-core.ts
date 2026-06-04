import type {
  TrainingGoalKind,
  TrainingExperience,
  TrainingSessionType,
  TrainingSession,
  SessionKind,
  PlanIntensity,
  UserProfile,
} from '../../types';
import type { SleepSummary, WorkoutSummary } from '../../types/health';

// ── TYPES ──

export type TrainingGoal = {
  kind: TrainingGoalKind;
  currentWeeklyKm?: number;
  longestRecentRunKm?: number;
  runsPerWeek?: number;
  experience?: TrainingExperience;
  raceDateISO?: string;
  targetTimeSeconds?: number;
  availableTrainingDays?: number;
  preferredRestDays?: number[];
  injuryFlag?: boolean;
  gymStrengthAvailable?: boolean;
  runWalkPreferred?: boolean;
  currentWeeklySwimKm?: number;
  currentWeeklyBikeKm?: number;
  desiredWeightChangeKg?: number;
  timelineWeeks?: number;
  primaryGoal?: string;
};

export type TrainingPlan = {
  goalKind: TrainingGoalKind;
  goal?: TrainingGoal;
  weeks?: number; // total duration of the plan in weeks
  weekStartISO: string;
  weekIndex: number;
  sessions: TrainingSession[];
  totalKm: number; // maps to weeklyVolume
  weeklyVolume?: number;
  longRunDistance?: number;
  intensityDistribution?: {
    easy: number; // count of easy sessions
    moderate: number; // count of moderate sessions
    hard: number; // count of hard sessions
  };
  warnings: string[];
  safetyWarnings?: string[];
  totalSwimKm?: number;
  totalBikeKm?: number;
};

export type RaceFeasibilityVerdict = 'feasible' | 'tight' | 'unrealistic';

export type RaceFeasibilityInput = {
  trainingGoal: TrainingGoalKind;
  profile: Pick<UserProfile, 'experience' | 'currentWeeklyKm' | 'longestRecentRunKm' | 'runsPerWeek' | 'raceDateISO' | 'injuryFlag'> & {
    targetTimeSeconds?: number;
  };
  todayISO?: string;
};

export type RaceFeasibilityResult = {
  verdict: RaceFeasibilityVerdict;
  weeksUntilRace: number;
  requiredPeakKm: number;
  currentBaseKm: number;
  safePeakByRaceKm: number;
  reasons: string[];
  recommendation: string;
};

// ── UTILITIES ──

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

function parseISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function weeksBetween(todayISO: string, raceDateISO?: string): number {
  if (!raceDateISO || !isValidISODate(todayISO) || !isValidISODate(raceDateISO)) return 0;
  const today = parseISODate(todayISO);
  const race = parseISODate(raceDateISO);
  const diffMs = race.getTime() - today.getTime();
  return Math.max(0, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

export function estimateWeeklyBaseKm(goal: TrainingGoal, recentWorkouts?: WorkoutSummary[]): number {
  if (goal.currentWeeklyKm && goal.currentWeeklyKm > 0) return goal.currentWeeklyKm;
  const runs = (recentWorkouts || []).filter(w => w.kind === 'run' && w.distanceKm);
  if (!runs.length) return 12; // default safe baseline
  const totalKm = runs.reduce((s, w) => s + (w.distanceKm || 0), 0);
  return Math.round((totalKm / 2) * 10) / 10; // 14 days average
}

export function peakWeeklyKm(kind: TrainingGoalKind): number {
  switch (kind) {
    case 'couch_to_5k':       return 18;
    case 'run_5k':            return 30;
    case 'run_10k':           return 45;
    case 'half_marathon':     return 60;
    case 'marathon':          return 80;
    case 'sports_conditioning':
    case 'sport_conditioning': return 35;
    case 'strength_basics':
    case 'basic_strength':    return 0;
    case 'hyrox':             return 45;
    case 'sprint_triathlon':  return 20;
    case 'olympic_triathlon': return 35;
    case 'half_ironman':      return 45;
    case 'full_ironman':      return 60;
    case 'ocr':               return 50;
    default:                  return 0;
  }
}

function minWeeksForGoal(goal: TrainingGoalKind, experience?: string): number {
  const isBeginner = experience === 'beginner';
  const bonus = isBeginner ? 4 : 0;
  switch (goal) {
    case 'couch_to_5k': return 8;
    case 'run_5k': return 8 + bonus;
    case 'run_10k': return 10 + bonus;
    case 'half_marathon': return 14 + bonus;
    case 'marathon': return 22 + bonus;
    default: return 0;
  }
}

function eventLongRunBaseline(goal: TrainingGoalKind): number {
  switch (goal) {
    case 'run_5k': return 4;
    case 'run_10k': return 7;
    case 'half_marathon': return 12;
    case 'marathon': return 24;
    default: return 0;
  }
}

// ── CORE FUNCTIONS ──

/**
 * 1. estimateFitnessLevel
 * Returns a fitness score (1–10) based on experience, weekly volume, and longest run.
 */
export function estimateFitnessLevel(
  experience: TrainingExperience,
  currentWeeklyKm: number,
  longestRecentRunKm: number
): number {
  let score = 1;

  if (experience === 'intermediate') score += 2;
  else if (experience === 'advanced') score += 4;

  if (currentWeeklyKm > 0) {
    score += Math.min(3, Math.floor(currentWeeklyKm / 15));
  }
  if (longestRecentRunKm > 0) {
    score += Math.min(2, Math.floor(longestRecentRunKm / 8));
  }

  return Math.max(1, Math.min(10, score));
}

/**
 * 2. validateRaceGoalFeasibility
 * Analyzes target timeline and running background, flagging unrealistic/tight builds.
 */
export function validateRaceGoalFeasibility(input: RaceFeasibilityInput): RaceFeasibilityResult {
  const { trainingGoal, profile } = input;
  const todayISO = input.todayISO ?? toDateKey(new Date());
  const requiredPeakKm = peakWeeklyKm(trainingGoal);
  const hasValidRaceDate = Boolean(profile.raceDateISO && isValidISODate(profile.raceDateISO));
  const weeksUntilRace = weeksBetween(todayISO, profile.raceDateISO);
  
  const currentBaseKm = profile.currentWeeklyKm && profile.currentWeeklyKm > 0 
    ? profile.currentWeeklyKm 
    : (profile.longestRecentRunKm ? Math.max(Math.round(profile.longestRecentRunKm * 1.5), 10) : 12);

  const safePeakByRaceKm = maxSafePeakByWeek(currentBaseKm, weeksUntilRace, requiredPeakKm);
  const reasons: string[] = [];

  const raceGoalKinds = ['run_5k', 'run_10k', 'half_marathon', 'marathon'];
  if (!raceGoalKinds.includes(trainingGoal)) {
    return {
      verdict: 'feasible',
      weeksUntilRace,
      requiredPeakKm,
      currentBaseKm,
      safePeakByRaceKm: requiredPeakKm,
      reasons: [],
      recommendation: 'Plan is fully feasible.',
    };
  }

  // Blocking check for marathon: beginners or runners with zero history (weekly km < 10 or missing)
  if (trainingGoal === 'marathon') {
    if (profile.experience === 'beginner' && (!profile.currentWeeklyKm || profile.currentWeeklyKm < 15)) {
      reasons.push('Marathon is highly demanding. Running a marathon from no background volume is blocked.');
    }
  }

  if (!hasValidRaceDate) {
    reasons.push('Race date is missing, so timeline validation cannot run.');
  }

  if (profile.injuryFlag) {
    reasons.push('Recent injury requires a more conservative build.');
  }

  if ((profile.runsPerWeek ?? 0) > 0 && (profile.runsPerWeek ?? 0) < 3 && trainingGoal !== 'couch_to_5k') {
    reasons.push('Current running frequency is too low for a safe build.');
  }

  if (weeksUntilRace < minWeeksForGoal(trainingGoal, profile.experience)) {
    reasons.push('Timeline to the race date is shorter than the recommended safe build length.');
  }

  if (safePeakByRaceKm < requiredPeakKm * 0.72) {
    reasons.push('A safe 10% volume progression cannot reach the required volume by race day.');
  }

  if (profile.longestRecentRunKm && profile.longestRecentRunKm < eventLongRunBaseline(trainingGoal) * 0.4) {
    reasons.push('Longest recent run is too short to start a training plan of this distance.');
  }

  const criticalSignals = [
    profile.injuryFlag === true,
    trainingGoal === 'marathon' && profile.experience === 'beginner' && (!profile.currentWeeklyKm || profile.currentWeeklyKm < 15),
    safePeakByRaceKm < requiredPeakKm * 0.55,
    weeksUntilRace < Math.ceil(minWeeksForGoal(trainingGoal, profile.experience) * 0.65),
  ].filter(Boolean).length;

  let verdict: RaceFeasibilityVerdict = 'feasible';
  if (criticalSignals > 0 || reasons.length >= 3) {
    verdict = 'unrealistic';
  } else if (reasons.length > 0 || safePeakByRaceKm < requiredPeakKm) {
    verdict = 'tight';
  }

  return {
    verdict,
    weeksUntilRace,
    requiredPeakKm,
    currentBaseKm,
    safePeakByRaceKm,
    reasons,
    recommendation: getRecommendation(verdict, trainingGoal),
  };
}

function getRecommendation(verdict: RaceFeasibilityVerdict, goal: TrainingGoalKind): string {
  if (verdict === 'feasible') return 'Your timeline is realistic. Build the plan with a safe progressive ramp.';
  if (verdict === 'tight') return 'Proceed with caution. Keep your first weeks light and do not skip rest days.';
  if (goal === 'marathon') return 'Choose a later race date, select a half marathon instead, or use a run-walk plan.';
  if (goal === 'half_marathon') return 'Select a 10K instead, choose a later race date, or adopt a run-walk progression.';
  return 'Move the date later or choose a shorter distance.';
}

function maxSafePeakByWeek(currentBaseKm: number, weeks: number, peakKm: number): number {
  let peak = calculateSafeWeeklyVolume(currentBaseKm, 0, peakKm, 'moderate');
  for (let w = 1; w < Math.max(weeks, 1); w++) {
    peak = Math.max(peak, calculateSafeWeeklyVolume(currentBaseKm, w, peakKm, 'moderate'));
  }
  return peak;
}

/**
 * 3. calculateSafeWeeklyVolume
 * Applies the 10% volume increase math, with a 30% deload every 4th week.
 */
export function calculateSafeWeeklyVolume(
  currentWeeklyKm: number,
  weekIndex: number,
  peakKm: number,
  intensity?: PlanIntensity
): number {
  const base = currentWeeklyKm > 0 ? currentWeeklyKm : 12;
  const rampRate = intensity === 'easy' ? 0.05 : intensity === 'ambitious_but_safe' ? 0.12 : 0.10;
  
  // Safe ramp up
  const progressiveTarget = base * Math.pow(1 + rampRate, weekIndex);
  let target = Math.min(peakKm, progressiveTarget);

  // Every 4th week is deload (-30%)
  if (weekIndex > 0 && weekIndex % 4 === 3) {
    target = target * 0.7;
  }

  return Math.round(target * 10) / 10;
}

/**
 * 4. generateRunningWeek
 * Creates a safe, structured set of 7 training sessions for the week.
 */
export function generateRunningWeek(
  volume: number,
  goal: TrainingGoalKind,
  experience: TrainingExperience,
  runsPerWeek: number,
  preferredRestDays: number[],
  runWalkPreferred: boolean
): TrainingSession[] {
  const sessions: TrainingSession[] = Array.from({ length: 7 }, (_, i) => ({
    date: '',
    kind: 'rest',
    title: 'Volno',
    durationMinutes: 0,
    intensity: 'rest',
  }));

  const activeDaysCount = Math.max(2, Math.min(runsPerWeek + 1, 6));
  
  // Distribute rest days
  const restDays = new Set<number>();
  preferredRestDays.forEach(d => {
    if (restDays.size < 7 - activeDaysCount) restDays.add(d);
  });
  
  // Fill remaining rest days if needed
  const defaultRest = [1, 3, 4, 6]; // Tue, Thu, Fri, Sun
  for (const d of defaultRest) {
    if (restDays.size >= 7 - activeDaysCount) break;
    restDays.add(d);
  }
  for (let i = 0; i < 7; i++) {
    if (restDays.size >= 7 - activeDaysCount) break;
    restDays.add(i);
  }

  // Get active days list
  const activeDays: number[] = [];
  for (let i = 0; i < 7; i++) {
    if (!restDays.has(i)) {
      activeDays.push(i);
    }
  }

  // Select one active day as strength day
  const strengthDayIdx = activeDays.length >= 3 ? activeDays[2] : activeDays[0];

  // Running days are the other active days
  const runningDays = activeDays.filter(d => d !== strengthDayIdx);

  // Calculate volume distribution
  const longRunPct = experience === 'beginner' ? 0.30 : 0.35;
  const longRunVol = Math.round(volume * longRunPct * 10) / 10;
  const qualityRunVol = Math.round(volume * 0.20 * 10) / 10;

  const remainingRunsCount = Math.max(1, runningDays.length - 2);
  const easyRunVol = Math.round(((volume - longRunVol - qualityRunVol) / remainingRunsCount) * 10) / 10;

  let longRunScheduled = false;
  let qualityScheduled = false;

  const getPaceMinutesPerKm = (kind: SessionKind) => {
    if (kind === 'intervals') return 5.8;
    if (kind === 'tempo') return 6.0;
    if (kind === 'long_run') return 6.8;
    return 6.5; // easy
  };

  const getTitle = (kind: SessionKind, km: number) => {
    const walkPrefix = runWalkPreferred ? 'Běh/chůze: ' : '';
    if (kind === 'long_run') return `${walkPrefix}Long Run ${km} km`;
    if (kind === 'intervals') return `${walkPrefix}Intervaly ${km} km`;
    if (kind === 'tempo') return `${walkPrefix}Tempo běh ${km} km`;
    return `${walkPrefix}Lehký běh ${km} km`;
  };

  // Schedule strength
  sessions[strengthDayIdx] = {
    date: '',
    kind: 'strength',
    title: 'Doplňkový silový trénink (core, stabilita)',
    durationMinutes: 30,
    intensity: 'moderate',
  };

  // Schedule running days
  runningDays.forEach((dayIdx, index) => {
    // Schedule long run on the last running day if possible
    if (!longRunScheduled && (index === runningDays.length - 1 || dayIdx === 5 || dayIdx === 6)) {
      sessions[dayIdx] = {
        date: '',
        kind: 'long_run',
        title: getTitle('long_run', longRunVol),
        distanceKm: longRunVol,
        durationMinutes: Math.round(longRunVol * getPaceMinutesPerKm('long_run')),
        intensity: 'moderate',
      };
      longRunScheduled = true;
      return;
    }

    // Schedule quality run (Tempo / Intervals) on the first running day if possible
    if (!qualityScheduled && index === 0) {
      const isInterval = dayIdx % 2 === 0;
      const kind = isInterval ? 'intervals' : 'tempo';
      sessions[dayIdx] = {
        date: '',
        kind,
        title: getTitle(kind, qualityRunVol),
        distanceKm: qualityRunVol,
        durationMinutes: Math.round(qualityRunVol * getPaceMinutesPerKm(kind)),
        intensity: 'hard',
      };
      qualityScheduled = true;
      return;
    }

    // Easy running day
    sessions[dayIdx] = {
      date: '',
      kind: 'easy_run',
      title: getTitle('easy_run', easyRunVol),
      distanceKm: easyRunVol,
      durationMinutes: Math.round(easyRunVol * getPaceMinutesPerKm('easy_run')),
      intensity: 'easy',
    };
  });

  // Fallback checks
  if (!longRunScheduled && runningDays.length > 0) {
    const lastDayIdx = runningDays[runningDays.length - 1];
    sessions[lastDayIdx] = {
      date: '',
      kind: 'long_run',
      title: getTitle('long_run', longRunVol),
      distanceKm: longRunVol,
      durationMinutes: Math.round(longRunVol * getPaceMinutesPerKm('long_run')),
      intensity: 'moderate',
    };
  }

  // Set rest days
  for (let i = 0; i < 7; i++) {
    if (restDays.has(i)) {
      sessions[i] = {
        date: '',
        kind: 'rest',
        title: 'Volno / chůze',
        durationMinutes: 0,
        intensity: 'rest',
      };
    }
  }

  return sessions;
}

/**
 * 5. generateTrainingPlan
 * Orchestrates the plan creation, applying safety metrics and warnings.
 */
export function generateTrainingPlan(input: {
  goal: TrainingGoal;
  weekStartISO: string;
  weekIndex?: number;
  recentWorkouts?: WorkoutSummary[];
  recentSleep?: SleepSummary[];
  hrvLatest?: number;
  hrvBaseline?: number;
}): TrainingPlan {
  const { goal, weekStartISO, weekIndex = 0, recentWorkouts = [], recentSleep = [], hrvLatest, hrvBaseline } = input;
  const warnings: string[] = [];
  const safetyWarnings: string[] = [];

  const experience = goal.experience ?? 'beginner';
  const runsPerWeek = goal.runsPerWeek ?? (experience === 'beginner' ? 3 : experience === 'intermediate' ? 4 : 5);
  const preferredRestDays = goal.preferredRestDays ?? [];
  const runWalkPreferred = goal.runWalkPreferred ?? false;

  const peak = peakWeeklyKm(goal.kind);
  const base = estimateWeeklyBaseKm(goal, recentWorkouts);
  
  if (!goal.currentWeeklyKm && !recentWorkouts.some(w => w.kind === 'run')) {
    warnings.push('Bez běžecké historie startujeme konzervativně.');
  }

  // Calculate volume
  const volume = calculateSafeWeeklyVolume(base, weekIndex, peak, 'moderate');

  let sessions: TrainingSession[] = [];

  if (goal.kind === 'walking_more') {
    sessions = [
      { date: '', kind: 'recovery_walk', title: 'Lehká chůze 30 min', durationMinutes: 30, intensity: 'easy' },
      { date: '', kind: 'mobility', title: 'Strečink a mobilita 15 min', durationMinutes: 15, intensity: 'easy' },
      { date: '', kind: 'recovery_walk', title: 'Svižná chůze 35 min', durationMinutes: 35, intensity: 'easy' },
      { date: '', kind: 'rest', title: 'Volný den', durationMinutes: 0, intensity: 'rest' },
      { date: '', kind: 'recovery_walk', title: 'Procházka v přírodě 45 min', durationMinutes: 45, intensity: 'easy' },
      { date: '', kind: 'mobility', title: 'Mobilita 20 min', durationMinutes: 20, intensity: 'easy' },
      { date: '', kind: 'rest', title: 'Volný den', durationMinutes: 0, intensity: 'rest' },
    ];
  } else if (goal.kind === 'strength_basics' || goal.kind === 'basic_strength') {
    sessions = [
      { date: '', kind: 'strength', title: 'Síla: Spodní polovina těla (dřepy, výpady)', durationMinutes: 40, intensity: 'moderate' },
      { date: '', kind: 'mobility', title: 'Strečink a mobilita horní poloviny', durationMinutes: 20, intensity: 'easy' },
      { date: '', kind: 'strength', title: 'Síla: Horní polovina těla (tlaky, shyby)', durationMinutes: 40, intensity: 'moderate' },
      { date: '', kind: 'rest', title: 'Volný den', durationMinutes: 0, intensity: 'rest' },
      { date: '', kind: 'strength', title: 'Síla: Střed těla + doplňky', durationMinutes: 30, intensity: 'moderate' },
      { date: '', kind: 'cross_training', title: 'Kardio dle výběru (kolo, plavání) 40 min', durationMinutes: 40, intensity: 'moderate' },
      { date: '', kind: 'rest', title: 'Volný den', durationMinutes: 0, intensity: 'rest' },
    ];
  } else if (goal.kind === 'sports_conditioning' || goal.kind === 'sport_conditioning') {
    sessions = [
      { date: '', kind: 'intervals', title: 'Kondice: Intervalový běh / HIIT', durationMinutes: 35, intensity: 'hard' },
      { date: '', kind: 'strength', title: 'Síla: Funkční kruhový trénink', durationMinutes: 40, intensity: 'moderate' },
      { date: '', kind: 'easy_run', title: 'Lehký klus 4 km', distanceKm: 4, durationMinutes: 26, intensity: 'easy' },
      { date: '', kind: 'rest', title: 'Volný den', durationMinutes: 0, intensity: 'rest' },
      { date: '', kind: 'strength', title: 'Síla: Stabilita, výpony, core', durationMinutes: 30, intensity: 'moderate' },
      { date: '', kind: 'cross_training', title: 'Kondice: Kruhový trénink 50 min', durationMinutes: 50, intensity: 'moderate' },
      { date: '', kind: 'rest', title: 'Volný den', durationMinutes: 0, intensity: 'rest' },
    ];
  } else if (goal.kind === 'general_fitness') {
    sessions = [
      { date: '', kind: 'strength', title: 'Zpevnění: Kruhový trénink celého těla', durationMinutes: 35, intensity: 'moderate' },
      { date: '', kind: 'easy_run', title: 'Aerobní trénink: Lehký klus nebo svižná chůze 5 km', distanceKm: 5, durationMinutes: 33, intensity: 'easy' },
      { date: '', kind: 'mobility', title: 'Uvolnění: Strečink a mobilita celého těla', durationMinutes: 20, intensity: 'easy' },
      { date: '', kind: 'rest', title: 'Volný den', durationMinutes: 0, intensity: 'rest' },
      { date: '', kind: 'strength', title: 'Zpevnění: Domácí cvičení s vlastní vahou', durationMinutes: 30, intensity: 'moderate' },
      { date: '', kind: 'cross_training', title: 'Aktivní odpočinek (plavání / projížďka na kole)', durationMinutes: 45, intensity: 'easy' },
      { date: '', kind: 'rest', title: 'Volný den', durationMinutes: 0, intensity: 'rest' },
    ];
  } else {
    // Running events (couch_to_5k, run_5k, run_10k, half_marathon, marathon, etc.)
    sessions = generateRunningWeek(volume, goal.kind, experience, runsPerWeek, preferredRestDays, runWalkPreferred);
  }

  // Set correct dates YYYY-MM-DD
  sessions.forEach((s, idx) => {
    s.date = addDays(weekStartISO, idx);
  });

  const longRun = sessions.find(s => s.kind === 'long_run');
  const longRunDistance = longRun?.distanceKm ?? 0;

  // Estimate total plan duration based on goal
  let totalWeeks = 12;
  if (goal.kind === 'marathon') totalWeeks = 24;
  else if (goal.kind === 'half_marathon') totalWeeks = 16;

  // Build temporary plan structure to run readiness adjustments and safety checks
  let plan: TrainingPlan = {
    goalKind: goal.kind,
    goal,
    weeks: totalWeeks,
    weekStartISO,
    weekIndex,
    sessions,
    totalKm: volume,
    weeklyVolume: volume,
    longRunDistance,
    intensityDistribution: calculateIntensity(sessions),
    warnings,
    safetyWarnings,
  };

  // Readiness adjustments
  const sleepMinutes = recentSleep && recentSleep.length ? recentSleep.reduce((sum, s) => sum + (s.totalMinutes || 0), 0) / recentSleep.length : 480;
  let hrvDrop = false;
  if (hrvBaseline && hrvBaseline > 0 && hrvLatest != null) {
    const drop = (hrvBaseline - hrvLatest) / hrvBaseline;
    if (drop >= 0.10) hrvDrop = true;
  }
  
  if (sleepMinutes < 360 || hrvDrop) {
    plan = adjustTrainingForRecovery(plan, 'red');
  } else if (sleepMinutes < 420 || (hrvBaseline && hrvBaseline > 0 && hrvLatest != null && (hrvBaseline - hrvLatest) / hrvBaseline >= 0.05)) {
    plan = adjustTrainingForRecovery(plan, 'amber');
  }

  // Safety checks
  const runSafetyErrors = validateTrainingPlanSafety(plan, experience);
  plan.safetyWarnings = plan.safetyWarnings || [];
  plan.safetyWarnings.push(...runSafetyErrors);

  return plan;
}

function calculateIntensity(sessions: TrainingSession[]) {
  let easy = 0;
  let moderate = 0;
  let hard = 0;
  sessions.forEach(s => {
    if (s.intensity === 'easy' || s.kind === 'rest' || s.kind === 'mobility') easy++;
    else if (s.intensity === 'hard') hard++;
    else moderate++;
  });
  return { easy, moderate, hard };
}

/**
 * 6. adjustTrainingForRecovery
 * Adjusts sessions down when physical readiness is compromised.
 */
export function adjustTrainingForRecovery(plan: TrainingPlan, readiness: 'red' | 'amber' | 'green'): TrainingPlan {
  if (readiness === 'green') return plan;

  const adjustedSessions = plan.sessions.map(s => {
    const session = { ...s };
    if (readiness === 'red') {
      // Downgrade all hard workouts
      if (session.intensity === 'hard') {
        session.intensity = 'easy';
        session.kind = 'easy_run';
        session.title = `Zotavovací klus ${session.distanceKm ? Math.round(session.distanceKm * 0.7 * 10) / 10 : 3} km (sníženo kvůli únavě)`;
        if (session.distanceKm) {
          session.distanceKm = Math.round(session.distanceKm * 0.7 * 10) / 10;
          session.durationMinutes = Math.round(session.durationMinutes * 0.7);
        }
      } else if (session.kind === 'long_run') {
        // Cut long run distance by 30%
        session.title = `Zkrácený dlouhý běh ${session.distanceKm ? Math.round(session.distanceKm * 0.7 * 10) / 10 : 8} km`;
        if (session.distanceKm) {
          session.distanceKm = Math.round(session.distanceKm * 0.7 * 10) / 10;
          session.durationMinutes = Math.round(session.durationMinutes * 0.7);
        }
        session.intensity = 'easy';
      }
    } else if (readiness === 'amber') {
      // Scale down intensity slightly
      if (session.intensity === 'hard') {
        session.title = `${session.title} (kontroluj intenzitu)`;
        if (session.distanceKm) {
          session.distanceKm = Math.round(session.distanceKm * 0.85 * 10) / 10;
          session.durationMinutes = Math.round(session.durationMinutes * 0.85);
        }
      }
    }
    return session;
  });

  const nextVolume = Math.round(adjustedSessions.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0) * 10) / 10;
  const longRun = adjustedSessions.find(s => s.kind === 'long_run');

  const warnings = [...plan.warnings];
  const safetyWarnings = [...(plan.safetyWarnings || [])];

  if (readiness === 'red') {
    warnings.push('Snížená regenerace: Trénink byl upraven pro zotavení těla.');
  }

  return {
    ...plan,
    sessions: adjustedSessions,
    totalKm: nextVolume,
    weeklyVolume: nextVolume,
    longRunDistance: longRun?.distanceKm ?? 0,
    intensityDistribution: calculateIntensity(adjustedSessions),
    warnings,
    safetyWarnings,
  };
}

/**
 * 7. adjustTrainingAfterMissedSession
 * Adjusts subsequent runs in the week to avoid double-ups or consecutive load jumps.
 */
export function adjustTrainingAfterMissedSession(plan: TrainingPlan, missedDate: string): TrainingPlan {
  const missedIdx = plan.sessions.findIndex(s => s.date === missedDate);
  if (missedIdx === -1) return plan;

  const adjustedSessions = plan.sessions.map((s, idx) => {
    const session = { ...s };
    if (idx === missedIdx) {
      session.kind = 'rest';
      session.title = 'Vynechaný trénink';
      session.durationMinutes = 0;
      session.distanceKm = 0;
      session.intensity = 'rest';
    } else if (idx > missedIdx) {
      // If we missed a hard run, make sure we do NOT double up with another hard run immediately
      if (session.intensity === 'hard') {
        session.intensity = 'easy';
        session.title = `Lehký běh (úprava po vynechaném tréninku)`;
      }
    }
    return session;
  });

  const nextVolume = Math.round(adjustedSessions.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0) * 10) / 10;
  const longRun = adjustedSessions.find(s => s.kind === 'long_run');

  return {
    ...plan,
    sessions: adjustedSessions,
    totalKm: nextVolume,
    weeklyVolume: nextVolume,
    longRunDistance: longRun?.distanceKm ?? 0,
    intensityDistribution: calculateIntensity(adjustedSessions),
  };
}

/**
 * 8. validateTrainingPlanSafety
 * Returns safety warnings if volume thresholds or rest days constraints are violated.
 */
export function validateTrainingPlanSafety(plan: TrainingPlan, experience: TrainingExperience): string[] {
  const errors: string[] = [];

  const restDays = plan.sessions.filter(s => s.kind === 'rest').length;
  const minRest = experience === 'beginner' ? 2 : 1;

  if (restDays < minRest) {
    errors.push(`Plán má málo dní odpočinku. Pro tuto úroveň doporučujeme alespoň ${minRest} dny volna.`);
  }

  // Check long run vs total volume
  const weeklyVolume = plan.weeklyVolume ?? 0;
  const longRunDistance = plan.longRunDistance ?? 0;
  if (weeklyVolume > 0 && longRunDistance > 0) {
    const pct = longRunDistance / weeklyVolume;
    const maxPct = experience === 'beginner' ? 0.40 : 0.45;
    if (pct > maxPct) {
      errors.push(`Dlouhý běh tvoří příliš velkou část týdenního objemu (${Math.round(pct * 100)} %). Zvyšuje se riziko zranění.`);
    }
  }

  // Beginner marathon block checking
  if (plan.goalKind === 'marathon' && experience === 'beginner') {
    errors.push('Běh maratonu vyžaduje stabilní základ. Začátečníkům doporučujeme nejprve půlmaraton.');
  }

  // Check high volume race training + aggressive fat loss
  const isHighVolumeRace = plan.goalKind === 'marathon' || plan.goalKind === 'half_marathon';
  const weightChange = plan.goal?.desiredWeightChangeKg ?? 0;
  const timelineWeeks = plan.goal?.timelineWeeks ?? 0;
  const rate = timelineWeeks > 0 ? weightChange / timelineWeeks : 0;
  if (isHighVolumeRace && rate > 0.5) {
    errors.push('Kombinace intenzivního běžeckého tréninku a agresivního hubnutí (>0,5 kg/týden) může vést k vyčerpání. Doporučujeme zmírnit tempo hubnutí.');
  }

  return errors;
}
