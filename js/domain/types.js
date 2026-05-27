// ── DOMAIN TYPES (JSDoc)
//
// Centrální definice doménových typů NutriPlanu. Ostatní moduly importují
// pouze typy přes JSDoc; runtime nepoužívá žádné objekty z tohoto souboru.
// Tím držíme jednu pravdu o tvaru dat napříč nutrition / training / health
// vrstvami, aniž bychom přecházeli na TypeScript.

/**
 * @typedef {'male'|'female'} Sex
 *
 * @typedef {'sedentary'|'light'|'moderate'|'high'|'very_high'} ActivityLevel
 *   sedentary  ≈ 1.2   — pouze chůze, kancelář
 *   light      ≈ 1.375 — 1–3× týdně lehký pohyb
 *   moderate   ≈ 1.55  — 3–5× týdně trénink
 *   high       ≈ 1.725 — 6–7× týdně, případně fyzická práce
 *   very_high  ≈ 1.9   — 2× denně, profi sport
 *
 * @typedef {'fat_loss'|'maintenance'|'muscle_gain'|'endurance'|'general_fitness'} NutritionGoalKind
 *
 * @typedef {'general_fitness'|'run_5k'|'run_10k'|'half_marathon'|'marathon'|'strength_basics'|'sports_conditioning'|'hyrox'|'sprint_triathlon'|'olympic_triathlon'|'half_ironman'|'full_ironman'|'ocr'} TrainingGoalKind
 *
 * @typedef {'omnivore'|'vegetarian'|'vegan'|'pescatarian'|'keto'|'gluten_free'|'lactose_free'} DietType
 */

/**
 * @typedef {Object} UserProfile
 * @property {string} [id]
 * @property {Sex} sex
 * @property {number} ageYears
 * @property {number} heightCm
 * @property {number} weightKg
 * @property {number} [targetWeightKg]
 * @property {ActivityLevel} activityLevel
 * @property {DietType} [diet]
 * @property {string[]} [allergies]
 * @property {string[]} [dislikes]
 * @property {string[]} [likes]
 * @property {number} [budgetCzkPerServing]
 * @property {number} [maxCookTimeMin]
 * @property {number} [mealsPerDay]
 */

/**
 * @typedef {Object} NutritionGoal
 * @property {NutritionGoalKind} kind
 * @property {number} [targetWeightKg]
 * @property {number} [weeklyRateKg]      Cílová rychlost změny váhy (±). Bezpečný strop 1 % tělesné hmotnosti / týden.
 */

/**
 * @typedef {Object} TrainingGoal
 * @property {TrainingGoalKind} kind
 * @property {string} [raceDateISO]
 * @property {number} [currentWeeklyKm]
 * @property {number} [longestRecentRunKm]
 * @property {number} [avgPaceSecPerKm]
 * @property {number} [sessionsPerWeek]
 * @property {number} [currentWeeklySwimKm]  Triatlon: aktuální týdenní objem plavání.
 * @property {number} [currentWeeklyBikeKm]  Triatlon: aktuální týdenní objem cyklistiky.
 */

/**
 * Denní souhrn aktivit. Načítaný z HealthDataProvideru nebo manuálně.
 * @typedef {Object} DailyActivitySummary
 * @property {string} date                ISO date (YYYY-MM-DD)
 * @property {number} steps
 * @property {number} activeEnergyKcal    Aktivní spálené kcal mimo BMR.
 * @property {number} [basalEnergyKcal]   Pokud zdroj poskytuje.
 * @property {number} [exerciseMinutes]
 * @property {number} [standHours]
 */

/**
 * @typedef {'run'|'walk'|'cycle'|'swim'|'strength'|'hiit'|'yoga'|'other'} WorkoutKind
 *
 * @typedef {Object} WorkoutSummary
 * @property {string} id
 * @property {string} date
 * @property {WorkoutKind} kind
 * @property {number} durationMinutes
 * @property {number} [distanceKm]
 * @property {number} [avgPaceSecPerKm]
 * @property {number} [avgHeartRate]
 * @property {number} [activeEnergyKcal]
 * @property {string} [source]            'mock' | 'manual' | 'apple_health'
 */

/**
 * @typedef {Object} SleepSummary
 * @property {string} date
 * @property {number} totalMinutes
 * @property {number} [deepMinutes]
 * @property {number} [remMinutes]
 * @property {number} [efficiency]        0..1
 */

/**
 * @typedef {Object} HealthMetric
 * @property {string} date
 * @property {'resting_heart_rate'|'hrv'|'body_mass'|'body_fat_percent'} kind
 * @property {number} value
 * @property {string} [unit]
 * @property {string} [source]
 */

/**
 * @typedef {Object} MacroTargets
 * @property {number} kcal
 * @property {number} proteinG
 * @property {number} carbsG
 * @property {number} fatG
 * @property {number} fiberG
 * @property {number} waterMl
 * @property {number} bmr
 * @property {number} tdee
 * @property {'fat_loss'|'maintenance'|'muscle_gain'|'endurance'|'general_fitness'} goal
 * @property {string} [note]
 */

/**
 * @typedef {Object} Ingredient
 * @property {string} name
 * @property {number} [amount]
 * @property {string} [unit]              'g' | 'ml' | 'ks' | 'lžíce' …
 */

/**
 * @typedef {Object} Meal
 * @property {string} [id]
 * @property {string} name                Lidský název (např. „Krémové ovesné kaše“)
 * @property {string} slot                'Snídaně' | 'Oběd' | 'Večeře' | 'Svačina' …
 * @property {Ingredient[]} ingredients
 * @property {string[]} steps
 * @property {number} kcal
 * @property {number} proteinG
 * @property {number} carbsG
 * @property {number} fatG
 * @property {number} [fiberG]
 * @property {number} [prepTimeMin]
 * @property {'easy'|'medium'|'hard'} [difficulty]
 */

/**
 * Plán na jeden den. Ne nutně týdenní pohled.
 * @typedef {Object} DailyMealPlan
 * @property {string} date
 * @property {Meal[]} meals
 * @property {MacroTargets} targets
 */

/**
 * Týdenní jídelníček (např. 7 dnů).
 * @typedef {Object} MealPlan
 * @property {string} weekStartISO
 * @property {DailyMealPlan[]} days
 * @property {string[]} [groceryList]
 */

/**
 * @typedef {'easy_run'|'tempo'|'intervals'|'long_run'|'recovery_run'|'strength'|'mobility'|'rest'|'cross_training'|'race'|'swim'|'bike'|'brick'|'functional'} SessionKind
 *
 * @typedef {Object} TrainingSession
 * @property {string} date
 * @property {SessionKind} kind
 * @property {string} title
 * @property {number} [durationMinutes]
 * @property {number} [distanceKm]
 * @property {'easy'|'moderate'|'hard'|'rest'} intensity
 * @property {string} [notes]
 */

/**
 * @typedef {Object} TrainingPlan
 * @property {TrainingGoalKind} goalKind
 * @property {string} weekStartISO
 * @property {number} weekIndex           Index týdne v rámci plánu (0 = první týden).
 * @property {TrainingSession[]} sessions
 * @property {number} totalKm             Pouze běžecké km. Swim a bike jsou oddělené.
 * @property {number} [totalSwimKm]       Pouze triatlon.
 * @property {number} [totalBikeKm]       Pouze triatlon.
 * @property {string[]} warnings
 */

/**
 * Týdenní check-in od uživatele. Vstup pro [[PlanAdjustment]].
 * @typedef {Object} WeeklyCheckIn
 * @property {string} weekStartISO
 * @property {number} [weightKg]
 * @property {number} adherence           0..1, kolik % plánovaných jídel snědl
 * @property {1|2|3|4|5} [energyLevel]
 * @property {1|2|3|4|5} [hungerLevel]
 * @property {number} [completedSessions]
 * @property {number} [plannedSessions]
 * @property {string} [notes]
 */

/**
 * Výstup adaptivní logiky — co se má v dalším týdnu změnit.
 * @typedef {Object} PlanAdjustment
 * @property {string} forWeekStartISO
 * @property {number} kcalDelta           ± kcal vůči minulému týdnu
 * @property {number} weeklyKmDelta       ± km vůči minulému týdnu
 * @property {string} reason              Lidsky čitelný důvod
 * @property {string[]} warnings
 */

export const __DOMAIN_TYPES__ = true;
