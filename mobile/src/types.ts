export type Gender = 'muz' | 'zena';
/** @deprecated only used for storage migration from v1 profiles */
export type Goal = 'hubnutí' | 'udržení' | 'nabírání';
export type DietStyle = 'standardní' | 'vegetariánský' | 'veganský' | 'bezlepkový' | 'nízkosacharidový' | 'vysokoproteínový';
export type PrimaryGoal = 'lose_weight' | 'maintain_weight' | 'gain_muscle' | 'run_race' | 'triathlon' | 'hyrox_ocr' | 'get_fit' | 'sport_conditioning';
export type TrainingGoalKind = 'general_fitness' | 'walking_more' | 'couch_to_5k' | 'run_5k' | 'run_10k' | 'half_marathon' | 'marathon' | 'strength_basics' | 'sports_conditioning' | 'hyrox' | 'sprint_triathlon' | 'olympic_triathlon' | 'half_ironman' | 'full_ironman' | 'ocr';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type NutritionGoalKind = 'fat_loss' | 'maintenance' | 'muscle_gain' | 'endurance' | 'general_fitness';
/** Styl makro rozložení / preferencí jídelníčku. Ovládá macro split + AI prompt. */
export type NutritionMode = 'balanced' | 'high_protein' | 'budget_friendly' | 'simple_meal_prep' | 'endurance_fueling';
/** Jak agresivní má být plán. Clampuje kalorický deficit i tréninkovou progresi. */
export type PlanIntensity = 'easy' | 'moderate' | 'ambitious_but_safe';
/** Na co uživatel kouče používá. 'both' = trénink i jídelníček, 'training' = jen
 *  trénink, 'nutrition' = jen jídelníček. Pohání scope-aware onboarding, Today,
 *  taby i coach engine. Undefined (starší profily) se chová jako 'both'. */
export type CoachScope = 'both' | 'training' | 'nutrition';
export type SessionKind = 'easy_run' | 'tempo' | 'intervals' | 'long_run' | 'recovery_run' | 'strength' | 'mobility' | 'rest' | 'cross_training' | 'race' | 'swim' | 'bike' | 'brick' | 'functional';

export type UserProfile = {
  gender: Gender;
  primaryGoal: PrimaryGoal;
  trainingGoal: TrainingGoalKind;
  sessionsPerWeek: number;
  experience: ExperienceLevel;
  age: number;
  height: number;
  weight: number;
  activityFactor: number;
  likes: string;
  dislikes: string;
  diet: DietStyle;
  mealCount: number;
  /** Styl jídelníčku (default 'balanced'). Optional kvůli migraci starších profilů. */
  nutritionMode?: NutritionMode;
  /** Agresivita plánu (default 'moderate'). Optional kvůli migraci starších profilů. */
  planIntensity?: PlanIntensity;
  /** Zaměření kouče (default 'both'). Optional kvůli migraci starších profilů. */
  coachScope?: CoachScope;
  /** ISO datum (YYYY-MM-DD) startu tréninkového programu — pohání weekIndex progrese. */
  programStartISO?: string;
  /** Aktuální týdenní běžecký objem (km) z onboardingu. Pohání bezpečný start
   *  progresivního planneru místo konzervativního beginner defaultu. */
  currentWeeklyKm?: number;
};

/** Scope helpers — undefined coachScope (legacy profiles) resolves to 'both'. */
export function resolveCoachScope(profile: Pick<UserProfile, 'coachScope'>): CoachScope {
  return profile.coachScope ?? 'both';
}
export function scopeHasNutrition(scope: CoachScope): boolean {
  return scope === 'both' || scope === 'nutrition';
}
export function scopeHasTraining(scope: CoachScope): boolean {
  return scope === 'both' || scope === 'training';
}

export type Macros = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  waterMl: number;
  bmr: number;
  tdee: number;
  bmi: number;
  goal: NutritionGoalKind;
};

export type TrainingSession = {
  date: string;
  kind: SessionKind;
  title: string;
  durationMinutes: number;
  intensity: 'easy' | 'moderate' | 'hard' | 'rest';
  /** Plánovaná vzdálenost (běh/plavání/kolo) — z progresivního planneru. */
  distanceKm?: number;
  /** Volitelná poznámka k jednotce. */
  notes?: string;
};

export type TrainingCompletionStatus = 'completed' | 'skipped' | 'adjusted';
export type TrainingCompletionSource = 'manual' | 'provider_match';

export type TrainingCompletionRecord = {
  date: DateKey;
  status: TrainingCompletionStatus;
  plannedSession: TrainingSession | null;
  actualDurationMinutes?: number | null;
  actualDistanceKm?: number | null;
  rpe?: number | null;
  note?: string;
  source: TrainingCompletionSource;
  pairedWorkoutId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TrainingCompletionRecordMap = Record<DateKey, TrainingCompletionRecord>;

export type DailyAdjustment = {
  note: string;
  kcalDelta: number;
  carbsDelta: number;
  fatDelta: number;
  proteinDelta: number;
  source: 'profile_training_goal' | 'manual_today_session';
};

export type FoodLogItem = {
  id: string;
  createdAt: string;
  source: 'manual' | 'photo' | 'planned';
  foodName: string;
  portionGuess?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence?: string;
  note?: string;
  plannedMealKey?: string;
};

export type Meal = {
  mealType: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  prepTime: number;
  difficulty: string;
  ingredients: string[];
  steps: string[];
};

export type FoodEstimate = Omit<FoodLogItem, 'id' | 'createdAt' | 'source'>;

export type MealPlanValidationResult = {
  valid: boolean;
  errors: string[];
  totals: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
  };
};

export type ShoppingListGroup = {
  category: string;
  items: string[];
};

export type DateKey = string;
export type DailyPlanRecord = Record<DateKey, Meal[]>;
export type DailyFoodLogRecord = Record<DateKey, FoodLogItem[]>;
export type DailySessionRecord = Record<DateKey, TrainingSession>;

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export type SyncConflict<T = unknown> = {
  entity: 'profile' | 'daily_meal_plans' | 'daily_food_logs' | 'daily_targets' | 'weight_entries' | 'weekly_checkins' | 'training_completions' | 'coach_threads' | 'daily_coach_recommendations';
  key: string;
  localUpdatedAt?: string | null;
  remoteUpdatedAt?: string | null;
  resolvedBy: 'local' | 'remote';
  local?: T;
  remote?: T;
};
