import { describe, expect, it } from 'vitest';
import {
  detectMealAllergens,
  parseAllergensFromFreeText,
  validateMealsAgainstAllergens,
} from '../lib/nutrition/allergens';
import type { Meal } from '../types';

function meal(partial: Partial<Meal>): Meal {
  return {
    mealType: 'Snídaně',
    name: 'Test',
    kcal: 400,
    protein: 20,
    carbs: 40,
    fat: 15,
    fiber: 5,
    prepTime: 10,
    difficulty: 'Jednoduchá',
    ingredients: [],
    steps: [],
    ...partial,
  };
}

describe('parseAllergensFromFreeText', () => {
  it('returns empty list for null/empty input', () => {
    expect(parseAllergensFromFreeText(null)).toEqual([]);
    expect(parseAllergensFromFreeText('')).toEqual([]);
    expect(parseAllergensFromFreeText('   ')).toEqual([]);
  });

  it('splits on commas and "a" / "nebo"', () => {
    expect(parseAllergensFromFreeText('arašídy, laktóza a lepek')).toEqual([
      'arašídy',
      'laktóza',
      'lepek',
    ]);
    expect(parseAllergensFromFreeText('vejce nebo sója')).toEqual(['vejce', 'sója']);
  });

  it('drops common stop-words', () => {
    expect(parseAllergensFromFreeText('alergie na arašídy')).toEqual(['arašídy']);
    expect(parseAllergensFromFreeText('intolerance laktózy')).toEqual(['laktózy']);
  });

  it('drops single-character tokens', () => {
    expect(parseAllergensFromFreeText('a, b, mléko')).toEqual(['mléko']);
  });
});

describe('detectMealAllergens', () => {
  it('finds an allergen in the ingredient list', () => {
    const m = meal({ ingredients: ['100g sýra', '50g salátu'] });
    expect(detectMealAllergens(m, ['sýr'])).toEqual(['sýr']);
  });

  it('matches at word boundaries even with Czech diacritics', () => {
    // "Mléko" in ingredients vs "mleko" in allergens (user typed without diacritics)
    const m = meal({ ingredients: ['200ml Mléka', '2 vejce'] });
    expect(detectMealAllergens(m, ['mleko'])).toEqual(['mleko']);
  });

  it('matches word-prefix derivatives (sója → sojový)', () => {
    const m = meal({ ingredients: ['100g sojového tofu'] });
    expect(detectMealAllergens(m, ['sója'])).toEqual(['sója']);
  });

  it('does not match mid-word substrings', () => {
    const m = meal({ name: 'Trasoja', ingredients: ['ovesné vločky'] });
    expect(detectMealAllergens(m, ['soja'])).toEqual([]);
  });

  it('searches name and steps as well as ingredients', () => {
    const stepMeal = meal({
      name: 'Ovesná kaše',
      ingredients: ['60g ovesných vloček', '300ml vody'],
      steps: ['Přidej lžíci medu a kousek másla.'],
    });
    expect(detectMealAllergens(stepMeal, ['máslo'])).toEqual(['máslo']);
  });

  it('returns empty array if no allergens provided', () => {
    expect(detectMealAllergens(meal({ ingredients: ['cokoliv'] }), [])).toEqual([]);
  });

  it('returns multiple hits when multiple allergens match', () => {
    const m = meal({ ingredients: ['100g sýra', '2 vejce'] });
    expect(detectMealAllergens(m, ['sýr', 'vejce', 'arašídy'])).toEqual(['sýr', 'vejce']);
  });
});

describe('validateMealsAgainstAllergens', () => {
  it('is ok when allergens list is empty', () => {
    const result = validateMealsAgainstAllergens([meal({ ingredients: ['mléko'] })], []);
    expect(result.ok).toBe(true);
    expect(result.hits).toEqual([]);
  });

  it('is ok when no meal contains an allergen', () => {
    const meals = [meal({ ingredients: ['ovesné vločky', 'banán'] })];
    const result = validateMealsAgainstAllergens(meals, ['arašídy', 'laktóza']);
    expect(result.ok).toBe(true);
  });

  it('flags only the offending meal and lists which allergens matched', () => {
    const meals = [
      meal({ mealType: 'Snídaně', ingredients: ['ovesné vločky', 'banán'] }),
      meal({ mealType: 'Oběd', ingredients: ['100g sýra', 'salát'] }),
    ];
    const result = validateMealsAgainstAllergens(meals, ['sýr', 'arašídy']);
    expect(result.ok).toBe(false);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].mealIndex).toBe(1);
    expect(result.hits[0].matched).toEqual(['sýr']);
  });
});
