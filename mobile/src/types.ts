export type Gender = 'muz' | 'zena';
/** @deprecated only used for storage migration from v1 profiles */
export type Goal = 'hubnutí' | 'udržení' | 'nabírání';
export type DietStyle = 'standardní' | 'vegetariánský' | 'veganský' | 'bezlepkový' | 'nízkosacharidový' | 'vysokoproteínový';
export type PrimaryGoal = 'lose_weight' | 'maintain_weight' | 'gain_muscle' | 'run_race' | 'triathlon' | 'hyrox_ocr' | 'get_fit' | 'sport_conditioning';
export type TrainingGoalKind = 'general_fitness' | 'run_5k' | 'run_10k' | 'half_marathon' | 'marathon' | 'strength_basics' | 'sports_conditioning' | 'hyrox' | 'sprint_triathlon' | 'olympic_triathlon' | 'half_ironman' | 'full_ironman' | 'ocr';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type NutritionGoalKind = 'fat_loss' | 'maintenance' | 'muscle_gain' | 'endurance' | 'general_fitness';
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
};

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
};

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

