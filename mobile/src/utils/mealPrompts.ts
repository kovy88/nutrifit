import type { Macros, UserProfile, TrainingSession } from '../types';
import { primaryGoalLabel } from './nutrition';

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

export function buildMealPlanRequest(profile: UserProfile, macros: Macros, session?: TrainingSession | null) {
  const names = namesForMealCount(profile.mealCount);
  const systemPrompt = [
    'You are NutriFit AI, a Czech nutrition assistant.',
    'Return only valid JSON without markdown.',
    'All user-facing JSON string values must be in Czech.',
    'The app is not a medical device, so do not make diagnostic or treatment claims.',
    'Respect allergies, diet style, and ingredients commonly available in Czech stores.',
  ].join('\n');

  let trainingContext = '';
  if (session && session.kind !== 'rest' && session.durationMinutes > 0) {
    trainingContext = `Dnes má uživatel naplánovaný trénink: ${session.title} (druh ${session.kind}, ${session.durationMinutes} min, intenzita ${session.intensity}). 
Jídelníček tréninku rozumně přizpůsob: jídlo bezprostředně před nebo po tréninku by mělo obsahovat více lehce stravitelných sacharidů pro rychlou energii a dostatek bílkovin pro regeneraci. Do popisu jídla nebo postupu můžeš stručně v jedné větě česky zmínit, proč je toto konkrétní jídlo pro dnešní trénink skvělé.`;
  } else {
    trainingContext = 'Dnes má uživatel volný den bez náročného tréninku. Rozlož makroživiny rovnoměrně a zaměř se na stabilní hladinu energie po celý den.';
  }

  const prompt = `Create a 1-day meal plan with exactly ${profile.mealCount} meals.

DAILY TARGETS: ${macros.kcal} kcal | Protein ${macros.protein} g | Carbs ${macros.carbs} g | Fat ${macros.fat} g
PERSON: ${profile.gender === 'muz' ? 'Male' : 'Female'}, ${profile.age} years old, ${profile.weight} kg, goal ${primaryGoalLabel(profile.primaryGoal)}
DIET: ${profile.diet}
TRAINING DAY CONTEXT: ${trainingContext}
LIKED FOODS: ${profile.likes || 'no preference'}
RESTRICTIONS/ALLERGIES: ${profile.dislikes || 'no restrictions'}
MEALS: ${names.join(', ')}

Return JSON:
{"meals":[{"mealType":"Snídaně","name":"Název","kcal":450,"protein":30,"carbs":45,"fat":12,"fiber":8,"prepTime":10,"difficulty":"Jednoduchá","ingredients":["150g suroviny"],"steps":["Krok."]}]}`;

  return { systemPrompt, prompt, maxTokens: 3500, mealNames: names };
}

