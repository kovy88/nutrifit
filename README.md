# NutriPlan

NutriPlan je interaktivní webová aplikace pro výpočet denních maker, generování jídelníčku na míru a zápis reálného jídla z fotky. Uživatel zadá základní údaje, aplikace spočítá denní rozpočet maker, AI navrhne recepty a multimodální analýza fotky umí přičíst snědené jídlo do dnešního příjmu.

## Splnění zadání

- Vlastní uživatelské rozhraní: responzivní dashboard se dvěma hlavními workflow: **Naplánovat den** a **Zapsat jídlo fotkou**.
- Strukturovaný výstup / function calling princip: Gemini vrací validní JSON pro jídelníčky, výměnu jídel i odhad maker z fotky, který se dá bezpečně parsovat a normalizovat.
- Více LLM volání / kontext: aplikace používá odlišné role a prompty pro vygenerování celého jídelníčku, výměnu konkrétního jídla a analýzu fotky.
- Další datový zdroj a paměť: profil, historie jídelníčků, generační limity a premium stav jsou ukládané v Supabase; denní příjem z fotek se ukládá lokálně pro aktuální den.
- Multimodalita: uživatel nahraje fotku jídla, Gemini Vision odhadne porci, kalorie a makra a uživatel výsledek potvrdí do denního rozpočtu.

## Demo průchod

1. Otevři aplikaci a bez přihlášení vyplň věk, výšku a váhu.
2. Klikni na **Spočítat makra**.
3. Doplň preference jídla, styl stravování a počet jídel.
4. V dashboardu zkontroluj sekci **Dnešní příjem** se zbývajícími kaloriemi a makry.
5. V části **Naplánovat den** doplň preference a klikni na **Vygenerovat jídelníček**.
6. Klikni na recept pro detail, případně použij **Vyměnit jídlo**.
7. V části **Zapsat jídlo fotkou** nahraj obrázek, spusť analýzu a klikni na **Přidat do dne**. Denní zůstatek maker se okamžitě přepočítá.

## Poznámky k lokálnímu testování

- Lokálně přes statický server funguje UI, výpočet maker, preview uploadu a klientský denní log.
- AI endpointy `/api/generate` a `/api/analyze-food-photo` jsou Vercel serverless funkce a pro plné otestování vyžadují Vercel/dev prostředí s `GEMINI_API_KEY`.
- Google přihlášení může na `localhost` hlásit chybu originu, pokud localhost není přidaný v Google OAuth konfiguraci. Produkční doména tím není dotčená.

## Technologie

- Frontend: HTML, CSS, vanilla JavaScript moduly
- AI: Gemini přes Vercel serverless proxy
- Multimodalita: Gemini Vision přes `/api/analyze-food-photo`
- Databáze a autentizace: Supabase
- Platby / premium: Stripe
- Deployment: Vercel

## Architektura (adaptivní v2)

Aplikace se posouvá od kalkulačky maker k adaptivnímu nutričnímu a
tréninkovému plánovači. Detail najdeš v [ARCHITECTURE.md](ARCHITECTURE.md).

- `js/domain/` — deterministické jádro (BMR/TDEE/makra, denní a týdenní
  úpravy, generátor tréninkového plánu pro 5k–maraton, sílu, kondici).
  Žádný DOM, žádné side-efekty.
- `js/services/` — orchestrační vrstva: `NutritionPlanService`,
  `TrainingPlanService`, `AIPlanService` (prompt builder + validátor),
  `HealthDataProvider` (Mock / Manual / Apple Health placeholder).
- `js/calculator.js` a další UI moduly delegují matematiku na doménu.

### Bezpečnost a privacy

- App není zdravotnická rada. Cíle a recepty jsou obecné vodítko.
- Hubnutí je tvrdě limitované: max 1 % tělesné hmotnosti / týden,
  minimum 1500 kcal (M) / 1200 kcal (Ž).
- Tréninkový objem roste max o 10 % / týden, deload každý 4. týden.
- Při nízkém spánku či poklesu HRV se kvalitní session vymění za easy běh.

### Apple Health

Web build NEPŘEDSTÍRÁ HealthKit data. `AppleHealthProvider` je placeholder
s `TODO(ios)` značkami a deleguje na MockHealthDataProvider. Reálné napojení
přijde s iOS buildem (Expo shell v `mobile/` + react-native-health nebo
nativní HealthKit bridge). Plánované typy: `stepCount`, `activeEnergyBurned`,
`basalEnergyBurned`, `distanceWalkingRunning`, `heartRate`,
`restingHeartRate`, `heartRateVariabilitySDNN`, `bodyMass` a `HKWorkoutType`.

## Testy

```bash
npm test
```

Spouští `tests/run.js` (zero-dep ES module runner) nad všemi `tests/*.test.js`.
Aktuálně 47 testů pro nutrition, training, health-provider a AI validátor.
