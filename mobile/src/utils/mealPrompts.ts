import type { Macros, UserProfile } from '../types';

const mealNames: Record<number, string[]> = {
  2: ['Snídaně', 'Večeře'],
  3: ['Snídaně', 'Oběd', 'Večeře'],
  4: ['Snídaně', 'Oběd', 'Odpolední svačina', 'Večeře'],
  5: ['Snídaně', 'Dop. svačina', 'Oběd', 'Odp. svačina', 'Večeře'],
  6: ['Snídaně', 'Dop. svačina', 'Oběd', 'Odp. svačina', 'Večeře', '2. večeře'],
};

export function namesForMealCount(count: number) {
  return mealNames[count] || mealNames[5];
}

export function buildMealPlanRequest(profile: UserProfile, macros: Macros) {
  const names = namesForMealCount(profile.mealCount);
  const systemPrompt = [
    'You are NutriFit AI, a Czech nutrition assistant.',
    'Return only valid JSON without markdown.',
    'All user-facing JSON string values must be in Czech.',
    'The app is not a medical device, so do not make diagnostic or treatment claims.',
    'Respect allergies, diet style, and ingredients commonly available in Czech stores.',
  ].join('\n');

  const prompt = `Create a 1-day meal plan with exactly ${profile.mealCount} meals.

DAILY TARGETS: ${macros.kcal} kcal | Protein ${macros.protein} g | Carbs ${macros.carbs} g | Fat ${macros.fat} g
PERSON: ${profile.gender === 'muz' ? 'Male' : 'Female'}, ${profile.age} years old, ${profile.weight} kg, goal ${profile.goal}
DIET: ${profile.diet}
LIKED FOODS: ${profile.likes || 'no preference'}
RESTRICTIONS/ALLERGIES: ${profile.dislikes || 'no restrictions'}
MEALS: ${names.join(', ')}

Return JSON:
{"meals":[{"mealType":"Snídaně","name":"Název","kcal":450,"protein":30,"carbs":45,"fat":12,"fiber":8,"prepTime":10,"difficulty":"Jednoduchá","ingredients":["150g suroviny"],"steps":["Krok."]}]}`;

  return { systemPrompt, prompt, maxTokens: 3500, mealNames: names };
}
