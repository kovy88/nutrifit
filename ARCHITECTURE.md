# NutriPlan — architecture

Tento dokument popisuje cílovou architekturu po refaktoringu na adaptivní
nutriční + tréninkový plánovač. Záměrně inkrementálně — současné UI a
Vercel/Supabase backend zůstávají v provozu, nová vrstva přibyla vedle.

## Layered overview

```
┌────────────────────────────────────────────────────────────────────┐
│ UI (vanilla JS modules + index.html)                                │
│  - js/main.js, js/calculator.js, js/recipes.js, js/profile.js, …    │
└──────────────────────────┬─────────────────────────────────────────┘
                           │ delegates math + plan generation
┌──────────────────────────▼─────────────────────────────────────────┐
│ Services (orchestration)                                            │
│  - js/services/nutrition-plan-service.js                            │
│  - js/services/training-plan-service.js                             │
│  - js/services/ai-plan-service.js  (prompt builder + validator)     │
│  - js/services/health-provider.js  (data source abstraction)        │
└──────────────────────────┬─────────────────────────────────────────┘
                           │ pure functions over typed inputs
┌──────────────────────────▼─────────────────────────────────────────┐
│ Domain (deterministic core)                                         │
│  - js/domain/types.js       — JSDoc typedefs                        │
│  - js/domain/nutrition.js   — BMR/TDEE/macros + day/week adjust     │
│  - js/domain/training.js    — running/strength/general plans        │
└──────────────────────────┬─────────────────────────────────────────┘
                           │ persisted via existing layer
┌──────────────────────────▼─────────────────────────────────────────┐
│ Backend (unchanged)                                                 │
│  - Supabase (profiles, daily_targets, daily_food_logs, …)           │
│  - Vercel serverless API (api/generate.js → Gemini, etc.)           │
└────────────────────────────────────────────────────────────────────┘
```

Důvod této struktury:

- **Doménová vrstva je nezávislá na DOM, Supabase i AI.** Lze ji unit-testovat
  v čistém Node bez prohlížeče (`npm test`).
- **AI smí navrhovat obsah, ne čísla.** kcal/makra/objemy spočítá doména,
  AI dostane fixní cíle a smí jen plnit recepty a kouč-zprávy.
- **Health data jdou přes provider.** Web demo používá `MockHealthDataProvider`;
  budoucí iOS verze přepne na `AppleHealthProvider` bez zásahu do business
  logiky.

## Domain concepts

| Pojem                  | Soubor                  | Smysl                                                  |
| ---------------------- | ----------------------- | ------------------------------------------------------ |
| `UserProfile`          | `js/domain/types.js`    | pohlaví, věk, výška, váha, activity level, preference  |
| `NutritionGoal`        | `js/domain/types.js`    | fat_loss / maintenance / muscle_gain / endurance / fit |
| `TrainingGoal`         | `js/domain/types.js`    | 5k / 10k / půl / maraton / strength / sports / fit     |
| `MacroTargets`         | `js/domain/types.js`    | denní kcal, P/C/F/fiber, voda, BMR, TDEE              |
| `DailyActivitySummary` | `js/domain/types.js`    | kroky, kcal aktivní/bazální, exercise min               |
| `WorkoutSummary`       | `js/domain/types.js`    | typ, trvání, km, tempo, HR                              |
| `SleepSummary`         | `js/domain/types.js`    | celkový spánek, deep, REM, efektivita                   |
| `HealthMetric`         | `js/domain/types.js`    | RHR, HRV, body mass…                                    |
| `TrainingPlan`         | `js/domain/types.js`    | týdenní sessions, totalKm, warnings                     |
| `TrainingSession`      | `js/domain/types.js`    | jeden den: kind, intenzita, km, min, notes              |
| `WeeklyCheckIn`        | `js/domain/types.js`    | váha, adherence, energie, hlad                          |
| `PlanAdjustment`       | `js/domain/types.js`    | ±kcal, ±km, důvod, varování                             |
| `Meal` / `MealPlan`    | `js/domain/types.js`    | jídlo a týdenní jídelníček                              |

## Nutrition determinism

`js/domain/nutrition.js`:

- **BMR** — Mifflin–St Jeor.
- **TDEE** — BMR × activity factor (sedentary…very_high).
- **Calorie target** — fat_loss = mírný deficit, strop = 25 % TDEE a
  minimum (M 1500 / Ž 1200 kcal). Rychlost hubnutí omezena na 1 % tělesné
  hmotnosti / týden. Muscle gain +12 %, endurance +5 %.
- **Protein** — 1.4–2.2 g/kg podle cíle (ISSN 2017, Helms 2014).
- **Fat** — max(27 % energie, 0.6 g/kg).
- **Carbs** — zbytek energie.
- **Fiber** — 14 g / 1000 kcal (DRI).
- **Water** — 35 ml/kg + bonus pro aktivní.
- **adjustForDay()** — rest = méně sacharidů; trénink = +60 % spáleného
  výdaje do sacharidů; long_run = navíc +1 g/kg sacharidů pre-fuel.
- **planWeeklyAdjustment()** — z trendu váhy a adherence vrátí
  `PlanAdjustment` s ±150 kcal nebo varováním.

LLM nikdy nepřepisuje tyto hodnoty — dostává je jako vstup a má jen vyplnit
kreativní obsah. `validateMealPlanMacros()` to navíc tvrdě ověří.

## Training planner

`js/domain/training.js`:

- **estimateWeeklyBaseKm()** — z historie nebo `goal.currentWeeklyKm`.
- **peakWeeklyKm()** — 30/45/60/80 km pro 5k/10k/půl/maraton.
- **progressVolume()** — pravidlo 10 %, deload v každém 4. týdnu (−30 %).
- **readinessSignal()** — průměrný spánek < 6 h ⇒ red; HRV drop ≥ 10 % ⇒ red.
- **generateTrainingPlan()** — týden: easy / quality (intervals nebo tempo)
  / rest / easy / strength / long_run / recovery. Při „red" se quality
  vyměňuje za snadný běh.
- Strength/conditioning/general fitness mají pevné šablony.
- Bez běžecké historie startujeme konzervativně (~12 km/týden) a vyhlásíme
  varování.

## Health data abstraction

`js/services/health-provider.js`:

```js
class HealthDataProvider {
  getDailyActivityRange(startISO, endISO)
  getWorkoutSummaries(startISO, endISO)
  getLatestBodyWeight()
  getSleepSummary(startISO, endISO)
  getHeartRateMetrics(startISO, endISO)
}
```

- `MockHealthDataProvider` — deterministická data ze seedovaného RNG;
  pro web demo i pro testy.
- `ManualHealthDataProvider` — čte z předaného pole záznamů (z Supabase
  nebo localStorage). Slouží i jako fallback bez Apple Health.
- `AppleHealthProvider` — placeholder. NEpředstírá data; deleguje na
  fallback a v `TODO(ios)` blocích popisuje, co bude provádět nativní
  bridge (HealthKit typy, permission strategie, mapování).

Factory: `createHealthDataProvider({ mode })` — `auto` (default) na webu
volí Mock, na iOS po implementaci bridge přepne na Apple.

### Plánované HealthKit typy

`HKQuantityTypeIdentifier*`: `stepCount`, `activeEnergyBurned`,
`basalEnergyBurned`, `distanceWalkingRunning`, `heartRate`,
`restingHeartRate`, `heartRateVariabilitySDNN`, `bodyMass`,
`bodyFatPercentage`. Plus `HKWorkoutType` (run, cycle, swim, strength).
Volitelný zápis: `dietaryEnergyConsumed/protein/carbohydrates/fat` jako
opt-in v nastavení.

### Privacy

- Read-only minimální permission set při onboardingu.
- Každé povolení s vysvětlujícím textem v UI.
- Žádné raw samples se neukládají; pouze denní agregáty v `daily_targets`
  a souhrny tréninků.
- App není zdravotnické zařízení — všechny rady jsou obecné a opatřené
  disclaimerem.

## AI plan service

`js/services/ai-plan-service.js` má dvě veřejné funkce:

- `buildAIPlanPrompt({ profile, nutritionGoal, trainingGoal, macros,
  trainingPlan, recentActivity, options })` — vrací `{ systemPrompt,
  prompt }`. System prompt přikazuje držet čísla a strukturu, generovat
  jen text. User prompt obsahuje konkrétní hodnoty + cílový JSON schema.
- `validateAIPlanOutput(raw, target)` — vlastní hand-rolled validátor
  (žádný Zod, žádné závislosti). Vrací `{ ok, value, errors }` a kontroluje:
  - existenci a typy všech polí
  - `dailyCalories` v rozmezí ±7 % cíle
  - každé jídlo má kcal = P×4 + C×4 + F×9 (±10 kcal)
  - součet jídel sedne na cíl ±7 %

## Integration s existujícím UI

`js/calculator.js` byl refaktorovaný tak, aby volal
`calcMacroTargets()` z domény místo lokálního inline výpočtu. UI behavior
(animace, BMI varování, voda) zůstal beze změny. Tím vznikla cesta, jak
postupně přesunout zbývající business logiku (recipes.js, profile.js)
do služeb bez kompletního přepisu.

Současné Supabase tabulky (`profiles`, `daily_targets`, `daily_meal_plans`,
`daily_food_logs`, `water_logs`, `weight_entries`) plně postačují pro
ukládání rozšířených dat — doménové typy se mapují na sloupce přímo.

## Testy

```
npm test         # spustí všechny tests/*.test.js (47 testů)
```

Pokrytí:

- nutrition: BMR/TDEE, kalorické cíle pro všechny goal kinds, safety
  capping, makro konzistence, denní úpravy (rest / training / long-run),
  weekly adjustment, validace meal planu.
- training: progression cap, deload, peak limit, readiness signál,
  generování plánu pro všechny goal kinds, bezpečnost při bez-historie
  startu a při špatném spánku.
- health-provider: Mock determinismus, Manual filtrování, Apple
  placeholder, factory.
- ai-plan: prompt builder obsahuje cílová čísla, validátor odchytí
  chybějící i nekonzistentní výstup.

## Co je stále mocked

- `MockHealthDataProvider` generuje syntetická data — produkční web demo
  nemá reálná HealthKit data, jen UI připravenost.
- `AppleHealthProvider` deleguje na Mock, dokud neexistuje iOS bridge.
- Existující UI dosud nezobrazuje `TrainingPlan` ani neukládá tréninky;
  následující krok je dashboard sekce „Dnešní trénink".

## Next product steps (doporučené pořadí)

1. Onboarding rozšíření: TrainingGoal výběr (5k/10k/půl/maraton/strength),
   currentWeeklyKm, raceDateISO.
2. Dashboard sekce „Dnešní trénink" — render `TrainingSession` pro
   `selectedDate` z TrainingPlanService.
3. Týdenní check-in UI a uložení do nové tabulky `weekly_checkins`.
4. Adaptivní plán: na začátku nového týdne aplikovat `planWeeklyAdjustment`
   a uložit nový baseline.
5. Apple Health: nativní iOS bridge (Expo + react-native-health), naplnit
   `AppleHealthProvider.getDailyActivityRange` etc.
6. Grocery list per týden (současný shopping.js pracuje s denními
   recepty — rozšířit na 7 dní).
