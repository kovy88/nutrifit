import type { PrimaryGoal, TrainingGoalKind, UserProfile } from '../../types';
import { peakWeeklyKm, progressVolume } from './plan';

const RUN_RACE_GOALS: TrainingGoalKind[] = ['couch_to_5k', 'run_5k', 'run_10k', 'half_marathon', 'marathon'];
const FITNESS_EVENT_GOALS: TrainingGoalKind[] = ['sports_conditioning', 'hyrox', 'ocr', 'sprint_triathlon', 'olympic_triathlon', 'half_ironman', 'full_ironman'];
const GENERAL_GOALS: TrainingGoalKind[] = ['walking_more', 'general_fitness', 'strength_basics', 'sports_conditioning', 'couch_to_5k'];

export type GoalConflictResolution = {
  allowedTrainingGoals: TrainingGoalKind[];
  conflict?: {
    reason: string;
    boundedNutrition: 'maintenance' | 'mild_deficit' | 'supportive_fueling';
  };
};

export function resolveGoalConflict(primaryGoal: PrimaryGoal, trainingGoal: TrainingGoalKind): GoalConflictResolution {
  const allowedTrainingGoals = allowedTrainingGoalsFor(primaryGoal);
  const raceGoal = RUN_RACE_GOALS.includes(trainingGoal) && trainingGoal !== 'couch_to_5k';

  if (primaryGoal === 'lose_fat' && raceGoal) {
    return {
      allowedTrainingGoals,
      conflict: {
        reason: 'Race builds need enough energy; fat loss stays primary, so running is capped as supportive volume.',
        boundedNutrition: 'mild_deficit',
      },
    };
  }

  if (primaryGoal === 'improve_running') {
    return { allowedTrainingGoals, conflict: undefined };
  }

  if (!allowedTrainingGoals.includes(trainingGoal)) {
    return {
      allowedTrainingGoals,
      conflict: {
        reason: 'This event does not match the selected primary goal for this cycle.',
        boundedNutrition: primaryGoal === 'gain_muscle' ? 'supportive_fueling' : 'maintenance',
      },
    };
  }

  return { allowedTrainingGoals, conflict: undefined };
}

export type RaceFeasibilityInput = {
  trainingGoal: TrainingGoalKind;
  profile: Pick<UserProfile,
    'currentWeeklyKm' |
    'longestRecentRunKm' |
    'runsPerWeek' |
    'raceDateISO' |
    'injuryFlag' |
    'experience'
  >;
  todayISO?: string;
};

export type RaceFeasibilityVerdict = 'feasible' | 'tight' | 'unrealistic';

export type RaceFeasibilityResult = {
  verdict: RaceFeasibilityVerdict;
  weeksUntilRace: number;
  requiredPeakKm: number;
  currentBaseKm: number;
  safePeakByRaceKm: number;
  reasons: string[];
  recommendation: string;
};

export function validateRaceGoalFeasibility(input: RaceFeasibilityInput): RaceFeasibilityResult {
  const { trainingGoal, profile } = input;
  const todayISO = input.todayISO ?? toISODate(new Date());
  const requiredPeakKm = peakWeeklyKm(trainingGoal);
  const hasValidRaceDate = Boolean(profile.raceDateISO && isValidISODate(profile.raceDateISO));
  const weeksUntilRace = weeksBetween(todayISO, profile.raceDateISO);
  const currentBaseKm = resolveCurrentBaseKm(profile);
  const safePeakByRaceKm = maxSafePeakByWeek(currentBaseKm, weeksUntilRace, requiredPeakKm || currentBaseKm);
  const reasons: string[] = [];

  if (!RUN_RACE_GOALS.includes(trainingGoal)) {
    return {
      verdict: 'feasible',
      weeksUntilRace,
      requiredPeakKm,
      currentBaseKm,
      safePeakByRaceKm,
      reasons: ['No race-specific feasibility gate needed for this goal.'],
      recommendation: 'Continue with the normal training plan.',
    };
  }

  if (!hasValidRaceDate) {
    reasons.push('Race date is missing, so the app cannot compare the build length with a safe ramp.');
  }
  if (profile.injuryFlag) reasons.push('Recent injury requires a more conservative build.');
  if ((profile.runsPerWeek ?? 0) > 0 && (profile.runsPerWeek ?? 0) < 3 && trainingGoal !== 'couch_to_5k') {
    reasons.push('Current run frequency is below the usual baseline for this event.');
  }
  if (weeksUntilRace < minimumWeeks(trainingGoal, profile.experience)) {
    reasons.push('The race date leaves less time than the conservative minimum for this goal.');
  }
  if (safePeakByRaceKm < requiredPeakKm * 0.72) {
    reasons.push('A 10 percent weekly ramp cannot reach enough peak volume by race day.');
  }
  if ((profile.longestRecentRunKm ?? 0) > 0 && profile.longestRecentRunKm! < longestRunBaseline(trainingGoal)) {
    reasons.push('The longest recent run is well below the event-specific baseline.');
  }

  const hardSignals = [
    !hasValidRaceDate,
    profile.injuryFlag === true,
    safePeakByRaceKm < requiredPeakKm * 0.6,
    weeksUntilRace < Math.ceil(minimumWeeks(trainingGoal, profile.experience) * 0.7),
  ].filter(Boolean).length;

  const verdict: RaceFeasibilityVerdict = hardSignals > 0 || reasons.length >= 3
    ? 'unrealistic'
    : reasons.length > 0 || safePeakByRaceKm < requiredPeakKm
      ? 'tight'
      : 'feasible';

  return {
    verdict,
    weeksUntilRace,
    requiredPeakKm,
    currentBaseKm,
    safePeakByRaceKm,
    reasons,
    recommendation: recommendationFor(verdict, trainingGoal),
  };
}

export function allowedTrainingGoalsFor(primaryGoal: PrimaryGoal): TrainingGoalKind[] {
  if (primaryGoal === 'improve_running') return RUN_RACE_GOALS;
  if (primaryGoal === 'gain_muscle') return ['strength_basics', 'general_fitness'];
  if (primaryGoal === 'improve_fitness') return ['general_fitness', 'walking_more', 'couch_to_5k', ...FITNESS_EVENT_GOALS];
  if (primaryGoal === 'lose_fat') return ['walking_more', 'general_fitness', 'strength_basics', 'couch_to_5k'];
  return GENERAL_GOALS;
}

function resolveCurrentBaseKm(profile: RaceFeasibilityInput['profile']): number {
  if (profile.currentWeeklyKm && profile.currentWeeklyKm > 0) return profile.currentWeeklyKm;
  if (profile.longestRecentRunKm && profile.longestRecentRunKm > 0) {
    const runsPerWeek = Math.max(profile.runsPerWeek ?? 2, 1);
    return Math.max(Math.round(profile.longestRecentRunKm * Math.min(runsPerWeek, 4) * 0.8), 5);
  }
  return 12;
}

function maxSafePeakByWeek(currentBaseKm: number, weeksUntilRace: number, requiredPeakKm: number): number {
  let peak = progressVolume(currentBaseKm, 0, requiredPeakKm);
  for (let week = 1; week < Math.max(weeksUntilRace, 1); week++) {
    peak = Math.max(peak, progressVolume(currentBaseKm, week, requiredPeakKm));
  }
  return peak;
}

function minimumWeeks(goal: TrainingGoalKind, experience?: string): number {
  const beginnerBonus = experience === 'beginner' ? 4 : 0;
  switch (goal) {
    case 'couch_to_5k': return 8;
    case 'run_5k': return 8 + beginnerBonus;
    case 'run_10k': return 10 + beginnerBonus;
    case 'half_marathon': return 14 + beginnerBonus;
    case 'marathon': return 22 + beginnerBonus;
    default: return 0;
  }
}

function longestRunBaseline(goal: TrainingGoalKind): number {
  switch (goal) {
    case 'run_5k': return 4;
    case 'run_10k': return 7;
    case 'half_marathon': return 12;
    case 'marathon': return 24;
    default: return 0;
  }
}

function recommendationFor(verdict: RaceFeasibilityVerdict, goal: TrainingGoalKind): string {
  if (verdict === 'feasible') return 'Build the plan with the normal safe ramp.';
  if (verdict === 'tight') return 'Proceed conservatively and keep the first weeks easy.';
  if (goal === 'marathon') return 'Move the date later, switch to a half marathon, or choose a run-walk build.';
  if (goal === 'half_marathon') return 'Move the date later, switch to 10K, or choose a run-walk build.';
  return 'Move the date later or choose a shorter, easier event.';
}

function weeksBetween(todayISO: string, raceDateISO?: string): number {
  if (!raceDateISO || !isValidISODate(todayISO) || !isValidISODate(raceDateISO)) return 0;
  const today = parseISODate(todayISO);
  const race = parseISODate(raceDateISO);
  const diffMs = race.getTime() - today.getTime();
  return Math.max(0, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
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

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
