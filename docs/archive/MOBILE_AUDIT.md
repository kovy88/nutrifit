> **ARCHIVED 2026-05-27 → 2026-07-02.** Popisuje `mobile/` appku v době, kdy měla 3 653 LOC / 24 souborů. Dnes má `mobile/src` přes 31 000 LOC — většina zde popsaných problémů (duplicitní `HomeScreen`, chybějící HealthKit, chybějící backend pro user data) už je vyřešená. Neber jako popis současného stavu. Aktuální architektura: [`docs/architecture.md`](../architecture.md).

# NutriFit Mobile — Brutální Technický Audit

**Scope:** `/mobile` (Expo 56, React Native 0.85, TypeScript strict, Vitest)
**LOC:** 3 653 v `mobile/src`, 24 souborů
**Branch:** `refactor/nutriplan-adaptive-v2`
**Datum:** 2026-05-27

---

## 1. Executive technical verdict

Technicky je tohle **TypeScript Expo skeleton s vážnými strukturálními problémy**, který ale **na rozdíl od web verze má reálný mobilní základ**. Použitelný framework (Expo SDK 56), čistá navigace (bottom tabs + native stack), AsyncStorage persistence, Vitest testy, separace UI ↔ utils. Velký krok proti webu.

**Ale:**

- **`HomeScreen.tsx` má duplikované deklarace** (`todayOptions`, `formatDelta`, `styles` jsou definovány **dvakrát**, řádky 271/356, 309/394, 314/399). S `strict: true` v `tsconfig.json` to **nesmí kompilovat**. Buď jste suppressed errors, nebo build nikdy neprošel `tsc --noEmit`. To je P0 blocker.
- **Doménová logika je duplikovaná mezi web a mobile.** `mobile/src/utils/nutrition.ts` (438 LOC) je TS port `js/domain/nutrition.js`. Žádný shared package. **Driftnou do tří měsíců.**
- **Žádný HealthKit kód.** `grep -rn "HealthKit\|expo-health\|react-native-health"` v `mobile/` → 0 výsledků. Roadmapa s HealthKitem je čistá ambice, technicky není nastartovaná.
- **Triple goal model** na `UserProfile`: `goal` (Czech strings), `primaryGoal` (enum), `trainingGoal` (enum) — všechny tři source-of-truth, s mapping funkcemi mezi nimi. Pick one.
- **Storage roste donekonečna.** `plansByDate`, `foodLogsByDate`, `sessionsByDate`, `weightsByDate` v AsyncStorage bez retention policy. Za rok 365 záznamů per typ × kapacita AsyncStorage = problém.
- **Žádný backend pro user data.** Supabase má jen auth. Plány, food log, váhy = jen device-local. Ztratíš telefon → ztratíš vše. To je product-fatal pro health appku.

**Největší technická slabina:** Duplikace `HomeScreen.tsx` a dvojí doménová logika. Před tím nelze stavět dál.

**Největší product-engineering slabina:** Nemáte HealthDataProvider abstrakci v mobile. Web ji má, mobile ji neimportuje, ne­replikuje. Bez ní HealthKit integrace = napsat všechno znovu.

**Největší risk před HealthKitem:** Žádný backend pro health summaries. Nemáte `health_daily_summaries` tabulku. Až přidáte HealthKit, kam to budete cachovat? Pokud jen do AsyncStorage, ztratíte data při změně telefonu.

**Jeden refactor, který by zlepšil všechno:** Vytvořit `packages/core/` (monorepo) s doménou jako shared TS package, který importují obě verze. Tím zmizí drift mezi `js/domain/*.js` a `mobile/src/utils/nutrition.ts`. Dvoudenní práce, ohromné platby.

---

## 2. Repository structure audit

### Současný stav

```
mobile/
├── App.tsx                          # 33 LOC, čistý entrypoint
├── app.json                         # Expo config, bundle ID, perms
├── src/
│   ├── components/                  # UI building blocks
│   │   ├── DateHeader.tsx
│   │   ├── MacroRing.tsx
│   │   ├── Screen.tsx
│   │   └── UI.tsx                   # ⚠️ kitchen-sink (Button, Card, Field, Pill, ...)
│   ├── constants/theme.ts
│   ├── context/                     # ⚠️ jen 2 contexty — vše v jednom NutriFitContext
│   │   ├── NutriFitContext.tsx      # 290 LOC, mega-context
│   │   └── ThemeContext.tsx
│   ├── navigation/RootNavigator.tsx
│   ├── screens/                     # plochý seznam, žádné feature foldery
│   ├── services/
│   │   ├── api.ts                   # AI volání
│   │   ├── storage.ts               # AsyncStorage
│   │   └── supabase.ts              # auth client
│   ├── utils/
│   │   ├── nutrition.ts             # ⚠️ 438 LOC, domain + utils + format
│   │   └── mealPrompts.ts
│   ├── types.ts                     # ⚠️ flat type dump
│   └── __tests__/                   # 2 test soubory
```

### Strukturální problémy

| # | Problém | Důsledek |
|---|---------|----------|
| 1 | `utils/nutrition.ts` má 438 LOC a obsahuje **BMR + macro + adjust + training session generator + shopping list categorize + date format + validation + migration**. To není utils, to je `lib/domain/`. | Refactor friction. Změna v BMR formuli si žádá test pro shopping list. |
| 2 | `context/NutriFitContext.tsx` je 290 LOC mega-context. Drží profil, plány, food log, sessions, weights, auth, AI consent, selectedDate. **Každý setter trigeruje re-render všech 7 obrazovek.** | Performance + maintainability. |
| 3 | Žádná separace feature/business logic — `screens/HomeScreen.tsx` má 431 LOC s inline `todayOptions()` a `formatDelta()`. | Business pravidla (jaké sessions nabízet pro `hyrox`) jsou rozsypaná v UI. |
| 4 | `components/UI.tsx` (177 LOC) je kitchen-sink (`Button`, `Card`, `Field`, `Pill`, `FadeInView`). | Nemůžeš to tree-shakovat ani znovu použít. |
| 5 | Žádný **features/** adresář pro flow logiku (meal-plan, training-plan, check-in). | Logika rozpadlá mezi screens, utils, context. |
| 6 | `types.ts` je flat dump 17 typů. Žádné groupy (`types/user.ts`, `types/plans.ts`, `types/health.ts`). | Hledání typu pomalé. |
| 7 | **Mobile nereuse web doménu**. `js/domain/nutrition.js` má 388 LOC, `mobile/src/utils/nutrition.ts` má 438 LOC. 80% overlap, ale TS verze má jiné `adjustForDay` signaturu a chybí ji `planWeeklyAdjustment`. | Drift. Bugfix v webu nezasáhne mobil. |

### Doporučená cílová struktura

```
mobile/src/
├── app/                             # navigation + global providers
│   ├── App.tsx
│   ├── navigation.tsx
│   └── providers.tsx
├── features/                        # vertical slices
│   ├── onboarding/
│   │   ├── screens/
│   │   ├── components/
│   │   └── useOnboardingFlow.ts
│   ├── dashboard/
│   │   ├── screens/HomeScreen.tsx
│   │   ├── components/MacroRing.tsx
│   │   ├── components/WeightTrend.tsx
│   │   └── useDailyAdjustment.ts
│   ├── meal-plan/
│   │   ├── screens/PlanScreen.tsx
│   │   ├── components/MealCard.tsx
│   │   └── useMealPlanGenerator.ts
│   ├── training/
│   │   ├── screens/TrainingScreen.tsx
│   │   └── useWeeklyTrainingPlan.ts
│   ├── photo-log/
│   │   └── screens/PhotoScreen.tsx
│   ├── check-in/                    # ⚠️ nový
│   │   ├── screens/WeeklyCheckInScreen.tsx
│   │   └── useWeeklyAdjustment.ts
│   └── health-sync/                 # ⚠️ nový (HealthKit)
│       └── useHealthSync.ts
├── lib/                             # ⚠️ NOVÝ — pure functions
│   ├── nutrition/                   # přesunout z utils/nutrition.ts
│   │   ├── bmr.ts
│   │   ├── macros.ts
│   │   ├── adjustForDay.ts
│   │   ├── safety.ts
│   │   └── index.ts
│   ├── training/
│   │   ├── weeklyPlan.ts
│   │   ├── progression.ts
│   │   └── index.ts
│   ├── health/
│   │   ├── HealthDataProvider.ts    # interface
│   │   ├── MockHealthDataProvider.ts
│   │   ├── ManualHealthDataProvider.ts
│   │   ├── AppleHealthProvider.ts   # expo-health-kit nebo react-native-health
│   │   └── index.ts
│   ├── ai/
│   │   ├── promptBuilders.ts
│   │   ├── responseValidators.ts
│   │   └── geminiClient.ts
│   └── dates/
├── services/                        # I/O + backend
│   ├── storage/
│   │   ├── profile.ts
│   │   ├── plans.ts
│   │   ├── foodLog.ts
│   │   ├── weights.ts
│   │   └── retention.ts             # ⚠️ retention policy
│   ├── api/
│   │   ├── client.ts                # fetch + retry
│   │   ├── meals.ts
│   │   ├── photo.ts
│   │   └── account.ts
│   └── supabase.ts
├── stores/                          # ⚠️ rozbít NutriFitContext
│   ├── profileStore.ts              # zustand
│   ├── dailyStore.ts
│   ├── trainingStore.ts
│   └── authStore.ts
├── types/                           # ⚠️ rozdělit types.ts
│   ├── user.ts
│   ├── goals.ts
│   ├── nutrition.ts
│   ├── training.ts
│   ├── health.ts
│   └── api.ts
├── ui/                              # ⚠️ rename components/
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Field.tsx
│   ├── Pill.tsx
│   ├── FadeInView.tsx
│   └── MacroRing.tsx
├── i18n/                            # ⚠️ pro budoucí en/cs
└── constants/
```

**Hraniční volba:** Monorepo s `packages/core/` (shared TS package) pro `lib/nutrition` a `lib/training` mezi web a mobile. To je doporučení v sekci 19.

---

## 3. Mobile architecture audit

### Co funguje
- ✅ Expo SDK 56 + React Native 0.85 (current jako 2026-05)
- ✅ TypeScript `strict: true` (ale viz duplikáty)
- ✅ Bottom tabs + native stack navigace (`RootNavigator.tsx`)
- ✅ Splash screen nakonfigurován (`app.json`)
- ✅ Status bar respektuje téma (App.tsx řádek 18)
- ✅ AsyncStorage persistence funguje, migration helper `runMigration()` v `storage.ts`
- ✅ Permission strings pro iOS/Android (kamera, fotky) v `app.json` — App Store ready
- ✅ Auth listener přes `supabase.auth.onAuthStateChange` v `NutriFitContext.tsx:113`
- ✅ Loading screen před `isReady` (App.tsx řádek 14)

### Co je špatně

| # | Problém | Soubor | Důsledek | Fix |
|---|---------|--------|----------|-----|
| 1 | **Duplikát `todayOptions`/`formatDelta`/`styles`** | `HomeScreen.tsx:271, 309, 314 + 356, 394, 399` | TS `strict: true` musí failovat. Pokud běží, JS bere poslední definici, takže funkční ALE legacy file. | Smaž řádky 356–431. |
| 2 | **Žádná `SafeAreaView`** | `components/Screen.tsx` | Na iPhonu s notchem (X+) header překryje notch. | Wrap `Screen` v `SafeAreaProvider` + `SafeAreaView` (`react-native-safe-area-context` už je v deps). |
| 3 | **Žádný `KeyboardAvoidingView`** v Onboardingu | `OnboardingScreen.tsx` | Klávesnice zakryje input s váhou. Uživatel nevidí, co píše. | Wrap formuláře v `KeyboardAvoidingView` s `behavior="padding"` na iOS. |
| 4 | **Žádné touch target min-size 44px** | `UI.tsx` | Apple HIG vyžaduje min 44×44 pt. Pill v Onboardingu má `paddingVertical: 9`. | Set `minHeight: 44` na Pill, Button, Pressable. |
| 5 | **AsyncStorage roste neomezeně** | `storage.ts` | `plansByDate`, `foodLogsByDate` — žádný cleanup. Po roce 365 záznamů × prům. velikost. | Retention `keep last 90 days`, smazat starší v `runMigration()`. |
| 6 | **Optimistic update bez rollback** | `NutriFitContext.tsx:166` `addFood` | `setFoodLogsByDate(next)` PŘED `saveFoodLogForDate`. Když AsyncStorage failne, state je divergentní. | Best: wrap v try/catch, na chybu rollback. |
| 7 | **Žádný network failure handling** | `api.ts:14` `postJson` | Při offline volání → `fetch threw "Network request failed"`. Uživatel vidí jen alert. | `NetInfo` z `@react-native-community/netinfo`, offline banner v `Screen.tsx`. |
| 8 | **Žádná retry exponential backoff** pro Supabase auth | `supabase.ts:13` | Auth call failuje na špatném WiFi → uživatel se neumí přihlásit. | Wrap signIn v retry helper z `api.ts:31`. |
| 9 | **Žádná cache invalidation strategy** | `NutriFitContext.tsx` | State žije v Reactu. Změna na druhém zařízení = nevidíš. | Až budeš mít backend persist, přidej `react-query` (TanStack Query). |
| 10 | **Žádný background fetch / push notifications** | — | "Zítra long run, sněz +95g sacharidů" = push má hodnotu. | `expo-notifications`, server-side scheduled push přes Expo Push API. |
| 11 | **Žádný settings screen** | — | Profil + auth jsou smíchány v `ProfileScreen.tsx`. Žádné téma, jazyk, jednotky (kg/lbs). | Rozdělit na `Profile`, `Settings`, `Account`. |
| 12 | **Account deletion smaže serverová data, ale neresetuje lokální storage úplně** | `ProfileScreen.tsx:55-66` | Po smazání zůstanou `plansByDate`, `foodLogsByDate`. Privacy concern. | `confirmDelete` musí volat `AsyncStorage.clear()` po `deleteAccount()`. |
| 13 | **`navigation.navigate('Dnes')`** používá raw string | `TrainingScreen.tsx:51`, `HomeScreen.tsx:248` | Žádný type safety. Přejmenuješ tab → app crash at runtime. | Typed routes: `RootStackParamList` + `useNavigation<NativeStackNavigationProp<RootStackParamList>>()`. |
| 14 | **`isReady` blokuje celý app** | `App.tsx:14` | Pokud `loadProfile()` v `Promise.all` selže, app navždy v Loading. | Add timeout 5s, fallback show `OnboardingScreen`. |
| 15 | **Žádný error boundary** | — | JS exception → bílá obrazovka. | `react-native-error-boundary`. |
| 16 | **Tab bar height hardcoded** `70` | `RootNavigator.tsx:26` | Na iPhonech s home indikátorem se layout posere. | Použij `useBottomTabBarHeight()` nebo nech RN default. |

---

## 4. HealthKit / Apple Health readiness audit

**Stav: nula. Příprava na HealthKit v mobile je nepřítomná.**

```
grep -rn "HealthKit\|healthkit\|expo-health\|react-native-health\|HKQuantity" mobile/
# → no results
```

### Co je nutné

1. **Volba native plugin.** Expo 56 nemá oficiální HealthKit plugin. Reálné možnosti:
   - **`react-native-health`** (RNH) — stabilní, široký coverage, ale **vyžaduje EAS prebuild** (config plugin). Drop in: `npx expo install react-native-health` + config plugin v `app.json`.
   - **`@kingstinct/react-native-healthkit`** — modernější, lepší TS support.
   - **Capacitor** — pokud byste opustili Expo, ale to nemá smysl.
   - **Vlastní config plugin** — overkill na MVP.
   
   **Doporučení:** `@kingstinct/react-native-healthkit` — má `react@19` support a TS types.

2. **EAS Build pipeline.** `expo run:ios` v `package.json` znamená, že už máte bare workflow. Musíte `eas build --platform ios` pro App Store. **Bez tohoto neexistuje cesta k HealthKitu.**

3. **Architecture pattern.** Mobile nemá ani placeholder pro `HealthDataProvider`. Web app `js/services/health-provider.js` má 316 LOC abstrakce. To se v mobile **vůbec nepoužije** v současné podobě.

### Doporučená architektura (ported do mobile)

Vytvořit `mobile/src/lib/health/`:

```typescript
// HealthDataProvider.ts (interface)
export interface HealthDataProvider {
  isAvailable(): Promise<boolean>;
  getPermissionStatus(): Promise<HealthPermissionStatus>;
  requestPermissions(types: HealthDataType[]): Promise<HealthPermissionResult>;
  getDailyActivityRange(start: Date, end: Date): Promise<DailyActivitySummary[]>;
  getWorkoutSummaries(start: Date, end: Date): Promise<WorkoutSummary[]>;
  getLatestBodyWeight(): Promise<BodyWeightSample | null>;
  getSleepSummary(start: Date, end: Date): Promise<SleepSummary[]>;
  getRestingHeartRate(date: Date): Promise<number | null>;
  getHRV(date: Date): Promise<number | null>;
}

export type HealthDataType =
  | 'steps' | 'activeEnergy' | 'basalEnergy' | 'distanceWalkingRunning'
  | 'heartRate' | 'restingHeartRate' | 'hrv' | 'bodyMass' | 'bodyFat'
  | 'sleepAnalysis' | 'workout';

export type HealthPermissionStatus = 'not_determined' | 'denied' | 'partial' | 'granted';
```

```typescript
// MockHealthDataProvider.ts — pro vývoj a uživatele bez Apple Health
export class MockHealthDataProvider implements HealthDataProvider { ... }

// ManualHealthDataProvider.ts — fallback pro Android / odepření
export class ManualHealthDataProvider implements HealthDataProvider {
  // čte z AsyncStorage manuálně zadané kroky/váhu/sessions
}

// AppleHealthProvider.ts — reálná implementace
import { initHealthKit, getStepCountSamples, ... } from '@kingstinct/react-native-healthkit';
export class AppleHealthProvider implements HealthDataProvider { ... }
```

```typescript
// factory.ts
export function createHealthDataProvider(): HealthDataProvider {
  if (Platform.OS === 'ios' && AppleHealthProvider.isSupported()) {
    return new AppleHealthProvider();
  }
  return new ManualHealthDataProvider();
}
```

### Specifické problémy

- **Permission model**: HealthKit dovoluje per-type read/write. Aplikace MUSÍ fungovat když uživatel odmítne třeba `sleepAnalysis`. Současný kód nemá nikde `hasPermissions` check.
- **Unit conversion**: HealthKit vrací kJ pro energii, někdy kcal. Kg vs. lbs. Musí být centralizováno v `lib/health/units.ts`.
- **Timezone**: HealthKit data jsou v UTC. `toDateKey()` používá local time. **Mismatch způsobí, že "včerejší kroky" v 23:30 budou pod chybným datem.** Vyžaduje wrapper.
- **Source metadata**: HealthKit data můžou pocházet z Apple Watch, Fitbit, manuálního zápisu. Některé jsou nepřesné. Doporučení: filtrovat na `device.model === 'Apple Watch'` pro tréninky.
- **Stale data**: `getLatestBodyWeight()` může vrátit 6 měsíců starý záznam. Filtrovat `daysAgo < 7`.

### Backend connectivity pro HealthKit

Až mobile začne číst HealthKit, kam to synchronizovat? **Backend nemá ani jednu z těchto tabulek:**

```sql
-- chybí v Supabase:
CREATE TABLE health_daily_summaries (...);
CREATE TABLE workouts (...);
CREATE TABLE sleep_summaries (...);
CREATE TABLE health_metrics (...);
```

Bez backendu = data jsou jen na telefonu. Když uživatel přejde z iPhone na nový iPhone, ztratí všechno. Pro health appku unacceptable.

---

## 5. Domain model audit

### Co existuje (`mobile/src/types.ts`)

```typescript
UserProfile          // ⚠️ 14 polí, mix legacy + nový model
Macros               // OK
TrainingSession      // OK
DailyAdjustment      // OK
FoodLogItem          // OK
Meal                 // OK
FoodEstimate         // derived
MealPlanValidationResult
ShoppingListGroup
DailyPlanRecord = Record<DateKey, Meal[]>
DailyFoodLogRecord = Record<DateKey, FoodLogItem[]>
DailySessionRecord = Record<DateKey, TrainingSession>
```

### Co **chybí** (porovnání s web `js/domain/types.js`)

| Typ | Web | Mobile | Důsledek |
|-----|-----|--------|----------|
| `PrimaryGoal` enum | 8 hodnot | 4 hodnoty (chybí `triathlon`, `hyrox_ocr`, `get_fit`, `sport_conditioning`) | Mobile nemůže ukázat tyhle cíle. |
| `GoalConstraints` map | ✅ exportováno | ❌ chybí | Mobile musí natvrdo `if`/`else` v `OnboardingScreen.tsx:137` |
| `WeeklyCheckIn` typedef | ✅ | ❌ | Check-in modal v ProfileScreen nemá typ. |
| `PlanAdjustment` | ✅ | ❌ | Týdenní adaptace neumí být typovaná. |
| `HealthMetric` | ✅ | ❌ | Až přijde HealthKit, není kam ukládat. |
| `DailyActivitySummary` | ✅ | ❌ | Stejně. |
| `WorkoutSummary` | ✅ | ❌ | Stejně. |
| `SleepSummary` | ✅ | ❌ | Stejně. |
| `MacroTargets` (web naming) vs. `Macros` (mobile) | Naming drift | Confused codebase. |

### Triple goal model (P0 issue)

`UserProfile` má **tři pole pro cíl**, z nichž jsou všechny použité:

```typescript
export type UserProfile = {
  ...
  gender: Gender;
  goal: Goal;                       // 'hubnutí' | 'udržení' | 'nabírání'
  primaryGoal: PrimaryGoal;         // 'lose_weight' | 'maintain_weight' | 'gain_muscle' | 'run_race'
  trainingGoal: TrainingGoalKind;   // 13 hodnot
  ...
};
```

A v `utils/nutrition.ts` jsou **3 mapping funkce**:

```typescript
function legacyGoalToDomain(goal: Goal): NutritionGoalKind        // line 365
function goalToPrimary(goal: Goal): PrimaryGoal                    // line 369
export function primaryGoalToNutritionKind(goal): NutritionGoalKind // line 373
```

Source of truth ambiguity. Když uživatel mění goal v Profilu, `ProfileScreen.tsx:73` mění **jen** `goal: 'hubnutí'`, ale `primaryGoal` zůstává staré. `calculateMacros` použije `legacyGoalToDomain(profile.goal)`. Ale `OnboardingScreen.tsx:55` mění oboje. Inconsistent updates.

### Doporučená refaktorovaná struktura

```typescript
// types/goals.ts
export type PrimaryGoal =
  | 'lose_weight' | 'maintain_weight' | 'gain_muscle'
  | 'run_race' | 'triathlon' | 'hyrox_ocr'
  | 'get_fit' | 'sport_conditioning';

export type TrainingGoalKind = '...';   // unchanged
export type NutritionGoalKind = '...';  // unchanged
export type ExperienceLevel = '...';    // unchanged

// types/user.ts
export interface UserProfile {
  id?: string;
  sex: 'male' | 'female';         // ⚠️ pryč 'muz/zena'
  ageYears: number;
  heightCm: number;
  weightKg: number;
  primaryGoal: PrimaryGoal;       // ⚠️ jediný cíl
  trainingGoal: TrainingGoalKind; // derived from primary + UX choice
  sessionsPerWeek: number;
  experience: ExperienceLevel;
  diet: DietType;
  allergies: string[];            // ⚠️ array, ne string
  dislikes: string[];
  likes: string[];
  mealCount: number;
  createdAt: string;              // ⚠️ timestamps
  updatedAt: string;
}
```

Mapování legacy → new: jednou na migration v `runMigration()`.

### Date/unit/version representation

| Téma | Současný stav | Problém |
|------|---------------|---------|
| Dates | `string` = `YYYY-MM-DD` (`toDateKey`) | OK, ale `createdAt` ve `FoodLogItem` je `Date().toISOString()` = ISO 8601 with time. Mix. |
| Units | Kalorie jako `number` (kcal), tuky/sacharidy/proteiny v gramech | OK, ale není centrální `UnitSystem` typ. Hardcoded `kg`/`cm`. Pokud chcete US trh, budete refactorovat všude. |
| Versioning plánů | `DailyPlanRecord = Record<DateKey, Meal[]>` | Žádné `planVersion`, `generatedAt`. Nelze říct "regeneruj jen oběd", ani "tady byl version 2 ze 14.5.". |
| Soft delete | Žádný | Nelze undelete profil. |
| Multi-goal | `UserProfile` má jeden `primaryGoal` | User může chtít hubnout + půlmaraton zároveň. Nelze. |

### Doporučená pole navíc

```typescript
interface MealPlan {
  id: string;
  userId: string;
  date: string;
  version: number;                  // ⚠️ NEW
  generatedAt: string;              // ⚠️ NEW
  generatedBy: 'ai' | 'manual' | 'template';
  basedOnMacros: Macros;            // ⚠️ snapshot
  basedOnSession: TrainingSession | null;
  meals: Meal[];
}
```

---

## 6. Nutrition logic audit

### Co je deterministické (`mobile/src/utils/nutrition.ts`)

| Funkce | Status | Komentář |
|--------|--------|----------|
| `calcBMR()` (řádek 336) | ✅ Mifflin-St Jeor správný | OK |
| `calcCalorieTarget()` (341) | ✅ Safety floors, max deficit 25% | OK |
| `proteinPerKg()` (356) | ✅ 2.2 / 2.0 / 1.6 / 1.6 / 1.4 | OK |
| `calculateMacros()` (43) | ✅ Returns full `Macros` | OK |
| `assessProfileSafety()` (59) | ✅ BMI < 16, > 40, age < 16 blokuje | OK, lepší než web v některých edge cases |
| `adjustForDay()` (76) | ⚠️ Funkční ale jednodušší než web | Web má separátní `restDay/trainingDay/longRunDay` se safer logic |
| `estimateSessionKcal()` (394) | ✅ MET tabulka | OK |

### Co je deterministické a co AI

- **AI počítá pouze content** (ingredience, kroky, název) — nikoli kcal/makra. `validateMealPlan` v `api.ts:51` zkontroluje, jestli AI dodržela target.
- **Tolerance je ALE 30 %** v `validateMealPlan(meals, macros, ...)` na řádku 246:
  ```typescript
  const tolerance = Math.max(350, Math.round(macros.kcal * 0.3));
  if (Math.abs(totals.kcal - macros.kcal) > tolerance) { errors.push(...); }
  ```
  **30 % tolerance znamená, že pro cíl 2000 kcal AI smí generovat 1400-2600 kcal plán.** To není deterministická validace, to je teatro. Mělo by být max 5-10 %.

### Co **chybí** v nutrition logic

| Funkce | Status | Kde má být |
|--------|--------|------------|
| `planWeeklyAdjustment(previousBaseline, goal, recentCheckIns)` | ❌ není v mobile | `lib/nutrition/weeklyAdjustment.ts` |
| `validateMealPlanMacros(meals, target)` (web má) | ❌ není v mobile (mobile má vlastní mírnější `validateMealPlan`) | port z webu |
| `validateNutritionPlanSafety()` | ❌ | Před uložením plánu zkontrolovat: žádný den < 800 kcal, žádný den > 1.5× target |
| `adjustMacrosForTrainingDay()` | částečně přes `adjustForDay()` | OK, ale jen pro 1 typ session per den |
| `endurance fueling` rules | žádné | Pro běžecké goals přidat: pre-fuel 2-4h před, refuel do 30 min |
| `validatePortionRealism()` | žádné | `300g rýže` je nereálné v 1 jídle |
| `substitution suggestions` | žádné | Když uživatel nemá ingredience, AI návrhy |

### Konkrétní pravidla, která jsou v kódu, ale nepoužívají se

- `MealPlanValidationResult.errors` se renderuje jen jako jednořádkový Alert v `api.ts:52`. Uživatel nevidí, **které** jídlo má problém.
- `assessProfileSafety` vrací `adjustedGoalKind` pro `underweight_fat_loss`, ale v UI uživatel nikdy nedostane explicitní zprávu "Tvůj cíl jsme přepnuli na udržení".

### Doporučené testy (nutritional)

```typescript
// __tests__/nutrition.bmr.test.ts
describe('calcBMR', () => {
  test('Mifflin-St Jeor pro 30/180/80 male = 1780 kcal', () => { ... });
  test('Pro female 28/165/65 = 1373 kcal', () => { ... });
});

// __tests__/nutrition.safety.test.ts
describe('safety', () => {
  test('BMI 14 vrací blocked', () => { ... });
  test('BMI 41 vrací blocked', () => { ... });
  test('Underweight + fat_loss → adjustedGoalKind = maintenance', () => { ... });
  test('Žádný den < 1500 kcal pro muže', () => { ... });
  test('Max -25% deficit z TDEE', () => { ... });
});

// __tests__/nutrition.adjustForDay.test.ts
describe('adjustForDay', () => {
  test('long_run přidá pre-fuel + refuel sacharidy', () => { ... });
  test('rest day sníží sacharidy o 10%', () => { ... });
  test('intervals přidá 60% session burn do carbs', () => { ... });
});

// __tests__/nutrition.weeklyAdjustment.test.ts (až bude funkce)
describe('planWeeklyAdjustment', () => {
  test('stagnace u fat_loss → -150 kcal', () => { ... });
  test('rychlé hubnutí > 1% BW/wk → warning + +kcal', () => { ... });
});
```

---

## 7. Training logic audit

### Současný stav (`utils/nutrition.ts:114` `buildTrainingSessionForDate`)

24 řádek, hardcoded day-of-week mapping:

```typescript
// pro běžecké goals:
if (day === 2) intervals
if (day === 4) easy_run
if (day === 6) long_run
if (sessionsPerWeek >= 4 && day === 1) easy_run
else rest
```

**Tohle je toy implementation.** Žádné:
- ❌ Týdenní objem progression (10% pravidlo)
- ❌ Deload weeks (4. týden -30%)
- ❌ Recovery logic (HR variability, sleep)
- ❌ Intensity distribution (80/20 zone 2)
- ❌ Race-specific tapering
- ❌ Beginner vs. advanced (uživatel zadá `experience: 'advanced'`, ale plán je stejný jako pro beginner)

Web `js/domain/training.js` (384 LOC) má **všechno tohle**. **Mobile to ignoruje** a má vlastních 24 LOC.

### Goals support v mobile

```typescript
// OnboardingScreen.tsx:130-152
const primaryGoals = [
  'lose_weight', 'maintain_weight', 'gain_muscle', 'run_race'
];

function trainingGoalsFor(primaryGoal):
  if 'run_race' → 5k, 10k, half_marathon, marathon
  if 'gain_muscle' → strength_basics, general_fitness
  else → general_fitness, sports_conditioning
```

**Hyrox / triathlon / OCR nejde z mobile vybrat**, i když `TrainingGoalKind` typ je obsahuje. Tedy 13 hodnot v typech, 7 v UI.

### Co je nebezpečné

1. **Marathon goal bez historie.** Uživatel vybere `marathon`, dostane plán s 90 min long-run hned první týden. **Bez zjištění "kolik km uběhneš teď", to je injury-risk recipe.**
2. **Žádný progression check.** Týden 1: 5 km. Týden 2: 7 km. Týden 3: 10 km. To je 40% jump = ITBS, shin splints.
3. **Žádné rest day pravidlo.** Pokud user zadá 6 sessions/week + marathon, dostane 6 dnů, ale algoritmus nezkontroluje minimum 1 rest day per week.
4. **Single template pro každý cíl.** "Začátečník" co chce marathon dostane stejný plán jako advanced runner. `profile.experience` se v `buildTrainingSessionForDate` nepoužívá.

### Doporučená MVP training architecture

```typescript
// lib/training/index.ts
export function createTrainingPlan(input: {
  goal: TrainingGoalKind;
  experience: ExperienceLevel;
  sessionsPerWeek: number;
  currentWeeklyVolumeKm?: number;
  weekIndex: number;
}): WeeklyTrainingPlan { ... }

// lib/training/safety.ts
export function calculateSafeWeeklyVolume(
  previousKm: number,
  weekIndex: number,
  peakKm: number
): number { ... }   // 10% rule + deload every 4th week

// lib/training/levels.ts
export function estimateFitnessLevel(profile: UserProfile, recentWorkouts: WorkoutSummary[]): ExperienceLevel { ... }
```

Pro MVP doporučuji **podmnožinu** goals:
- `walking_more` ⚠️ NEW
- `general_fitness`
- `couch_to_5k` ⚠️ NEW
- `run_5k`, `run_10k`, `half_marathon`
- `strength_basics`

**Vyhodit z UI** (zatím): `marathon`, `sprint/olympic/half/full_triathlon`, `hyrox`, `ocr`. Tyto vyžadují history input + safety floors, které ještě nejsou.

### Existing tests v `__tests__/nutrition.test.ts:200+`

Mobile má 217 řádků testů, ale **žádný test pro training planner**. Žádný test pro `buildTrainingSessionForDate`. Žádný test pro progression. Web má 27 testů pro training, mobile má 0.

---

## 8. Goal system audit

### Současná architektura

**Hardcoded v UI.** `OnboardingScreen.tsx:130-152`:

```typescript
const primaryGoals = [
  { value: 'lose_weight', label: 'Zhubnout', goal: 'hubnutí', trainingGoal: 'general_fitness' },
  { value: 'maintain_weight', label: 'Udržet váhu', goal: 'udržení', trainingGoal: 'general_fitness' },
  { value: 'gain_muscle', label: 'Nabrat svalovou hmotu', goal: 'nabírání', trainingGoal: 'strength_basics' },
  { value: 'run_race', label: 'Příprava na běžecký závod', goal: 'udržení', trainingGoal: 'run_10k' },
];

function trainingGoalsFor(primaryGoal: PrimaryGoal) {
  if (primaryGoal === 'run_race') return [...];
  if (primaryGoal === 'gain_muscle') return [...];
  return [...];   // default
}
```

### Problémy

1. **Goal data v UI komponentě** — měl by být v `lib/goals.ts` data layer.
2. **Czech `goal` label uložen na profilu** spolu s `primaryGoal` — duplikace s mapping ambiguity.
3. **Žádný `GoalConstraints`** v mobile (web ho má v `js/domain/types.js`).
4. **Impossible combinations povoleny**: `primaryGoal: 'lose_weight' + trainingGoal: 'marathon'` = uživatel se snaží zhubnout 1% BW/week + běhat marathon plán. To je injury + plateau garantované. Není check.
5. **Nelze kombinovat goals**: nelze `primaryGoal: 'lose_weight' + secondaryGoal: 'run_race'`. Reálný uživatel chce oboje.
6. **Hyrox/OCR/Triathlon goals existují v typech ale ne v UI** — uživatel je nemůže vybrat.

### Doporučená architektura

```typescript
// lib/goals/primaryGoals.ts
export const PRIMARY_GOALS: PrimaryGoalDefinition[] = [
  {
    id: 'lose_weight',
    label: { cs: 'Zhubnout', en: 'Lose weight' },
    icon: 'flame',
    nutritionMode: 'fat_loss',
    compatibleTraining: ['walking_more', 'general_fitness', 'run_5k', 'run_10k'],
    incompatibleTraining: ['marathon', 'full_ironman', 'half_ironman'],
    safetyWarnings: {
      with_marathon: 'Hubnutí během maratonské přípravy zvyšuje riziko zranění. Doporučujeme nejdřív zhubnout, pak trénovat.'
    }
  },
  ...
];

// lib/goals/constraints.ts
export function validateGoalCombination(
  primary: PrimaryGoal,
  training: TrainingGoalKind
): { allowed: boolean; warning?: string } { ... }
```

```typescript
// features/onboarding/GoalSelector.tsx
const primaries = useMemo(() => PRIMARY_GOALS.filter(g => g.enabledForVersion >= APP_VERSION), []);
```

---

## 9. AI integration audit

### Současný stav

- AI volání: `mobile/src/services/api.ts:44` `generateMealPlan` → `POST /api/generate` (Vercel proxy) → Gemini
- Prompt builder: `mobile/src/utils/mealPrompts.ts:48` (jen 48 řádků!)
- Validation: `validateMealPlan()` v `nutrition.ts:219`
- Retry: ✅ `postJsonWithRetry` s exp backoff (`api.ts:31`)
- API key: ✅ never on device, proxy přes Vercel
- Photo analysis: `analyzeFoodPhoto()` (`api.ts:58`)
- Consent: ✅ `ensureAiConsent` v `NutriFitContext.tsx:209`

### Co je dobré

- ✅ Prompt builder oddělený od UI (`mealPrompts.ts`)
- ✅ Output validation (`validateMealPlan`)
- ✅ API key na serveru, ne na klientovi
- ✅ AI consent před prvním voláním
- ✅ Retry s exponential backoff
- ✅ JSON cleaning v `parseJson` (`api.ts:84`) — strip markdown fences

### Co je špatně

| # | Problém | Soubor | Důsledek |
|---|---------|--------|----------|
| 1 | **Tolerance 30%** v `validateMealPlan` | `nutrition.ts:246` | AI smí lžít o kcal hodně. Pro 2000 kcal cíl AI generuje 1400-2600. **Není deterministická validace.** |
| 2 | **Žádná schema validace per meal** — jen sum check | `nutrition.ts:232-244` | Jednotlivé jídlo může mít kcal ≠ p×4+c×4+f×9. AI hallucines vytvoří 600 kcal jídlo s 5g protein + 200g carbs. |
| 3 | **Žádný retry pro AI parse failure** — retry je jen pro HTTP | `api.ts:31` | Pokud Gemini vrátí 200 OK s broken JSON, error propaguje uživateli okamžitě. |
| 4 | **Žádný streaming** | `api.ts:14` `postJson` | User čeká 10-30 s na celý plán. Mohl bys streamovat per-meal. Gemini má `streamGenerateContent`. |
| 5 | **Nelze regenerovat jen jeden meal** | — | Uživatel vidí "snídaně se mi nelíbí" — musí regenerovat celý den. Drahé. |
| 6 | **No fallback model** | — | Pokud Gemini je down, app je dead. |
| 7 | **Photo analysis bez confidence threshold** | `api.ts:58` | AI vrací `confidence: 'nízká'`, ale UI ji rovnou ukáže jako fact. Pojistka je jen v copy: "orientační odhad". |
| 8 | **`maxTokens` 3500 v `generate` API endpoint** (web `api/generate.js:18`) | server | Pro 6 jídel s recepty často nedostačuje. AI utne JSON → parse fail. |

### Doporučená AI architecture

```typescript
// lib/ai/promptBuilders.ts
export function buildMealPlanPrompt(input: MealPlanInput): { systemPrompt, userPrompt } { ... }
export function buildSingleMealPrompt(input: SingleMealInput): { ... }  // ⚠️ NEW
export function buildPhotoAnalysisPrompt(input: PhotoInput): { ... }

// lib/ai/responseValidators.ts
export function validateMealPlanResponse(raw: unknown, target: Macros): ValidationResult {
  // tolerance: 5% kcal, 10% protein
  // per-meal check: |kcal - (p×4+c×4+f×9)| < 10
  // ingredient quantity check
  // diet restriction violation check
}

// lib/ai/repair.ts  ⚠️ NEW
export function repairMealPlan(raw: any, validation: ValidationResult): Meal[] | null {
  // pokud chybí jen 1 meal nebo má broken kcal, fix mathematically
  // jinak return null → trigger re-generation
}

// services/api/meals.ts
export async function generateMealPlan(input): Promise<Meal[]> {
  const { systemPrompt, userPrompt } = buildMealPlanPrompt(input);
  for (let i = 0; i < 2; i++) {
    const raw = await postJsonWithRetry('/api/generate', { systemPrompt, prompt: userPrompt });
    const parsed = parseJson(raw);
    const validation = validateMealPlanResponse(parsed, input.macros);
    if (validation.valid) return validation.meals;
    const repaired = repairMealPlan(parsed, validation);
    if (repaired) return repaired;
    // retry with feedback prompt
  }
  throw new Error('AI plan invalid after retries');
}
```

---

## 10. State management audit

### Současný stav

**Single mega-context: `NutriFitContext.tsx` (290 LOC).**

Drží 9 stateů:
```typescript
profile, isReady, selectedDate, plansByDate, foodLogsByDate,
sessionsByDate, weightsByDate, user, hasAiConsent
```

Plus 4 derived useMemo:
```typescript
baselineMacros, currentMeals, currentFoodLog, currentSession, daily (macros + adjustment)
```

Plus 11 metod:
```typescript
logWeight, ensureAiConsent, setProfile, setTodaySession, resetLocalProfile,
addFood, removeFood, clearFood, setMeals, signIn, signUp, signOut
```

### Problémy

1. **Každý setter rerenderuje VŠECHNY screens.** Když přidáš jedno jídlo:
   - `setFoodLogsByDate({ ...all, [date]: next })` triggeruje re-render Contextu.
   - Všechny komponenty co volají `useNutriFit()` se re-renderují — Home, Plan, Training, Photo, History, Profile.
   - `useMemo` na `baselineMacros` rerunne, ale je rychlé. `daily` taky.
   - **Plan screen se re-renderuje při změně váhy. Trénink screen se re-renderuje při změně food log.** Nesmyslné.

2. **`isReady` blokuje celou app.** Pokud `loadProfile()` zaseknu, app je věčně v Loading.

3. **Nelze partial onboarding recovery.** Uživatel zadá pohlaví + věk, zabije app → znovu od 0. State je in-memory v `OnboardingScreen.tsx:13`.

4. **`logWeight` updates profile.weight implicitly** (řádek 204-206):
   ```typescript
   if (profile && date === selectedDate) {
     await persistProfile({ ...profile, weight });
   }
   ```
   Pokud uživatel loguje váhu pro **dnes**, tichý update profilu. Pokud loguje pro **včera**, ne. Inconsistent. Pravděpodobně bug.

5. **Žádný invalidation u backend changes.** Když auth state se změní přes `onAuthStateChange`, plány zůstávají v lokálním storage.

### Doporučená architektura

**Rozbít mega-context na 3-4 zustand stores** (`zustand` je v 2026 standard):

```typescript
// stores/profileStore.ts
interface ProfileState {
  profile: UserProfile | null;
  isLoaded: boolean;
  setProfile(p: UserProfile): Promise<void>;
  updateProfile(patch: Partial<UserProfile>): Promise<void>;
  reset(): Promise<void>;
}
export const useProfileStore = create<ProfileState>()(persist(...));

// stores/dailyStore.ts (date-bound data)
interface DailyState {
  selectedDate: string;
  plansByDate: Record<string, Meal[]>;
  foodLogsByDate: Record<string, FoodLogItem[]>;
  sessionsByDate: Record<string, TrainingSession>;
  weightsByDate: Record<string, number>;
  setSelectedDate(d: string): void;
  ...
}

// stores/authStore.ts
interface AuthState {
  user: AuthUser | null;
  hasAiConsent: boolean;
  signIn(...): Promise<void>;
  ...
}

// hooks/useDailyMacros.ts (derived)
export function useDailyMacros() {
  const profile = useProfileStore(s => s.profile);
  const session = useDailyStore(s => s.sessionsByDate[s.selectedDate]);
  return useMemo(() => profile ? calculateDailyMacros(profile, session) : null, [profile, session]);
}
```

**Výhoda zustand:** selektory zabraňují re-renderům. Změna `foodLog` nereagatuje `Trénink` screen.

### Persistence rules

| Data | Místo | Důvod |
|------|-------|-------|
| `profile` | Backend (Supabase) + AsyncStorage cache | Survives device change. |
| `weightsByDate` | Backend + AsyncStorage | Trend data, vital. |
| `plansByDate` (poslední 30 dní) | AsyncStorage | Velké JSON, není kritické. |
| `foodLogsByDate` (poslední 7 dní) | Backend + AsyncStorage | Audit trail, ale rotated. |
| `sessionsByDate` | Backend pro budoucnost | Training history. |
| `hasAiConsent` | AsyncStorage + Supabase user metadata | Compliance. |
| `tempCheckInDraft` | In-memory only | Workflow state. |

**NIKDY ne­persist:**
- Auth tokens (Supabase má bezpečný storage)
- Photo bytes (jen URI)
- API responses raw (cache je OK přes react-query)

---

## 11. Backend/API audit

### Současný stav

| Endpoint | Soubor | Komentář |
|----------|--------|----------|
| `/api/generate` | `api/generate.js` (CommonJS) | Gemini proxy. ⚠️ default model `gemini-3.5-flash` neexistuje. |
| `/api/analyze-food-photo` | `api/analyze-food-photo.js` | Photo → estimated kcal/macros |
| `/api/export-data` | `api/export-data.js` | GDPR export |
| `/api/delete-account` | `api/delete-account.js` | GDPR delete |
| `/api/subscribe`, `/api/create-checkout`, `/api/create-portal`, `/api/stripe-webhook`, `/api/delete-request` | Stripe + GDPR | OK pro web monetization |

### Co **chybí** pro mobile produkt

| Endpoint | Účel | Priorita |
|----------|------|----------|
| `POST /api/profile` | Uložit/aktualizovat profile na server | **P0** |
| `GET /api/profile` | Načíst při novém zařízení | **P0** |
| `POST /api/meal-plan` | Persist generated plan + version | P1 |
| `GET /api/meal-plan?date=...` | Načíst plán per den | P1 |
| `POST /api/food-log` | Sync food log na server | P1 |
| `POST /api/check-in` | Týdenní check-in submit + return adjustment | P1 |
| `POST /api/health-summary` | Synced from HealthKit (po MVP) | P2 |
| `POST /api/workout` | Synced from HealthKit (po MVP) | P2 |
| `POST /api/regenerate-meal` | Regenerace jednoho jídla | P2 |
| `GET /api/usage` | Quota check pre-AI call | P2 |

### Architectural koncerns

1. **Backend je CommonJS** (`api/*.js` Vercel functions), domain layer je ESM. Nelze přímo importovat `js/domain/nutrition.js` do `api/generate.js`. **Pokud chcete server-side validaci AI výstupu, musíte buď migrovat na ESM, nebo duplikovat validation logiku v backendu.**

2. **`api/_lib/store-readiness.js` má rate limit přes Supabase RPC** (`rateLimit(req, res, 'generate', 15)`). OK, ale 15 per…what? Per IP? Per user? Není dokumentováno.

3. **No request body schema validation** — endpoints jsou důvěřivé k vstupu. Pokud uživatel pošle `{ systemPrompt: <10MB string> }`, projde to Gemini.

4. **No structured error responses** — některé endpointy vrací `{ error: 'string' }`, jiné `{ error: { message: ... } }`. Klient (`api.ts:25`) řeší obě varianty: `data.error?.message || data.error`.

5. **Auth headers nejsou required** pro `/api/generate` — kdokoli s URL může poslat prompt a vyčerpat Gemini quotu. Pravděpodobně Vercel rate limit nestačí.

---

## 12. Database and persistence audit

### Současný stav (Supabase)

Z `supabase/migrations/20260526120000_store_readiness.sql` (pravděpodobně) + RLS policies. Nemám full schema dump, ale ze code base vyplývá:

| Tabulka | Co tam je | Komentář |
|---------|-----------|----------|
| `auth.users` | Supabase built-in | OK |
| `usage` nebo similar | Rate limit counters (z `store-readiness.js`) | Pravděpodobně OK |
| ??? | ??? | Žádný `user_profiles`, `meal_plans`, `food_logs`, `weights`, `health_summaries`, `workouts`, `weekly_checkins` |

**Mobile ukládá vše do AsyncStorage. Backend persist je nula.**

### Doporučené tabulky

```sql
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sex TEXT NOT NULL,
  age_years INT NOT NULL,
  height_cm INT NOT NULL,
  weight_kg NUMERIC(5,2) NOT NULL,
  primary_goal TEXT NOT NULL,
  training_goal TEXT NOT NULL,
  experience_level TEXT NOT NULL,
  sessions_per_week INT NOT NULL,
  diet TEXT,
  allergies TEXT[],
  dislikes TEXT[],
  likes TEXT[],
  meal_count INT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  version INT NOT NULL DEFAULT 1,
  generated_at TIMESTAMPTZ NOT NULL,
  generated_by TEXT NOT NULL,
  macros JSONB NOT NULL,
  meals JSONB NOT NULL,
  UNIQUE (user_id, date, version)
);

CREATE TABLE food_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  source TEXT NOT NULL,
  food_name TEXT NOT NULL,
  kcal NUMERIC(7,2),
  protein_g NUMERIC(7,2),
  carbs_g NUMERIC(7,2),
  fat_g NUMERIC(7,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE body_weights (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_kg NUMERIC(5,2) NOT NULL,
  source TEXT DEFAULT 'manual',
  PRIMARY KEY (user_id, date)
);

CREATE TABLE training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kind TEXT NOT NULL,
  title TEXT,
  duration_minutes INT,
  distance_km NUMERIC(6,2),
  intensity TEXT,
  completed_at TIMESTAMPTZ,
  source TEXT DEFAULT 'planned'
);

CREATE TABLE weekly_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  weight_kg NUMERIC(5,2),
  energy_level INT,
  hunger_level INT,
  adherence_pct NUMERIC(5,2),
  completed_sessions INT,
  notes TEXT,
  applied_adjustment JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE health_daily_summaries (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  steps INT,
  active_energy_kcal NUMERIC(7,2),
  basal_energy_kcal NUMERIC(7,2),
  exercise_minutes INT,
  stand_hours INT,
  resting_heart_rate INT,
  hrv NUMERIC(6,2),
  source TEXT,
  synced_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

CREATE TABLE workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kind TEXT NOT NULL,
  duration_minutes INT,
  distance_km NUMERIC(6,2),
  active_energy_kcal NUMERIC(7,2),
  avg_heart_rate INT,
  source TEXT,
  external_id TEXT,
  imported_at TIMESTAMPTZ DEFAULT now()
);
```

S RLS:
```sql
CREATE POLICY "Users own their data" ON meal_plans
  FOR ALL USING (auth.uid() = user_id);
-- + pro každou tabulku
```

### Migrace

Migration soubory musí být v `supabase/migrations/` (už 1 existuje). Doporučení: jedna migration per tabulka, idempotent.

---

## 13. Privacy and security audit

### Co je dobré

- ✅ Gemini API key na serveru, ne v mobile bundlu
- ✅ Supabase auth s persistSession
- ✅ AI consent gating (`ensureAiConsent`)
- ✅ Permission strings v `app.json` (kamera, fotky)
- ✅ Account deletion endpoint
- ✅ Export endpoint
- ✅ Disclaimer v `OnboardingScreen.tsx:125`

### Co je problématické

| # | Risk | Detail | Doporučení |
|---|------|--------|------------|
| 1 | **AsyncStorage je nešifrované** | Profile (věk, váha, BMI) + food log + váhy lze přečíst přes ADB nebo Xcode přístupem k device. | `expo-secure-store` pro citlivá pole, nebo `@react-native-encrypted-storage`. |
| 2 | **Žádný session timeout** | Pokud někdo ukradne telefon a má unlocked, vidí všechna data foreverafter. | Bio-auth gating (`expo-local-authentication`) před launch. |
| 3 | **Account deletion nesmaže AsyncStorage** | `ProfileScreen.tsx:61` smaže Supabase, ale ne lokální storage. | Po `deleteAccount()` zavolat `AsyncStorage.clear()`. |
| 4 | **Žádné logging redaction** | `console.warn` v `api.ts:36` může logovat profile data v dev. V prod by neměly být console.* vůbec. | Babel plugin `transform-remove-console` pro prod. |
| 5 | **Photo bytes posíláme do AI** | `analyzeFoodPhoto` posílá base64 bytes do Gemini přes proxy. Žádný transparent prompt o tom, kam to jde. | V camera screen prominent: "Fotka jde na Google AI servery k analýze." |
| 6 | **Žádný App Store privacy nutrition label** | `app.json` chybí privacy declaration | Vyplnit App Store Connect → App Privacy. |
| 7 | **Health data lze posílat do AI** v meal prompt | Pokud přidáte HealthKit, weight + HRV se může objevit v prompt textu. | **Strip health data z LLM prompts**. Jen aggregated čísla. |
| 8 | **Bundle ID `cz.nutrifit.app`** je squattable | OK pokud máte App Store Connect setup. | Reservovat ID na App Store Connect. |
| 9 | **Žádné App Tracking Transparency** | iOS vyžaduje ATT pokud používáte advertising IDs | Pokud Vercel Analytics, prověřit. |
| 10 | **Supabase publishable key v env** | OK protože je publishable, ale potvrdit | RLS policies musí být pevné. |

### App Store / Google Play readiness

| Téma | Status | Co chybí |
|------|--------|----------|
| Permission strings | ✅ kamera, fotky | Health (zatím není), location, notifications |
| Privacy policy URL | ✅ v `app.json:extra` | OK |
| Support URL | ✅ mailto: | Doporučení: vytvořit support stránku |
| Deletion URL | ✅ | Verify accessible |
| Privacy nutrition label | ❌ | App Store Connect → musí být vyplněno |
| iCloud Sign In nebo Sign In with Apple | ❌ | Pokud používáte 3rd party auth (Google), iOS vyžaduje **Sign in with Apple** also |
| Age rating | nezadáno | 12+ pravděpodobně (health data) |
| TestFlight pipeline | ❌ | Žádný EAS Build config v repo |
| `app-store-review-checklist.md` v `store-assets/` | ✅ exists | Verify content |

---

## 14. UX implementation audit

| Screen | LOC | Co funguje | Co nefunguje |
|--------|-----|------------|--------------|
| **OnboardingScreen** | 171 | 4 kroky, progress bar, validace přes `validateProfile` | Žádné back-skip, žádné partial save, ages 0 placeholder hack (`age === 0 ? '' : ...`), hardcoded primary goals (jen 4 ze 8) |
| **HomeScreen** | 431 (!) + **DUPLIKÁTY** | MacroRing, daily adjustment card, weight tracker, food log | Duplikovaný kód, `Subtitle` zobrazí raw `'hubnutí'` string, manual food entry uvnitř karty na hlavní obrazovce (busy) |
| **PlanScreen** | 261 | AI generování s nice loading messages | Žádná regenerace jednoho jídla, žádný diff "co se změnilo proti minulému plánu" |
| **TrainingScreen** | 153 | Týdenní 7-day grid s `buildTrainingSessionForDate` | Plán je hardcoded day-of-week, žádná progression visible, klepnutí na den jde na "Dnes" tab — confusing UX |
| **PhotoScreen** | 113 | Camera + gallery + permission ask | Žádný cropping, žádný confidence indicator visuálně, na velkém telefonu image je tiny |
| **HistoryScreen** | 138 | Seznam uložených plánů per datum | Žádný search, žádný filter |
| **ProfileScreen** | 284 | Plus check-in modal | Auth + profile + delete account všechno na jedné obrazovce — overload |

### Critické UX problémy

1. **Onboarding není saveable.** Krok 3 a uživatel zavře app → restart od 0.
2. **Žádná animace mezi tabs.** Default RN bottom tabs.
3. **Žádný haptic feedback** na úspěšných akcích (přidání jídla, uložení váhy).
4. **Inline forms místo modals/sheets.** Manual food entry je na HomeScreen jako karta. Mobile native pattern = bottom sheet.
5. **Žádné pull-to-refresh.** Pokud uživatel switchne dni a chce reload.
6. **Žádné swipe-to-delete** na food log items. Místo toho "Smazat" link text.
7. **`Subtitle` na HomeScreen** říká `profile.goal · profile.diet · BMI 24` — `profile.goal` je `'hubnutí'` raw string. Mělo by být formatted.
8. **Žádné loading skeleton** na HomeScreen při switche datu.
9. **No keyboard dismiss** on tap outside input. iOS default.
10. **Žádné dynamic font sizing.** Pro accessibility musí respektovat OS font size setting.

### Co by udělalo app credibilní

- **Premium polish:** loading shimmer skeletony, jemné fade-in animace (jsou tam přes `FadeInView`, ale jen v 4 místech).
- **Empty states:** všechny mají emoji ale chybí ilustrace.
- **Error states:** Alert.alert dominantní. Mobile native = inline error, ne modal.
- **Onboarding completion celebration:** žádná. Po `finish()` v Onboardingu se prostě naviguje na Main.

---

## 15. Business logic inside the product

### Co je implementováno

| Feature | Stav | Soubor |
|---------|------|--------|
| Free generování | ✅ funguje | `api.ts:44` |
| AI consent | ✅ | `NutriFitContext.tsx:209` |
| Account delete | ✅ | `api.ts:75` |
| Account export | ✅ | `api.ts:66` |
| Stripe paywall | ❌ v mobile (jen web!) | `api/create-checkout.js`, mobile nevolá |
| Trial flow | ❌ | — |
| Feature flags | ❌ | — |
| Analytics events | ❌ | — |
| Onboarding completion event | ❌ | — |

### Žádný subscription mobile

Mobile nemá kód pro Stripe checkout. iOS App Store **nedovoluje** Stripe na digital subscriptions (kromě některých edge cases). Musíte:
- **StoreKit / Google Play Billing** přes `expo-in-app-purchases` (deprecated) nebo `react-native-iap`
- Apple bere 15-30% (15% pro malé firmy, 30% jinak)
- Server-side validace receipts přes `/api/iap/validate`

**Bez tohohle nelze v mobile dělat freemium.**

### Co by mělo být premium (po MVP)

| Feature | Free | Premium |
|---------|------|---------|
| Generování meal planů | 3/měsíc | Unlimited |
| Tréninkový plán | Just current week | Příští 4 týdny + adaptace |
| Photo analysis | 5/měsíc | Unlimited |
| HealthKit sync | ✅ vždy | n/a |
| Historie planů | 7 dní | Forever |
| Export PDF | ❌ | ✅ |
| Týdenní check-in | ✅ | ✅ |
| Adaptive adjustment | ✅ | + multi-week trend analytics |

### Co potřebujete naimplementovat před monetizací

1. **`/api/usage` endpoint** → vrací `{ mealPlansThisMonth, photoAnalysisThisMonth, isPremium }`
2. **`useUsageQuota` hook** v mobile → blokuje akci pokud nad limit
3. **`PaywallScreen`** → trigger when blocked
4. **IAP integration** (`react-native-iap`)
5. **Server-side receipt validation** v `/api/iap/validate`
6. **`subscription_status` tabulka** v Supabase

---

## 16. Testing audit

### Současný stav

| Test file | LOC | Coverage |
|-----------|-----|----------|
| `__tests__/nutrition.test.ts` | 217 | BMR, macros, safety, adjustForDay, normalizeFoodEstimate, validation |
| `__tests__/storage.test.ts` | 148 | AsyncStorage save/load, migration |

**Vitest jako runner.** OK pro pure functions, ale RN testy nejsou.

### Co chybí

| Test | Priorita | Důvod |
|------|----------|-------|
| **Component testy (RN Testing Library)** | P0 | OnboardingScreen flow, HomeScreen render, PlanScreen loading state |
| **`buildTrainingSessionForDate` tests** | P0 | Per-day mapping pro každý goal |
| **`primaryGoalToNutritionKind` tests** | P1 | Není testováno |
| **`assessProfileSafety` extreme inputs** | P0 | BMI 14, 16, 25, 40, 41 — boundary testy |
| **AI response validation tests** | P1 | Mock AI response, test repair logic |
| **HealthDataProvider mock test** | P1 | Až bude HealthDataProvider, mock musí být validní |
| **Onboarding partial recovery test** | P1 | Save state on backgrounding |
| **Weekly check-in adjustment test** | P1 | Až bude `planWeeklyAdjustment` |
| **E2E test (Detox)** | P2 | Full happy path: onboarding → generate → log meal |
| **Navigation type safety test** | P2 | `navigation.navigate('Dnes')` typed |

### Doporučená setup

```bash
npm install --save-dev @testing-library/react-native @testing-library/jest-native
npm install --save-dev detox  # E2E
```

```typescript
// __tests__/screens/OnboardingScreen.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
describe('OnboardingScreen', () => {
  test('blokuje pokračování bez výběru cíle', () => { ... });
  test('validace věk < 16 vrací error', () => { ... });
  test('finish() ukládá profile přes setProfile', () => { ... });
});
```

---

## 17. Performance audit

| Téma | Status | Důsledek |
|------|--------|----------|
| Bundle size | Neměřeno | Expo + RN + Supabase + 7 deps = ~30MB IPA. Acceptable. |
| Re-renders | ⚠️ Mega-context | Každý setter rerenderuje vše. |
| Heavy AI calls | ⚠️ Synchronní 10-30s | Žádný streaming. |
| Heavy calculations | None v render | `calculateMacros` v useMemo. OK. |
| Image optimization | ❌ Photo se posílá full size base64 | Resize na 1024px before upload. |
| Caching | ❌ Žádné HTTP cache | react-query při backendu. |
| API latency | Backend response ~5-30s pro Gemini | Acceptable s loading UI. |
| Skeleton/loading | ✅ na PlanScreen | OK. |
| Background jobs | Žádné | OK pro MVP. |
| Animation perf | `FadeInView` použit málokrát | OK. |

### Konkrétní fixes

1. **Photo resize před upload** (`expo-image-manipulator`):
   ```typescript
   const resized = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], { compress: 0.7 });
   ```
2. **Memoize `getLast7DaysWeights()`** v HomeScreen.
3. **Lazy load Photo screen** (rare use case, expensive permission).

---

## 18. Refactor priority list

| Prio | Oblast | Problém | Důkaz | Proč to vadí | Fix | Difficulty | Impact |
|------|--------|---------|-------|-------------|-----|-----------|--------|
| **P0** | Code quality | Duplikované deklarace v HomeScreen | `HomeScreen.tsx:271+356, 309+394, 314+399` | TS strict by mělo failovat. Code nereadable. | Smazat řádky 356-431 | Low | High |
| **P0** | Domain duplication | Web a mobile drift | `js/domain/nutrition.js` ≠ `mobile/src/utils/nutrition.ts` | Bugfix v webu nezasáhne mobile a naopak | Monorepo s `packages/core` nebo `npm link` | High | High |
| **P0** | Backend persist | Plány/váhy jen na device | `services/storage.ts` | Ztratíte data při změně telefonu | Supabase tabulky + sync | High | Critical |
| **P0** | Goal model | Triple goal source of truth | `types.ts:11-14`, `nutrition.ts:365-378` | Bugy v UI při změně goalu | Single `primaryGoal`, migration | Medium | High |
| **P0** | Training logic | Hardcoded 24-LOC planner | `nutrition.ts:114` | Generuje injury-risk plány | Import doménu z web nebo přepsat | High | High |
| **P1** | HealthDataProvider | Žádná abstrakce v mobile | Žádný soubor | Bez toho HealthKit = greenfield | Vytvořit `lib/health/` interface + Mock + Manual | Medium | High |
| **P1** | State management | Mega-context | `NutriFitContext.tsx` 290 LOC | Re-render storm | Zustand 3-4 stores | Medium | Medium |
| **P1** | Validation tolerance | 30% kcal toleration | `nutrition.ts:246` | AI lhaní | Tolerance 5%, per-meal check | Low | Medium |
| **P1** | Safe area | Žádné `SafeAreaView` | `Screen.tsx` | iPhone notch | `react-native-safe-area-context` | Low | Medium |
| **P1** | Onboarding recovery | In-memory only | `OnboardingScreen.tsx:13` | Restart od 0 | AsyncStorage draft persistence | Low | Medium |
| **P1** | Account delete | Nesmaže AsyncStorage | `ProfileScreen.tsx:61` | Privacy compliance | `AsyncStorage.clear()` po `deleteAccount()` | Low | High |
| **P1** | Storage retention | Žádný cleanup | `storage.ts` | Roste donekonečna | Keep last 90 days | Low | Medium |
| **P2** | Goal constraints | Hyrox/triathlon v typech ne v UI | `types.ts:5` vs. `OnboardingScreen.tsx:130` | Inconsistency, dead types | Buď přidat do UI, nebo smazat z typů | Low | Low |
| **P2** | AI streaming | Synchronous 10-30s | `api.ts:14` | Slow UX | `streamGenerateContent` | Medium | Medium |
| **P2** | Single meal regenerate | Whole-plan only | — | Drahé API + UX | Add `/api/regenerate-meal` | Medium | High |
| **P2** | Push notifications | Žádné | — | "Tomorrow long run" coaching | `expo-notifications` + server | Medium | High |
| **P2** | Settings screen | Vše v Profile | `ProfileScreen.tsx` | UX clarity | Rozdělit na 3 screens | Low | Low |
| **P3** | E2E tests | None | — | Catch regression | Detox setup | High | Medium |
| **P3** | Bio-auth | Žádné | — | Privacy | `expo-local-authentication` | Low | Low |
| **P3** | i18n | Czech-only | — | International | `expo-localization` + i18next | Medium | Low |

---

## 19. Recommended target architecture

**Doporučení: ANO, potřebujete komplexní refactor.**

Toto je technický verdict, ne marketing. Vaše argumenty pro refactor:

1. **HomeScreen.tsx je broken.** Duplikované kód říká: code review nikdy neprošlo nebo TS errors jsou suppressed.
2. **Web a mobile mají duplicate doménu.** Za 6 měsíců to bude problém ze kterého nevylezete.
3. **Žádný backend persist.** Před přidáním HealthKitu nelze fungovat — kam s daty?
4. **Žádná HealthDataProvider abstrakce v mobile.** Před HealthKitem to musí být.

**Rozumný refactor:** 2-3 týdny soustředěné práce, pak teprve nové features.

### Phase A: Monorepo + shared domain (3-5 dnů)

```
nutriplan/
├── packages/
│   ├── core/                        # ⚠️ NEW shared TS package
│   │   ├── src/
│   │   │   ├── nutrition/
│   │   │   ├── training/
│   │   │   ├── goals/
│   │   │   ├── health/
│   │   │   ├── ai/
│   │   │   ├── validation/
│   │   │   └── types/
│   │   ├── package.json (name: "@nutriplan/core")
│   │   └── tsconfig.json
│   ├── mobile/                      # přesun z root /mobile
│   │   └── package.json (depends @nutriplan/core)
│   └── web/                         # přesun z root /js
│       └── package.json (depends @nutriplan/core)
├── apps/
│   └── api/                         # přesun z /api
│       └── package.json (depends @nutriplan/core)
├── supabase/                        # migrations
└── pnpm-workspace.yaml              # pnpm preferred for monorepo
```

Nástroj: `pnpm` + `turbo` pro caching. Anebo `nx`.

### Phase B: Mobile struktura (2 dny)

```
packages/mobile/src/
├── app/
│   ├── App.tsx
│   ├── providers.tsx
│   └── navigation.tsx
├── features/
│   ├── onboarding/
│   ├── dashboard/
│   ├── meal-plan/
│   ├── training/
│   ├── photo-log/
│   ├── check-in/
│   ├── health-sync/                 # NEW
│   ├── account/                     # NEW (auth + profile + delete)
│   └── paywall/                     # NEW
├── stores/                          # zustand
│   ├── profileStore.ts
│   ├── dailyStore.ts
│   ├── authStore.ts
│   └── premiumStore.ts
├── services/
│   ├── api/
│   ├── storage/
│   ├── supabase.ts
│   └── push.ts                      # NEW
├── ui/                              # design system
└── i18n/                            # NEW
```

### Phase C: Backend persist (5-7 dnů)

- Supabase tabulky + RLS
- Sync hooks v mobile (`useProfileSync`, `usePlanSync`)
- Conflict resolution (last-write-wins pro MVP)

### Phase D: HealthDataProvider (3-5 dnů)

- `@kingstinct/react-native-healthkit` install
- EAS Build setup
- 3 implementace (Apple, Mock, Manual)
- Permission flow UI

---

## 20. Implementation roadmap

### Phase 1 — Stabilize codebase (3 dny)

**Cíl:** Build clean, no duplicates, TS strict pass.

| Den | Tasks | Files | Výstup |
|-----|-------|-------|--------|
| 1 | Smaž duplikáty v HomeScreen, projeď `tsc --noEmit`, opravu všech errors | `mobile/src/screens/HomeScreen.tsx` | `npm run typecheck` clean |
| 1 | Smaž `mobile/node_modules` z git | `.gitignore`, repo cleanup | Repo lehčí o 200MB |
| 2 | Sjednoť goal model: smaž `goal: 'hubnutí'`, jediný `primaryGoal`, migration | `types.ts`, `nutrition.ts`, `OnboardingScreen.tsx`, `ProfileScreen.tsx`, `HomeScreen.tsx` | Single source of truth |
| 2 | Storage retention policy (90 dní) | `storage.ts:runMigration` | Cleanup |
| 3 | Account deletion smaže AsyncStorage | `ProfileScreen.tsx`, `storage.ts` | Privacy compliance |
| 3 | Validation tolerance 30% → 7% | `nutrition.ts:246` | Real AI guardrails |

**Tests added:** safety boundary, goal migration, validation tolerance

### Phase 2 — Domain layer extraction (5 dnů)

**Cíl:** Monorepo s `@nutriplan/core` shared package.

| Den | Tasks |
|-----|-------|
| 1 | `pnpm` workspace setup, `packages/core/` skeleton, `tsconfig` refs |
| 2 | Přesun `js/domain/*` + `mobile/src/utils/nutrition.ts` → `packages/core/src/` |
| 3 | Refactor importů ve web app i mobile na `@nutriplan/core` |
| 4 | Add tests pro full domain coverage (BMR, macros, safety, training, validation) |
| 5 | CI: GitHub Actions s `pnpm run test` + `pnpm run typecheck` |

**Tests added:** 70+ existing tests stále zelené, +20 new pro mobile-specific

### Phase 3 — Backend persistence (5 dnů)

**Cíl:** Profile + plans + logs synced do Supabase.

| Den | Tasks |
|-----|-------|
| 1 | Schema design + migration files (7 tabulek, RLS policies) |
| 2 | `apps/api/` endpoints: `/profile`, `/meal-plan`, `/food-log`, `/weight` |
| 3 | `mobile/src/services/api/` clients + Zod schemas |
| 4 | `useProfileSync`, `usePlanSync` hooks s react-query |
| 5 | Conflict resolution UI (override / merge) |

**Tests added:** API endpoint tests (Vitest + supertest), RLS policy tests

### Phase 4 — Health data abstraction (5 dnů)

**Cíl:** Solid HealthDataProvider, Mock + Manual + Apple ready.

| Den | Tasks |
|-----|-------|
| 1 | `packages/core/src/health/` interface, types, factory |
| 2 | `MockHealthDataProvider`, `ManualHealthDataProvider` implementations |
| 3 | EAS Build setup, `@kingstinct/react-native-healthkit` install |
| 4 | `AppleHealthProvider` implementation, permission flow UI |
| 5 | `useDailySteps`, `useLatestWeight`, `useSleepLastNight` hooks |

**Tests added:** Mock tests (deterministic seeded), permission denial fallback

### Phase 5 — AI hardening (3 dny)

| Den | Tasks |
|-----|-------|
| 1 | `packages/core/src/ai/promptBuilders` + `validators` + `repair` |
| 2 | Per-meal kcal check, ingredient quantity check |
| 3 | Single meal regenerate endpoint + UI |

### Phase 6 — Dashboard / Check-in (3 dny)

| Den | Tasks |
|-----|-------|
| 1 | Weekly check-in flow (UI + API + adjustment) |
| 2 | Multi-week trend chart |
| 3 | "Adaptive coach" daily message generation |

### Phase 7 — Polish + Premium (5 dnů)

| Den | Tasks |
|-----|-------|
| 1 | Push notifications setup |
| 2 | IAP integration |
| 3 | Paywall screen + usage hooks |
| 4 | Settings screen, bio-auth |
| 5 | App Store screenshots + privacy nutrition labels |

---

## 21. Final verdict

### Nejhorší code smell
**Duplikované deklarace v `HomeScreen.tsx`.** S TS strict to nesmí kompilovat. Buď je build broken, nebo skip-errors. Před čímkoli dalším smazat řádky 356-431.

### Nejhorší missing architecture piece
**Žádný backend persist pro user data.** Plány, váhy, food log žijí jen v AsyncStorage. **Bez tohohle není mobile health app.** Změna telefonu = ztráta všech dat. Před HealthKitem to musíte mít.

### Největší mobile-app risk
**Žádný safe area handling + duplicate code v HomeScreen.** Build pravděpodobně neproběhne na CI. Při releasu by se ukázalo.

### Největší HealthKit risk
**Žádný `HealthDataProvider` interface v mobile.** Až přidáte `react-native-health`, budete musíte celý abstraction layer napsat. To je 3-5 dnů práce navíc.

### Největší business-logic gap
**Žádné `weekly_checkins` ani `plan_adjustments` tabulky.** Adaptive coaching = core value proposition produktu. Bez perzistence týdenních check-inů to není adaptive.

### Jedna věc, kterou postavit jako další
**Phase 2: Monorepo s `@nutriplan/core`.** Tím vyřešíte 3 problémy najednou:
1. Duplicate domain mezi web/mobile
2. Server-side validace AI bude moci importovat stejnou logiku
3. Mobile bude mít všech 13 training goals + GoalConstraints + planWeeklyAdjustment, ne svou redukovanou verzi

### Jedna věc, kterou smazat / zjednodušit
**Mobile-side training logic v `nutrition.ts:114`.** 24 řádků s hardcoded day-of-week. Smaž, přesuň generování plánu na backend (`/api/training-plan?date=...`), který importuje `@nutriplan/core/training`.

### Jedna věc, která by mobile udělala 10× reálnější
**Daily adaptive coaching push notification.** Ráno 7:00: "Dnes long run 16 km. Připrav si pre-fuel — 80 g sacharidů 2-3h před během. Po běhu refuel 60 g sacharidů + 20 g protein během 30 min." Tohle volá `adjustForDay`, je to **jedno scheduled notification per den**, a okamžitě to dělá z appky **coach místo loggeru**.

Bez tohoto je to MyFitnessPal s češtinou. S tímhle je to **něco co MyFitnessPal nemá**.

---

## TLDR

1. **NE pokračovat ve features dokud:**
   - HomeScreen duplikáty smazány (P0, 1 hodina)
   - TS strict pass na celém kódu (P0, 1 den)
   - Goal model sjednocen (P0, 1 den)

2. **Před HealthKitem POSTAVIT:**
   - Backend persist (Supabase tabulky, sync hooks) — 5 dnů
   - HealthDataProvider abstrakci v mobile — 3 dny
   - Pak teprve `react-native-healthkit` integraci

3. **Refactor doporučuji v tomto pořadí:**
   - Phase 1 (stabilize) → Phase 2 (monorepo) → Phase 3 (backend) → Phase 4 (health) → Phase 5+ (features)

4. **2-3 týdny soustředěné práce.** Pak teprve nové features. Bez toho stavíte na pohyblivém písku.
