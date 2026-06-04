import type { FollowUpQuestion, GoalProfile } from '../../types/goal-types';

export function generateGoalFollowUps(goal: GoalProfile | null): FollowUpQuestion[] {
  if (!goal) return [];
  const questions: FollowUpQuestion[] = [];

  if (goal.primaryGoal === 'run_race' && goal.raceGoal === 'none') {
    questions.push({
      id: 'raceGoal',
      kind: 'single_choice',
      promptKey: 'onb.followRaceDistance',
      required: true,
      options: [
        { value: 'run_5k', labelKey: 'onb.tgRun5k' },
        { value: 'run_10k', labelKey: 'onb.tgRun10k' },
        { value: 'half_marathon', labelKey: 'onb.tgHalf' },
        { value: 'marathon', labelKey: 'onb.tgMarathon' },
      ],
    });
  }

  if (goal.raceGoal !== 'none') {
    if (!goal.experienceLevel) {
      questions.push({
        id: 'experienceLevel',
        kind: 'single_choice',
        promptKey: 'onb.followExperience',
        required: true,
        options: [
          { value: 'beginner', labelKey: 'onb.expBeginner' },
          { value: 'intermediate', labelKey: 'onb.expIntermediate' },
          { value: 'advanced', labelKey: 'onb.expAdvanced' },
        ],
      });
    }
    if (!isISODate(goal.raceDateISO)) questions.push(text('raceDateISO', 'onb.followRaceDate', 'onb.followRaceDatePlaceholder'));
    if (!goal.currentWeeklyKm) questions.push(number('currentWeeklyKm', 'onb.followWeeklyKm', 'onb.weeklyKmPlaceholder'));
    if (!goal.longestRecentRunKm) questions.push(number('longestRecentRunKm', 'onb.followLongestRun', 'onb.longestRunPlaceholder'));
    if (!goal.runsPerWeek) questions.push(number('runsPerWeek', 'onb.followRunsPerWeek', 'onb.runsPerWeekPlaceholder'));
    if (!goal.availableTrainingDays) questions.push(number('availableTrainingDays', 'onb.followTrainingDays', 'onb.followTrainingDaysPlaceholder'));
    if (goal.targetTimeSeconds === undefined) questions.push(number('targetTimeSeconds', 'onb.followTargetTime', 'onb.targetTimePlaceholder', false));
    if (goal.injuryFlag === undefined) questions.push(booleanChoice('injuryFlag', 'onb.followInjuryFlag'));
    if (goal.gymStrengthAvailable === undefined) questions.push(booleanChoice('gymStrengthAvailable', 'onb.followGymStrengthAvailable'));
    if (goal.runWalkPreferred === undefined) questions.push(booleanChoice('runWalkPreferred', 'onb.followRunWalkPreferred'));
  }

  if (goal.primaryGoal === 'lose_fat') {
    if (!goal.currentWeightKg) questions.push(number('currentWeightKg', 'onb.followCurrentWeight', 'onb.followCurrentWeightPlaceholder'));
    if (!goal.targetWeightKg && !goal.desiredWeightChangeKg) questions.push(number('desiredWeightChangeKg', 'onb.followDesiredChange', 'onb.followDesiredChangePlaceholder'));
    if (!goal.timelineWeeks) questions.push(number('timelineWeeks', 'onb.followTimeline', 'onb.followTimelinePlaceholder'));
    if (!goal.dietPreferences) questions.push(text('dietPreferences', 'onb.followDietPrefs', 'onb.followDietPrefsPlaceholder', false));
  }

  if (goal.primaryGoal === 'build_muscle') {
    if (!goal.trainingEnvironment) {
      questions.push({
        id: 'trainingEnvironment',
        kind: 'single_choice',
        promptKey: 'onb.followTrainingEnvironment',
        required: true,
        options: [
          { value: 'gym', labelKey: 'onb.envGym' },
          { value: 'home', labelKey: 'onb.envHome' },
          { value: 'mixed', labelKey: 'onb.envMixed' },
        ],
      });
    }
    if (!goal.availableTrainingDays) questions.push(number('availableTrainingDays', 'onb.followTrainingDays', 'onb.followTrainingDaysPlaceholder'));
    if (!goal.experienceLevel) {
      questions.push({
        id: 'experienceLevel',
        kind: 'single_choice',
        promptKey: 'onb.followExperience',
        required: true,
        options: [
          { value: 'beginner', labelKey: 'onb.expBeginner' },
          { value: 'intermediate', labelKey: 'onb.expIntermediate' },
          { value: 'advanced', labelKey: 'onb.expAdvanced' },
        ],
      });
    }
  }

  if (goal.primaryGoal === 'build_consistency' || goal.primaryGoal === 'improve_fitness' || goal.primaryGoal === 'recover_better') {
    if (!goal.mainWellbeingBlocker) {
      questions.push({
        id: 'mainWellbeingBlocker',
        kind: 'single_choice',
        promptKey: 'onb.followWellbeingBlocker',
        required: true,
        options: [
          { value: 'energy', labelKey: 'onb.blockerEnergy' },
          { value: 'fitness', labelKey: 'onb.blockerFitness' },
          { value: 'food', labelKey: 'onb.blockerFood' },
          { value: 'sleep', labelKey: 'onb.blockerSleep' },
          { value: 'consistency', labelKey: 'onb.blockerConsistency' },
        ],
      });
    }
  }

  return questions;
}

function isISODate(value?: string): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function hasRequiredGoalFollowUps(goal: GoalProfile | null): boolean {
  return generateGoalFollowUps(goal).filter(question => question.required).length === 0;
}

function text(id: 'raceDateISO' | 'dietPreferences', promptKey: string, placeholderKey: string, required = true): FollowUpQuestion {
  return { id, kind: 'text', promptKey, placeholderKey, required };
}

function number(
  id: 'currentWeeklyKm' | 'longestRecentRunKm' | 'availableTrainingDays' | 'currentWeightKg' | 'targetWeightKg' | 'desiredWeightChangeKg' | 'timelineWeeks' | 'runsPerWeek' | 'targetTimeSeconds',
  promptKey: string,
  placeholderKey: string,
  required = true,
): FollowUpQuestion {
  return { id, kind: 'number', promptKey, placeholderKey, required };
}

function booleanChoice(id: 'injuryFlag' | 'gymStrengthAvailable' | 'runWalkPreferred', promptKey: string): FollowUpQuestion {
  return {
    id,
    kind: 'single_choice',
    promptKey,
    required: true,
    options: [
      { value: true, labelKey: 'common.yes' },
      { value: false, labelKey: 'common.no' }
    ]
  };
}
