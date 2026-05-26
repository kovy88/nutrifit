export type Gender = 'muz' | 'zena';
export type Goal = 'hubnutí' | 'udržení' | 'nabírání';
export type DietStyle = 'standardní' | 'vegetariánský' | 'veganský' | 'bezlepkový' | 'nízkosacharidový' | 'vysokoproteínový';

export type UserProfile = {
  gender: Gender;
  goal: Goal;
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
  bmr: number;
  tdee: number;
  bmi: number;
};

export type FoodLogItem = {
  id: string;
  createdAt: string;
  source: 'manual' | 'photo';
  foodName: string;
  portionGuess?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence?: string;
  note?: string;
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
