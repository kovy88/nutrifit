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
    'Jsi NutriFit AI, český výživový asistent.',
    'Vrať pouze validní JSON bez markdownu.',
    'Aplikace není zdravotnický prostředek, proto nepoužívej diagnostická ani léčebná tvrzení.',
    'Respektuj alergie, dietní styl a české běžně dostupné suroviny.',
  ].join('\n');

  const prompt = `Vytvoř jídelníček na 1 den s přesně ${profile.mealCount} jídly.

DENNÍ CÍLE: ${macros.kcal} kcal | Bílkoviny ${macros.protein} g | Sacharidy ${macros.carbs} g | Tuky ${macros.fat} g
OSOBA: ${profile.gender === 'muz' ? 'Muž' : 'Žena'}, ${profile.age} let, ${profile.weight} kg, cíl ${profile.goal}
STRAVOVÁNÍ: ${profile.diet}
OBLÍBENÉ: ${profile.likes || 'bez preference'}
OMEZENÍ/ALERGIE: ${profile.dislikes || 'bez omezení'}
JÍDLA: ${names.join(', ')}

Vrať JSON:
{"meals":[{"mealType":"Snídaně","name":"Název","kcal":450,"protein":30,"carbs":45,"fat":12,"fiber":8,"prepTime":10,"difficulty":"Jednoduchá","ingredients":["150g suroviny"],"steps":["Krok."]}]}`;

  return { systemPrompt, prompt, maxTokens: 3500, mealNames: names };
}
