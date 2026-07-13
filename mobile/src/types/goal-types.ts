export type PrimaryGoal =
  | 'lose_fat'
  | 'build_muscle'
  | 'run_race'
  | 'improve_fitness'
  | 'eat_healthier'
  | 'recover_better'
  | 'build_consistency';

export type RaceGoal =
  | 'none'
  | 'run_5k'
  | 'run_10k'
  | 'half_marathon'
  | 'marathon';

export type NutritionMode =
  | 'fat_loss'
  | 'maintenance'
  | 'muscle_gain'
  | 'performance_fueling'
  | 'healthy_eating'
  | 'simple_meal_prep';

export type TopLevelGoal =
  | 'lose_fat'
  | 'build_strength'
  | 'run_race'
  | 'improve_fitness'
  | 'eat_better'
  | 'recover_better'
  | 'build_consistency';

export type RaceDistance = 'none' | '5k' | '10k' | 'half_marathon' | 'marathon';

export type RaceGoalDetails = {
  distance: RaceDistance;
  dateISO?: string;
  targetTimeSeconds?: number;
};

export type CanonicalNutritionMode =
  | 'fat_loss'
  | 'maintenance'
  | 'muscle_gain'
  | 'performance'
  | 'simple_healthy';

export type TrainingFocus =
  | 'none'
  | 'general_fitness'
  | 'walking'
  | 'running'
  | 'strength'
  | 'sport';

export type PlanIntensity = 'easy' | 'moderate' | 'ambitious_but_safe';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type TrainingEnvironment = 'gym' | 'home' | 'mixed';
export type WellbeingBlocker = 'energy' | 'fitness' | 'food' | 'sleep' | 'consistency';

export type UserConstraints = {
  sessionsPerWeek: 1 | 2 | 3 | 4 | 5 | 6;
  experience: ExperienceLevel;
  currentWeeklyKm?: number;
  longestRecentRunKm?: number;
  injuryFlag?: boolean;
  preferredRestDays?: number[];
  dietStyle?: string;
  foodPreferences?: string;
};

export type GoalProfile = {
  /** Canonical public goal taxonomy. Legacy mirror fields below still feed engines. */
  topLevelGoal?: TopLevelGoal;
  race?: RaceGoalDetails;
  trainingFocus?: TrainingFocus;
  canonicalNutritionMode?: CanonicalNutritionMode;
  constraints?: UserConstraints;
  primaryGoal: PrimaryGoal;
  raceGoal: RaceGoal;
  nutritionMode: NutritionMode;
  planIntensity: PlanIntensity;
  experienceLevel: ExperienceLevel;
  needsFollowUp: boolean;
  rawText?: string;
  summary: string;
  confidence: 'low' | 'medium' | 'high';
  raceDateISO?: string;
  currentWeeklyKm?: number;
  longestRecentRunKm?: number;
  availableTrainingDays?: number;
  runsPerWeek?: number;
  currentWeightKg?: number;
  targetWeightKg?: number;
  desiredWeightChangeKg?: number;
  timelineWeeks?: number;
  dietPreferences?: string;
  trainingEnvironment?: TrainingEnvironment;
  mainWellbeingBlocker?: WellbeingBlocker;
  // Running additions
  targetTimeSeconds?: number;
  preferredRestDays?: number[];
  injuryFlag?: boolean;
  gymStrengthAvailable?: boolean;
  runWalkPreferred?: boolean;
};

export type GoalQuickStart = {
  id: PrimaryGoal;
  labelKey: string;
  subtitleKey: string;
  /** English seed text — used by tests and as the `en` locale value. */
  text: string;
  /** Czech seed text, shown/written when the app locale is `cs`. */
  textCs: string;
  /** Which coach scopes this goal makes sense as a quick start for. 'both' = always. */
  scopes: ('both' | 'training' | 'nutrition')[];
};

export type GoalParseResult = {
  goalProfile: GoalProfile | null;
  matched: string[];
};

export type FollowUpQuestion =
  | {
      id: 'raceGoal';
      kind: 'single_choice';
      promptKey: string;
      required: boolean;
      options: { value: RaceGoal; labelKey: string }[];
    }
  | {
      id: 'raceDateISO' | 'dietPreferences';
      kind: 'text';
      promptKey: string;
      placeholderKey: string;
      required: boolean;
    }
  | {
      id: 'currentWeeklyKm' | 'longestRecentRunKm' | 'availableTrainingDays' | 'currentWeightKg' | 'targetWeightKg' | 'desiredWeightChangeKg' | 'timelineWeeks' | 'runsPerWeek' | 'targetTimeSeconds';
      kind: 'number';
      promptKey: string;
      placeholderKey: string;
      required: boolean;
    }
  | {
      id: 'experienceLevel';
      kind: 'single_choice';
      promptKey: string;
      required: boolean;
      options: { value: ExperienceLevel; labelKey: string }[];
    }
  | {
      id: 'trainingEnvironment';
      kind: 'single_choice';
      promptKey: string;
      required: boolean;
      options: { value: TrainingEnvironment; labelKey: string }[];
    }
  | {
      id: 'mainWellbeingBlocker';
      kind: 'single_choice';
      promptKey: string;
      required: boolean;
      options: { value: WellbeingBlocker; labelKey: string }[];
    }
  | {
      id: 'injuryFlag' | 'gymStrengthAvailable' | 'runWalkPreferred';
      kind: 'single_choice';
      promptKey: string;
      required: boolean;
      options: { value: boolean; labelKey: string }[];
    };
