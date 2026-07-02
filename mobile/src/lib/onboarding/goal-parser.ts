import type { Locale } from '../i18n';
import type { GoalParseResult, GoalProfile, GoalQuickStart, NutritionMode, PrimaryGoal, RaceGoal } from '../../types/goal-types';
import { withGoalProfileDefaults } from './goal-schema';

type GoalSignal = {
  primaryGoal: PrimaryGoal;
  raceGoal?: RaceGoal;
  nutritionMode?: NutritionMode;
  summary: string;
  matched: string[];
};

export const GOAL_QUICK_STARTS: GoalQuickStart[] = [
  { id: 'lose_fat', labelKey: 'onb.quickLoseFat', subtitleKey: 'onb.quickLoseFatSub', text: 'I want to lose fat.', textCs: 'Chci zhubnout tuk.' },
  { id: 'improve_fitness', labelKey: 'onb.quickImproveFitness', subtitleKey: 'onb.quickImproveFitnessSub', text: 'I want to improve my fitness.', textCs: 'Chci zlepšit kondici.' },
  { id: 'run_race', labelKey: 'onb.quickRun5k', subtitleKey: 'onb.quickRun5kSub', text: 'I want to run 5 km.', textCs: 'Chci uběhnout 5 km.' },
  { id: 'run_race', labelKey: 'onb.quickRun10k', subtitleKey: 'onb.quickRun10kSub', text: 'I want to run 10 km.', textCs: 'Chci uběhnout 10 km.' },
  { id: 'run_race', labelKey: 'onb.quickHalfMarathon', subtitleKey: 'onb.quickHalfMarathonSub', text: 'I want to run a half marathon.', textCs: 'Chci uběhnout půlmaraton.' },
  { id: 'build_muscle', labelKey: 'onb.quickBuildMuscle', subtitleKey: 'onb.quickBuildMuscleSub', text: 'I want to build muscle.', textCs: 'Chci nabrat svaly.' },
  { id: 'eat_healthier', labelKey: 'onb.quickEatHealthier', subtitleKey: 'onb.quickEatHealthierSub', text: 'I want to eat healthier.', textCs: 'Chci jíst zdravěji.' },
];

/** Locale-appropriate seed text for a quick-start chip. */
export function goalQuickStartText(quickStart: GoalQuickStart, locale: Locale): string {
  return locale === 'cs' ? quickStart.textCs : quickStart.text;
}

export function parseGoalText(rawText: string): GoalParseResult {
  const text = normalize(rawText);
  if (!text) return { goalProfile: null, matched: [] };

  const signal = detectGoalSignal(text);
  if (!signal) return { goalProfile: null, matched: [] };

  const goalProfile = buildGoalProfile({
    ...signal,
    rawText,
  });
  return { goalProfile, matched: signal.matched };
}

export function goalProfileFromQuickStart(primaryGoal: PrimaryGoal): GoalProfile {
  const quickStart = GOAL_QUICK_STARTS.find(item => item.id === primaryGoal);
  if (!quickStart) {
    throw new Error(`Unknown quick start: ${primaryGoal}`);
  }
  const signal = signalFromPrimaryGoal(primaryGoal);
  return buildGoalProfile({
    ...signal,
    rawText: quickStart.text,
  });
}

export function updateGoalProfile(current: GoalProfile, patch: Partial<GoalProfile>): GoalProfile {
  const next = {
    ...current,
    ...patch,
    summary: buildSummary({ ...current, ...patch }),
    confidence: patch.confidence ?? current.confidence,
  } as GoalProfile;
  return {
    ...next,
    needsFollowUp: hasMissingCoreFollowUp(next),
  };
}

function detectGoalSignal(text: string): GoalSignal | null {
  const raceGoal = detectRaceGoal(text);
  const fatLoss = hasAny(text, ['lose fat', 'fat loss', 'lose weight', 'weight loss', 'cut', 'slim', 'leaner', 'zhub', 'hubnout']);
  const muscle = hasAny(text, ['build muscle', 'gain muscle', 'muscle gain', 'get stronger', 'strength', 'sval', 'síla', 'silov']);
  const healthyFood = hasAny(text, ['eat healthier', 'healthy eating', 'eat better', 'better food', 'nutrition', 'jídel', 'zdravě', 'zdrave']);
  const recover = hasAny(text, ['recover', 'recovery', 'sleep', 'tired', 'fatigue', 'stress', 'regener', 'spánek', 'spanek', 'únav', 'unav']);
  const consistency = hasAny(text, ['consistent', 'consistency', 'routine', 'habit', 'stick with', 'feel better', 'move more', 'pravidel', 'konzist', 'cítit líp', 'citit lip']);
  const fitness = hasAny(text, ['fitness', 'fit', 'condition', 'conditioning', 'shape', 'kondic', 'forma']);

  if (fatLoss && raceGoal !== 'none') {
    return { primaryGoal: 'lose_fat', raceGoal, nutritionMode: 'performance_fueling', summary: buildSummary({ primaryGoal: 'lose_fat', raceGoal }), matched: ['lose_fat', raceGoal] };
  }
  if (muscle) return { primaryGoal: 'build_muscle', nutritionMode: 'muscle_gain', summary: 'muscle gain', matched: ['build_muscle'] };
  if (fatLoss) return { primaryGoal: 'lose_fat', nutritionMode: 'fat_loss', summary: 'fat loss', matched: ['lose_fat'] };
  if (raceGoal !== 'none') return { primaryGoal: 'run_race', raceGoal, nutritionMode: 'performance_fueling', summary: buildSummary({ primaryGoal: 'run_race', raceGoal }), matched: [raceGoal] };
  if (hasAny(text, ['run a race', 'running race', 'race', 'běžecký závod', 'bezecky zavod'])) {
    return { primaryGoal: 'run_race', raceGoal: 'none', nutritionMode: 'performance_fueling', summary: 'race prep', matched: ['run_race'] };
  }
  if (healthyFood) return { primaryGoal: 'eat_healthier', nutritionMode: 'healthy_eating', summary: 'healthy eating', matched: ['eat_healthier'] };
  if (recover) return { primaryGoal: 'recover_better', nutritionMode: 'healthy_eating', summary: 'better recovery', matched: ['recover_better'] };
  if (consistency) return { primaryGoal: 'build_consistency', nutritionMode: 'healthy_eating', summary: 'consistency', matched: ['build_consistency'] };
  if (fitness) return { primaryGoal: 'improve_fitness', nutritionMode: 'healthy_eating', summary: 'fitness', matched: ['improve_fitness'] };
  return null;
}

function signalFromPrimaryGoal(primaryGoal: PrimaryGoal): GoalSignal {
  switch (primaryGoal) {
    case 'lose_fat':
      return { primaryGoal, nutritionMode: 'fat_loss', summary: 'fat loss', matched: [primaryGoal] };
    case 'build_muscle':
      return { primaryGoal, nutritionMode: 'muscle_gain', summary: 'muscle gain', matched: [primaryGoal] };
    case 'run_race':
      return { primaryGoal, raceGoal: 'none', nutritionMode: 'performance_fueling', summary: 'race prep', matched: [primaryGoal] };
    case 'eat_healthier':
      return { primaryGoal, nutritionMode: 'healthy_eating', summary: 'healthy eating', matched: [primaryGoal] };
    case 'recover_better':
      return { primaryGoal, nutritionMode: 'healthy_eating', summary: 'better recovery', matched: [primaryGoal] };
    case 'build_consistency':
      return { primaryGoal, nutritionMode: 'healthy_eating', summary: 'consistency', matched: [primaryGoal] };
    case 'improve_fitness':
      return { primaryGoal, nutritionMode: 'healthy_eating', summary: 'fitness', matched: [primaryGoal] };
  }
}

function buildGoalProfile(signal: GoalSignal & { rawText?: string }): GoalProfile {
  const goalProfile = withGoalProfileDefaults({
    primaryGoal: signal.primaryGoal,
    raceGoal: signal.raceGoal ?? 'none',
    nutritionMode: signal.nutritionMode ?? 'healthy_eating',
    planIntensity: 'moderate',
    experienceLevel: 'beginner',
    rawText: signal.rawText,
    summary: signal.summary || buildSummary({ primaryGoal: signal.primaryGoal, raceGoal: signal.raceGoal ?? 'none' }),
    confidence: signal.matched.length > 1 ? 'high' : 'medium',
  });
  return {
    ...goalProfile,
    needsFollowUp: hasMissingCoreFollowUp(goalProfile),
  };
}

function detectRaceGoal(text: string): RaceGoal {
  if (hasAny(text, ['half marathon', 'half-marathon', '21k', '21 km', 'půlmaraton', 'pulmaraton'])) return 'half_marathon';
  if (hasAny(text, ['marathon', '42k', '42 km', 'maraton'])) return 'marathon';
  if (hasAny(text, ['10k', '10 k', '10km', '10 km', 'desítk', 'desitk'])) return 'run_10k';
  if (hasAny(text, ['5k', '5 k', '5km', '5 km', 'pětku', 'petku'])) return 'run_5k';
  return 'none';
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[.,!?;:()[\]{}"'`´]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some(needle => text.includes(needle));
}

function buildSummary(goal: Pick<GoalProfile, 'primaryGoal' | 'raceGoal'>): string {
  const parts: string[] = [];
  if (goal.primaryGoal === 'lose_fat') parts.push('fat loss');
  else if (goal.primaryGoal === 'build_muscle') parts.push('muscle gain');
  else if (goal.primaryGoal === 'eat_healthier') parts.push('healthy eating');
  else if (goal.primaryGoal === 'recover_better') parts.push('better recovery');
  else if (goal.primaryGoal === 'build_consistency') parts.push('consistency');
  else if (goal.primaryGoal === 'improve_fitness') parts.push('fitness');

  if (goal.raceGoal !== 'none') parts.push(`${raceLabel(goal.raceGoal)} prep`);
  else if (goal.primaryGoal === 'run_race') parts.push('race prep');

  return parts.join(' + ');
}

function raceLabel(raceGoal: RaceGoal): string {
  switch (raceGoal) {
    case 'run_5k': return '5K';
    case 'run_10k': return '10K';
    case 'half_marathon': return 'half marathon';
    case 'marathon': return 'marathon';
    case 'none': return 'race';
  }
}

function hasMissingCoreFollowUp(goal: GoalProfile): boolean {
  if (goal.primaryGoal === 'run_race' && goal.raceGoal === 'none') return true;
  if (goal.raceGoal !== 'none') {
    return !goal.raceDateISO || !goal.currentWeeklyKm || !goal.longestRecentRunKm || !goal.availableTrainingDays || !goal.experienceLevel || !goal.runsPerWeek || goal.injuryFlag === undefined || goal.gymStrengthAvailable === undefined || goal.runWalkPreferred === undefined;
  }
  if (goal.primaryGoal === 'lose_fat') {
    return !goal.currentWeightKg || (!goal.targetWeightKg && !goal.desiredWeightChangeKg);
  }
  if (goal.primaryGoal === 'build_muscle') {
    return !goal.trainingEnvironment || !goal.availableTrainingDays;
  }
  if (goal.primaryGoal === 'build_consistency' || goal.primaryGoal === 'improve_fitness' || goal.primaryGoal === 'recover_better') {
    return !goal.mainWellbeingBlocker;
  }
  return false;
}
