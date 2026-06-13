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
      ],
    });
  }

  if (goal.raceGoal !== 'none') {
    if (!isISODate(goal.raceDateISO)) questions.push(text('raceDateISO', 'onb.followRaceDate', 'onb.followRaceDatePlaceholder'));
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
