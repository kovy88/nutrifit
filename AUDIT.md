# NutriPlan — Brutální Audit

Stav: branch `refactor/nutriplan-adaptive-v2`, 5577 LOC v `js/`, 70 testů.
Datum: 2026-05-27.

---

## 1. Executive verdict

Tohle je **rozpůlený produkt**. Navenek je to slušně vypadající "AI jídelníček v češtině" s placenou bránou, fotografií jídla a Supabase auth. Pod tím leží **paralelní svět** — adaptive nutrition + training domain layer (5 souborů, 70 testů, hyrox/triathlon/ironman), který **není zapojený do reálného flow**. `js/recipes.js` (produkční generování) volá Gemini přímo svým vlastním promptem a vůbec netuší, že existuje [`buildAIPlanPrompt`](js/services/ai-plan-service.js). `js/services/training-plan-service.js` nemá v UI ani jediný button. Wizard, co jsem teď postavil, ukládá `trainingGoal` do localStorage, ale **žádná část appky ho nečte**.

**Největší problém:** appka tvrdí "jídelníček za minutu bez vážení a bez databází", ale onboarding chce přesně věk/výšku/váhu a jediný výstup je 1denní plán z AI. Není to deník (jen log na 1 den), není to plánovač (max 1 den, žádná regenerace části), není to coach (žádný feedback loop). Je to **lepší prompt engineering jednoho průchodu**.

**Největší příležitost:** ten domain layer je upřímně dobrý. Kdyby se nasměroval do reálného produktového úhlu ("adaptivní týdenní plán + check-in"), bylo by to **odlišení od ChatGPT a MyFitnessPalu zároveň**. Žádná velká appka neumí "v pondělí ti řekne, kolik dnes jíst podle včerejšího tréninku + váhového trendu" v češtině. To je niche.

**Apple Health směr:** Z webové appky **nikdy**. Jediný způsob je nativní iOS shell (React Native / Capacitor / Swift) nebo manuální import. V `mobile/` je scaffold expo appky, ale je prázdný. Buď to akceptovat a vyrobit web-only s manuálním zápisem váhy + tréninků, **nebo** udělat tah na iOS a tam ten HealthKit drop-in postavit. Nedělat oboje napůl.

**Verdict: silný demo, slabý produkt.** Asi 60 % cesty k credible MVP, ale 90 % current effort je v "prompting + Stripe", místo v retenci a hodnotě.

---

## 2. Product clarity audit

| Otázka | Realita |
|--------|---------|
| Cílový uživatel? | **Nejasný.** Hero říká "AI · česky · zdarma" — to je akviziční slogan, ne persona. Je to pro hubnoucího začátečníka? Pro běžce? Pro sportovce? UI zvládá vše, takže nic. |
| Core promise? | "Jídelníček na míru za minutu, bez vážení, bez databází." Ale onboarding **požaduje přesné vážení** (vahá v kg, BMR výpočet). To je dissonance. |
| Use case do 10 s? | Ne. Vstoupíš → vidíš hero → musíš vyplnit 6 polí → klikneš → dostaneš plán. To je 60 s minimum. |
| Proč ne ChatGPT? | Asi jediný argument = čeština + nákupní seznam z Billa/Albert/Kaufland/Lidl. Jinak slabší než ChatGPT pro tu samou cenu. |
| Proč ne MyFitnessPal? | MFP umí logging + databázi 14M jídel. Vy umíte AI generování. To je doplňková služba, ne nahrazení. |
| Proč ne Cronometer? | Stejně. Cronometer má 84 mikronutrientů. Vy nemáte ani fiber konzistentně. |
| Focus? | **Trying to do too much.** Mám tu: meal generation, food photo analysis, food log, water tracking, weight tracking, day planner s denními aktivitami, shopping list, PDF export, Stripe paywall, share toolbar, dark mode, GDPR delete, Apple Health roadmap, hyrox tréninkový plán. To je **5 různých produktů**. |

**Positioning, který by mohl být silný:**
> "Pondělní plán, který se v úterý sám upraví. Pro běžce, hyrox a triatlonisty co nesnášejí váhy. Češtinu rozumíme."

To eliminuje 90 % konkurence (MFP/Cronometer = data appy, ne plán appy; Strava/Garmin = train data, ne nutrition). To je niche.

---

## 3. User journey audit

### Landing page (`index.html` hero @ line 178)
- ✅ Hero je vizuálně OK, "AI · česky · zdarma" je jasný hook
- ❌ Žádný social proof, žádný screenshot výstupu, žádný "before/after"
- ❌ "Bez databází" je marketing — appka **má** databáze (Supabase)
- ❌ Žádný demo bez registrace — uživatel musí vyplnit profil dřív, než vidí cokoli hodnotného

### Onboarding (`index.html` steps-row @ line 109)
- Před touhle session: 2 karty + button = "vyplň 6 polí a klikni"
- Po wizardu (co jsme dnes postavili): **2 paralelní onboarding flow** — nový wizard pro first-run + starý formulář pro returning. To je matoucí. Wizard by měl **nahradit** starý formulář, ne ho jen překrývat.
- ❌ Wizard má 4 kroky, starý formulář má 3 kroky. Step dots ukazují 1-2-3 (starý), ne 1-2-3-4 (wizard). Vizuální inkonzistence.
- ❌ Wizard ukládá `primaryGoal` a `trainingGoal` do localStorage, ale **nikde se to nečte**. Dead state.

### Profile setup (`js/profile.js`)
- ✅ Existuje profile modal s persistencí do Supabase
- ❌ Profil řeší 5 různých polí (gender, goal, height, weight, dislikes), ale neřeší: rasu/etnicitu (pro BMR korekci), zdravotní stav (cukrovka, štítná žláza, IBD), těhotenství, kojení, dietní restrikce nad rámec "vegan/keto/bezlepkový"
- ❌ Žádný "edit and recalculate" — když si uživatel přidá kg, plán se sám nepřepočítá

### Meal generation (`js/recipes.js:66`)
- ✅ Strukturovaný prompt s pravidly diversity, makro check, ingredient level
- ❌ Generuje **jeden den**. Není to týdenní plán. To je největší slabina vs. konkurence.
- ❌ Když AI selže (parse error, time-out, nesedí makra), uživatel dostane "Zkus to znovu" tlačítko. Žádný fallback plán.
- ❌ Regenerace celého plánu, ne části. Nelze říct "tohle jedno jídlo vyměň".
  *(Wait — alternativa existuje: `js/recipes.js:213` má `suggestAlternative`. Ale je to skryté v modalu, ne v hlavním flow.)*
- ❌ AI prompt používá Czech goal string `goal=${appState.macros.goal}` — kde `goal` je `'hubnutí'/'udržení'/'nabírání'`. To je raw user input v promptu — možná OK, ale fragilní.
- ❌ **Model `gemini-3.5-flash`** v `api/generate.js:24` — **tenhle model neexistuje**. Reálné Gemini modely jsou `gemini-1.5-flash`, `gemini-2.5-flash`, `gemini-2.0-flash`. Pokud env override `GEMINI_MODEL` chybí, **appka se rozbije v produkci**.

### Plan display (`index.html` data-app-panel="plan" @ line 381)
- ✅ Pěkná tabulka s recepty + ingredience + steps
- ❌ "Plan" tab = jeden den, ne týden. Když pak v "Today" se ukáže ten samý den, je to redundance.
- ❌ Žádné kalendářní view ("příští pondělí budeš mít X")
- ❌ Žádné porovnání plán vs. realita

### Check-in / Progress (`data-app-panel="progress"` @ line 557)
- ✅ Existuje weight tracking, streak counter, weekly chart
- ❌ Žádný **týdenní check-in** ve smyslu "energie/hlad/adherence" jak požaduje `WeeklyCheckIn` typ
- ❌ `js/domain/nutrition.js:282` má `planWeeklyAdjustment` — krásná funkce, **nikde nevolaná**

### Dashboard ("Today" tab @ line 247)
- ✅ Macros card s circular progress, water tracking
- ❌ Nezobrazuje **adjustment for today's training**. Funkce `adjustForDay()` je v doméně, není volaná.
- ❌ Žádný daily coaching message ("dneska máš long run, jez +60g sacharidů")

---

## 4. Nutrition logic audit

| Co je v doméně | Co se reálně používá v UI |
|----------------|---------------------------|
| `calcBMR` (Mifflin-St Jeor) | ✅ Volá ho `calculator.js:94` |
| `calcTDEE` | ✅ |
| `calcMacroTargets` (kompletní, s safety floors) | ✅ Přes `calcMacroTargets` |
| `adjustForDay` (rest/training/long_run úprava) | ❌ **Nepoužívá se nikde** |
| `planWeeklyAdjustment` (váhový trend → kcal delta) | ❌ **Nepoužívá se nikde** |
| `validateMealPlanMacros` (kontrola AI výstupu) | ❌ Production `recipes.js` má vlastní `fixMacros` (line 41), nepoužívá doménový validátor |
| SAFETY constants (min 1200/1500, max 25% deficit) | ✅ V `calcMacroTargets` |

**Co funguje:** baseline BMR/TDEE/macro výpočet je správný a má testy.

**Co chybí kriticky:**
1. **Adjust for today's training is dead code.** Doména to umí, UI to ignoruje.
2. **Weekly adjustment is dead code.** Klíč k retenci ("v týdnu 2 ti přidáme 150 kcal protože váha stagnuje") — implementováno, nezapojené.
3. **Žádná substituce ingrediencí** — pokud uživatel nemá v lednici lososy, není fallback
4. **Žádný safety check pro těhotné/kojící/diabetiky** — kdokoli z nich může dostat 1500 kcal plán
5. **Žádné dietary restrictions beyond strings.** `dislikes` jde jako prompt text, není to enum nebo validovaná struktura
6. **Žádný micronutrient awareness** — protein/carbs/fat is it. Fiber je v promptu, ale není v `MacroTargets` výstupu prominentně.
7. **Žádný hydration model** — `calcWaterGoal` je v `js/main.js:236`, ale neaktualizuje se podle tréninku
8. **Žádný refeed/diet break model** pro long-term hubnutí
9. **Žádný TEF (thermic effect of food)** v TDEE výpočtu — minorit, ale pro serious users to chybí
10. **Žádné porovnání "naplánováno vs. snědeno"** — to je core feature trackeru

---

## 5. Training logic audit

**Bottom line: training je 95 % dead code.**

- ✅ `js/domain/training.js` má 384 LOC, generuje plány pro 13 cílů včetně hyrox/triathlon/OCR/ironman
- ✅ 27 testů pokrývá kreace plánů, readiness signály, deload logiku
- ❌ **V `index.html` nikde není UI pro training plan**
- ❌ `js/services/training-plan-service.js` se nikdy nezavolá
- ❌ Wizard ukládá `nutriplan-training-goal` do localStorage. Nikdo to nečte.
- ❌ Žádná integrace s nutrition (long_run day → carb load v plánu)
- ❌ Žádné progress tracking proti plánu ("měl jsi 6 km, uběhl jsi 5")
- ❌ Žádný Strava / Garmin import (a v webu ani nepůjde bez nativní vrstvy)

**Co je vlastně otázka:** chce uživatel od nutrition appky training plán? Většinou ne. Chce v jedné appce vidět **jak trénink ovlivňuje jeho jídlo**. To je správný směr a v tom je ten domain layer **užitečný**, jen má špatné UI surface.

---

## 6. Apple Health / Health data readiness

**Tvrdá zpráva: tohle je web app. Apple HealthKit z webu NELZE.** Bez výjimky. Safari neexponuje HealthKit API. Pokud chceš HealthKit, máš tyto cesty:

1. **Capacitor wrap** — udělej iOS shell který načte tvůj web a expose HealthKit přes plugin (~2 týdny práce)
2. **React Native** — `mobile/` directory už má expo scaffold, dotáhnout to do hotové appky (~2-3 měsíce)
3. **Manuální HealthKit Export → CSV upload** — uživatel exportuje XML z Health appky, ty parsuješ. Pro power-userů OK, masově ne.
4. **Apple Shortcut** — uživatel si nastaví shortcut "send today's data to NutriPlan API". Funguje, ale onboarding je peklo.

### Co je v repu hotové
- ✅ `js/services/health-provider.js` (316 LOC) — abstraktní `HealthDataProvider` + Mock + Manual + AppleHealth placeholder
- ✅ Deterministic mock (mulberry32 seeded RNG)
- ✅ JSDoc typedefy pro `DailyActivitySummary`, `WorkoutSummary`, `SleepSummary`, `HealthMetric`
- ✅ 9 testů
- ❌ **Není napojen na nic v UI.** Žádný `getDailyActivityRange` se v real flow nevolá.

### Doporučení
- **Krátkodobě (MVP):** smaž v UI veškeré zmínky o "Apple Health" / "synchronizace". Předstírej, že to není směr. Místo toho dej **manuální + jednoduchý**: "Kolik jsi dnes nachodil kroků?" "Kolik byl tvůj poslední běh?" Tři pole. Hotovo.
- **Střednědobě:** Pokud chceš HealthKit, **commit do mobile/**. Web bude landing + auth + onboarding, iOS appka bude denní touchpoint. Tohle je jediný realistický path.
- **Dlouhodobě:** Garmin Connect API a Strava API jsou OAuth web → server. Tu **bys mohla mít**. Strava OAuth = ~3 dny práce, dramatic feature.

---

## 7. AI integration audit

### Co se reálně používá
- Single endpoint `/api/generate` (Vercel serverless, CommonJS) volá Gemini přes `https://generativelanguage.googleapis.com/v1beta`
- Rate limit přes Supabase (`api/_lib/store-readiness.js`)
- Default model: **`gemini-3.5-flash`** — **NEEXISTUJÍCÍ**. Buď je to typo (`gemini-2.5-flash`?), nebo to bude failovat
- Response MIME enforced jako `application/json`
- `recipes.js:14` má `callGemini()` wrapper s parsováním a chyba-handlingem

### Problémy
1. **`gemini-3.5-flash` neexistuje.** Real models: `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-1.5-flash`. Bez env override appka padá.
2. **Prompt v `recipes.js` ≠ prompt v `ai-plan-service.js`.** Existují dva nezávislé prompty. `recipes.js` se používá produkčně. `ai-plan-service.js` má 6 testů, 0 produkčních volání.
3. **JSON parsování přes `parseGeminiJSON` z `ai-utils.js`** — viděno: má fallback handling pro markdown fences. Dobré.
4. **Žádný retry s exponenciálním backoffem** — pokud Gemini vrátí 500, jediná akce je "Zkus to znovu" pro uživatele.
5. **Žádná telemetrie nad AI** — kolik % requestů vrátí valid JSON? Kolik token cost? Nevíš.
6. **Sanitizace user inputu** — `sanitizeUserPrompt` z `ai-utils.js` existuje, ale promtp injection prevention je primitivní (jen length + striplines)
7. **Žádný streaming** — uživatel čeká 5-30 sekund na celý JSON. Mohl bys streamovat per-meal a renderovat postupně.
8. **`maxTokens` default 3500** — pro 6 jídel + recepty je to malý buffer. Často AI utne výstup a parse selže.

### Doporučení
- **Okamžitě:** fix model name. Add fallback: pokud `gemini-3.5` selže s 400/404, retry s `gemini-2.5-flash`.
- **Tento týden:** centralizovat AI volání do `ai-plan-service.js`. Smazat duplicitní prompt v `recipes.js`. Použít `validateAIPlanOutput` z `ai-plan-service.js:153`.
- **Tento měsíc:** přidat streaming. Gemini umí `streamGenerateContent`. Uživatel vidí první jídlo do 1.5 s místo čekání 8 s.
- **Long-term:** přidat Anthropic Claude jako záložní LLM. Diversification = uptime guarantee.

---

## 8. Technical architecture audit

### Co je dobré
- **Domain layer** (`js/domain/{types,nutrition,training}.js`) je čistá pure functions, dobře testovaná, žádný DOM. To je 9/10.
- **Services layer** (`js/services/*.js`) — health provider abstraction je správný pattern.
- **CommonJS na API + ESM na frontu** — Vercel friendly, dělitelnost dobrá.
- **70 testů, zero deps test runner** — minimalistické, funkční.

### Co je špatné
- **`js/main.js` má 1557 LOC.** To je single-file Frankenstein. Obsahuje: init, auth listeners, toast, gender setter, meal count, freq cards binding, calculate handler, day planner toggle, profile modal, share toolbar, cookie banner, food log render, water tracking, weight upsert, GA loader. Tohle musí být rozbité na 8 souborů.
- **Žádný TypeScript.** JSDoc je heroic, ale `IDE inference` je 60% TS. Refactor bez TS = strach.
- **Žádný router.** Vše je v jednom `index.html` (846 LOC) s `display:none/block` přepínáním tabů. Pro 4 taby OK, pro 10 už ne.
- **State management v `appState` objektu** — mutable singleton importovaný všude. Funguje, ale debugging "kdo mi přepsal `appState.macros`?" je peklo. Nemá to ani devtools.
- **2 paralelní onboarding flow** (wizard + starý form) po dnešní práci.
- **Czech goal strings v doméně.** `appState.goal = 'hubnutí'` se musí mapovat na `'fat_loss'` v `calculator.js:legacyGoalToDomain`. Měnit by se měla zdroj pravdy, ne mapování.
- **`v=8` / `v=10` cache busting manuálně.** Některé soubory mají `?v=8`, hlavní `main.js` má `?v=10`, nový `onboarding.js` má `?v=1`. Nesynchronní. Build step by tohle vyřešil.
- **Mobile/ scaffold** existuje (expo), ale `mobile/node_modules` je zacommitované. Smaž to.

### Konkrétně k refactoru
| Soubor | Akce |
|--------|------|
| `js/main.js` | Rozdělit do `init.js`, `tabs.js`, `food-log-ui.js`, `share-ui.js`, `cookie-banner.js`, `water-ui.js`. Cíl: <300 LOC per file. |
| `js/recipes.js` | Vyhodit duplicitní prompt. Volat `buildAIPlanPrompt` z `ai-plan-service.js`. |
| `js/services/training-plan-service.js` | Buď napojit na UI, nebo smazat. Tertium non datur. |
| `js/calculator.js` | Mapping `legacyGoalToDomain` smaž. Změň zdroj pravdy v `appState` na domain enum hodnoty. |
| `mobile/` | Pokud necommittuješ do iOS appky → smaž celý adresář. Pokud commitneš → smaž `node_modules`, přidej do `.gitignore`. |
| `index.html` | Inline `<style>` (101 řádků pro wizard) přesuň do `css/components.css` nebo nového `css/wizard.css`. |
| `package.json` | Přidej `type: module` na root. Migrate API na ESM (Vercel to podporuje od 2024). |

---

## 9. UX/UI audit

### Vizuální hodnocení
- ✅ Dark mode je dobře vyladěný (Whoop × Oura inspirace v commitech). Accent #C4E0B6 (meadow) je rozpoznatelný.
- ✅ Typografie čistá, monospace pro čísla (`--data-kcal`).
- ✅ Karty mají dobrou hierarchii (`.card-kicker`, `.card-title`, `.card-subtitle`).
- ❌ **Příliš mnoho karet pod sebou**. Today tab má 6+ karet. Skroluj, skroluj. Žádná dominance.
- ❌ **Mobile-first chybí**. `inputs-grid` na ≤480 px je `padding:22px 18px` — pořád side-by-side. Na 360 px width se rozsypává.
- ❌ **Žádná Empty state pro "ještě jsi nevygeneroval plán"**. Hero zmizí, vidíš prázdnou kartu.
- ❌ **Loading state je skeleton card** (line 35 v `recipes.js`) — OK, ale není tam progress hint ("Generuji 5 jídel... 3/5")
- ❌ **Error state je `<div class="error-box">` + "Zkusit znovu"** — generic. Měl bys říct uživateli *proč* to selhalo a co může udělat (např. "Zkrať si dislikes pod 200 znaků").
- ❌ **Wizard, který jsem postavil dnes,** je vizuálně OK ale **emoji-based icon set** je inkonzistentní s SVG iconography v rest of UI. Buď emoji všude, nebo nikde.
- ❌ **Hero CTA chybí.** Uživatel nevidí "Začít" button — musí scrollnout dolu na onboarding.
- ❌ **Žádné social proof** ("100k jídelníčků vygenerováno"), žádné testimonials, žádné review snippety.

### Konkrétní úpravy
1. Hero: přidej "Začít zdarma →" button který scrollne na onboarding.
2. Empty state pro Today tab když není plán: velká CTA karta "Vygenerovat dnešní jídelníček".
3. Mobile: `@media (max-width: 480px)` — všechny `inputs-grid` převést na `grid-template-columns: 1fr`.
4. Wizard: nahradit emoji za SVG icons (Lucide / Heroicons). Konzistence s zbytkem UI.
5. Loading: progress jako "1/5 jídlo hotové → 2/5..." pokud přidáš streaming.

---

## 10. Credibility & trust audit

### Co je good
- ✅ V `index.html` je footer disclaimer (line 322): "NutriPlan je informativní nástroj... Nenahrazuje lékařské doporučení..."
- ✅ Cookie consent banner (line 1322 v main.js)
- ✅ GDPR delete endpoint (`api/delete-account.js`)
- ✅ Legal pages (`legal.html`)

### Co je špatně
1. **Žádný disclaimer u plánu**. Uživatel vidí "Doporučujeme 1800 kcal" — ale nikde u toho není "Toto je odhad. Pokud máš lékařské podmínky, konzultuj s odborníkem." V hero footru ano, u individuálního výstupu ne.
2. **Žádný safety check pro extreme cases.** Pokud uživatel zadá věk 14 + váha 35 kg + cíl "hubnutí", systém mu vyplivne 1200 kcal plán. **To je nebezpečné.**
3. **Žádný hard cap pro abnormální BMI.** BMI > 40 nebo < 16 by měl trigger "vyhledej lékaře, ne appku".
4. **Žádný coverage diet restrictions edge cases** — pokud uživatel řekne `dislikes = "diabetes 1. typu"`, AI to bude brát jako "nemám rád".
5. **Permission wording pro analytics**: "Tato stránka používá analytiku pro zlepšení služeb." — vague. Co konkrétně se posílá? GA4? Vercel? Jak dlouho?
6. **Premium feel:** ✅ vizuálně OK, ❌ obsahově sketchy. "Bez vážení" je marketing buzz, ale onboarding chce váhu v kg.
7. **Žádný "Powered by Gemini" disclosure.** Pokud AI obsah, mělo by to být uvedeno.
8. **Stripe paywall + free generování**: pokud chceš premium tier, **jasně napiš co je v premium**. Není to nikde vidět v UI.

### Co přidat před launch
- Disclaimer modal před prvním plánem ("Tento plán je orientační. Pokud máš zdravotní podmínky, zeptej se lékaře nebo nutričního terapeuta.")
- Hard safety cap: BMI < 16 nebo > 40 → "Zkonzultuj s odborníkem, my ti plán nedoporučíme."
- Specifické zákazy pro: těhotenství, kojení, diagnostikované poruchy příjmu potravy, věk < 16.
- Privacy policy v jednoduchém jazyce (TLDR varianta).
- AI disclosure: "Plán generuje Google Gemini AI na základě tvých údajů. Tvoje jméno ani identifikační údaje nikdy neopouštějí naše servery."

---

## 11. Competitive differentiation

| Konkurent | Síla | Tvá výhoda |
|-----------|------|-------------|
| **ChatGPT (free)** | Univerzální, kvalitní recepty | Češtinu, structured output, nákupní seznam, paywall = retence |
| **MyFitnessPal** | 14M food DB, barcode scan, communita | Nemáš. Nemáš. Nemáš. **Nesoupeř.** |
| **Cronometer** | 84 mikronutrientů, lékařský standard | Nemáš. Nemáš. Nesoupeř. |
| **Lifesum** | Pretty, motivační, vlastní jídelníčky | Češtinu, AI generování, fitness goals integrace (potenciálně) |
| **Strava** | Sociální, tréninkový | Nutrition layer, který Strava nemá |
| **Garmin Connect** | Hardware data | Webová appka bez hardware. Nesoupeř. |
| **Apple Fitness** | iOS-native | Češtinu, AI plán, ne jen logging |
| **Generické AI meal planners** (Eat This Much, PlateJoy) | Hotové DB, US-focused | Češtinu, levnější, lokální supermarkety |

### Unique wedge
**"Czech adaptive nutrition + light training plan."**
- Nikdo v Češtině neumí AI + nutrition + odkaz na české obchody (Billa/Albert/Kaufland/Lidl).
- Nikdo neumí "tvůj plán se upraví podle tréninků" (Strava + nutrition feedback loop) v česky.
- Nikdo neřeší niche jako *hyrox v Praze* nebo *Ironman přípravu*.

### První niche (pick ONE)
**Volba A: "AI jídelníček pro běžce 30+"** — měření kg, lehké tréninkové plány 5k/10k/půl, target persona je manažer co chce zhubnout a uběhnout maraton. To je 50k lidí v ČR.

**Volba B: "Hubnoucí mama appka"** — vylučuje sport, soustředí se na "kalorie + chuť k jídlu + manželský jídelníček". To je 200k+ lidí v ČR, ale konkurence (FitClub, FitYou) je už silná.

**Volba C: "Premium hyrox/triathlon adaptive coach"** — niche, drahá, retentive. 5k lidí v ČR, ale 500-1000 Kč/měsíc.

**Doporučení:** Volba A. Největší trh + nejlepší fit pro current domain layer (nutrition + run training).

### Memorable feature
**"V pondělí vidíš pondělí. V úterý ti appka napíše: dnes jsi spal 5 hodin, snižuju ti intenzitu tréninku a přidávám 200 kcal sacharidů."** — to je *adaptive*. To není ChatGPT. To není MFP.

### Co NESTAVIT
- Triatlon/Ironman cíle (zatím)
- Apple Health
- Food photo analysis (existuje, ale je marginal)
- Multi-language
- Native mobile
- Recipe community
- Sharing/sociál

---

## 12. Missing features list (priorita)

| Priorita | Oblast | Feature | Proč | Difficulty | Impact | Implementace |
|---|---|---|---|---|---|---|
| **P0** | AI | Fix Gemini model name v `api/generate.js:24` | App padá v produkci | Low | High | Změnit default na `gemini-2.5-flash`. 1 řádek. |
| **P0** | Safety | Hard safety floors v calculator | Legal/etical risk | Low | High | V `calcMacroTargets`: BMI < 16 nebo > 40 → throw warning, ne plán |
| **P0** | UX | Smazat duplicitní onboarding (starý form NEBO wizard) | Konfuze | Low | High | Wizard = jediná cesta. Po dokončení skoč rovnou na Today tab. |
| **P1** | Nutrition | Zapojit `adjustForDay` do Today tab | Klíč k "adaptive" pozici | Medium | High | V `js/main.js` při render Today: pokud `appState.todaySession` → volat `adjustForDay(baseline, session, profile)` |
| **P1** | Nutrition | Týdenní check-in flow | Retence | Medium | High | Nový modal "Jak ti šel týden? Váha, energie, hlad". Volat `planWeeklyAdjustment`. |
| **P1** | AI | Migrace `recipes.js` na `ai-plan-service.js` | DRY, validace | Medium | Medium | Smazat duplicitní prompt, použít `buildAIPlanPrompt + validateAIPlanOutput` |
| **P1** | UI | Empty state Today tab | First-impression | Low | Medium | Když není plán, ukázat "Vygenerovat dnešní jídelníček" CTA |
| **P1** | Trust | Disclaimer před prvním plánem | Legal | Low | Medium | Modal jednou per user |
| **P2** | Training | Připojit `generateTrainingPlan` do UI | Diferentiation | High | High | Nový "Trénink" tab. Render týdenního plánu pro vybraný cíl. |
| **P2** | AI | Streaming response | Perceived speed | Medium | Medium | `streamGenerateContent` endpoint v Gemini, render po jídlech |
| **P2** | UX | Substituce jídla | Flexibilita | Medium | Medium | `suggestAlternative` už existuje, vytáhnout do hlavního UI |
| **P2** | Data | Strava OAuth integrace | Real activity data | Medium | High | Server-side OAuth flow, `/api/strava/callback`, sync activities |
| **P3** | Architecture | Rozbít `main.js` na <300 LOC files | Maintainability | Medium | Low | Refactor 1557 řádků do 6 modulů |
| **P3** | TypeScript | Migrace na TS | DX, refactor safety | High | Medium | Nejdřív domain, pak services, pak UI |
| **P3** | Mobile | iOS Capacitor wrap | HealthKit | High | High | 2 týdny práce, hodně risku |
| **P3** | i18n | Anglická lokalizace | Trh | High | Medium | Buď až po PMF v ČR, nebo nikdy |

---

## 13. Co odstranit / zjednodušit

| Co | Důvod |
|----|-------|
| `mobile/` adresář **se zacommitnutými `node_modules`** | Pokud necommittuješ do iOS, smaž celé. Pokud commitneš, smaž jen `node_modules`. |
| `js/services/training-plan-service.js` | Mrtvý kód bez UI. Buď připojit, nebo smazat (a smazat i 27 testů). |
| Apple Health zmínky v UI a roadmapu | Z webu nepůjde nikdy. Nelžít. |
| Triatlon/Ironman cíle v doméně | Niche v niche. Pro 5 lidí v ČR. Smaž do MVP+1, vrať se po PMF. |
| Hyrox/OCR cíle v doméně | Stejné. Niche. |
| Manuální `?v=8/9/10` cache busting | Přidej build step (Vite stačí). |
| 5 různých tab strategies (`step-dot`, `wizard-dot`, `app-tab`, `auth-tab`, `nav-btn`) | Konsolidovat do 2 patterns max. |
| Inline `<style>` v `index.html` (101 řádků wizard CSS) | Přesun do `css/`. |
| Czech goal strings `'hubnutí'/'udržení'/'nabírání'` | Single source of truth = domain enum. |
| `recipes.js` vlastní prompt builder | Sjednotit s `ai-plan-service.js`. |
| Photo analysis fallback (`api/analyze-food-photo.js`) | Pokud není reliable, dej tomu paywall nebo skryj. Není to MVP. |

---

## 14. Refactor recommendations

### Cílová folder structure
```
js/
├── domain/           # pure functions, žádný DOM (DONE)
│   ├── nutrition.js
│   ├── training.js
│   └── types.js
├── services/         # I/O + side effects
│   ├── ai/
│   │   ├── gemini-client.js     # nový — sjednocený HTTP client
│   │   └── plan-builder.js      # přejmenovaný ai-plan-service.js
│   ├── health/
│   │   └── provider.js
│   ├── storage/                 # Supabase tracking
│   │   ├── meals.js
│   │   └── weights.js
│   └── stripe-client.js
├── ui/               # DOM bindings
│   ├── onboarding.js
│   ├── tabs/
│   │   ├── today.js
│   │   ├── plan.js
│   │   ├── log.js
│   │   └── progress.js
│   ├── modals/
│   │   ├── profile.js
│   │   └── recipe-modal.js
│   └── components/
│       ├── toast.js
│       ├── share-toolbar.js
│       └── cookie-banner.js
├── state.js          # immutable-ish, plus pubsub
└── main.js           # <100 LOC orchestrator only
```

### Konkrétní extracts z `main.js`
1. `setStep`, `setGender`, `changeMealCount`, `toggleGender` → `js/ui/tabs/calculator-form.js`
2. Toast logic → `js/ui/components/toast.js`
3. Cookie consent → `js/ui/components/cookie-banner.js`
4. Food log render (700+ řádků) → `js/ui/tabs/log.js`
5. Water tracking → `js/ui/components/water.js`
6. Profile modal → již v `js/profile.js`, ale ten je 600+ LOC, taky rozbít
7. Share toolbar → `js/ui/components/share-toolbar.js`
8. Persist/load form → `js/services/storage/profile.js`

### Type safety
Migrate kritické věci na TypeScript v tomto pořadí:
1. `js/domain/types.js` → `types.ts` (přímé převedení JSDoc na TS)
2. `js/domain/nutrition.js` → `nutrition.ts`
3. `js/domain/training.js` → `training.ts`
4. `js/services/**` 
5. `js/ui/**`

Nepoužívej `any`. Pro AI response použij `zod` schema (nikoli hand-rolled validator).

### Test files to add
- `tests/integration/generate-plan.test.js` — end-to-end: profil → calc → ai call (mocked) → validate → render
- `tests/safety.test.js` — extreme inputs (BMI 14, age 12, weight 250) musí throw
- `tests/onboarding-wizard.test.js` — DOM test pro nový wizard

---

## 15. MVP recommendation

### Target user
**Český muž 28-45 let, kanceláři, chce zhubnout 5-15 kg a možná uběhnout 10k/půlmaraton.**

Persona "Tomáš, 35, manažer, 92 kg, chce 80 kg, běhá 1× týdně, jí v kantýně, chce mít plán."

### Main promise
**"V pondělí ti řekneme co jíst. V úterý se to upraví podle toho, jak jsi spal a co jsi trénoval."**

### Onboarding flow (max 90 s)
1. PrimaryGoal: zhubnout / udržet / nabrat (3 karty)
2. Aktuální stav: pohlaví, věk, výška, váha
3. Týden: kolikrát tréninky, jaké
4. Diety: omnivore / vegetarian / vegan + alergie (chips)
5. (Wizard hotov, generuje první plán)

### Core inputs
- Profil (jen 1×)
- Denní: váha (volitelně), trénink (typ + délka), pocit (1-5)

### Generated outputs
- **Týdenní plán** (po-ne) — 5 jídel/den, ingredience, makra, kroky
- **Nákupní seznam** (per týden, grouped by kategorie)
- **Tréninkový plán** (volitelně, pokud má cíl 5k/10k/půl) — 4-5 sessions/týden

### Dashboard (Today)
- Dnešní cíl (kcal + makra)
- Dnešní jídla (5 cards)
- Dnešní trénink (1 card)
- Adjustment poznámka ("Včera jsi spal 5 h — dnes ti přidávám 100 kcal")

### Co je mocked
- Apple Health → smazat zmínky
- HRV → smazat zmínky
- Spánek → manuální input v dashboard ("Kolik hodin?")
- Tréninky → manuální input ("Co jsi dnes dělal?")

### Co je real
- BMR/TDEE/makra (deterministic)
- Týdenní AI generování receptů
- Adaptive adjustment (volá `planWeeklyAdjustment` po 5+ dnech)
- Stripe paywall (po 3 vygenerovaných týdnech)

### Co v demo *neclaimovat*
- ❌ Apple Health sync
- ❌ "Synchronizace se Stravou" 
- ❌ "AI s 99% přesností"
- ❌ "Lékařsky ověřeno"
- ❌ "10k uživatelů"

### Co v demo *claimovat*
- ✅ "100 % v češtině"
- ✅ "Adaptivní — plán se upraví podle tvého tréninku"
- ✅ "Nákupní seznam z Billa, Albert, Kaufland, Lidl"
- ✅ "Bez závazků, první týden zdarma"

---

## 16. 7-day implementation plan

### Day 1 — Crashes & Safety
**Cíl:** Aby app vůbec běžela v produkci a nezabíjela uživatele.
- Fix `gemini-3.5-flash` v `api/generate.js:24` → `gemini-2.5-flash`
- Hard safety floors v `calcMacroTargets` (BMI hranice)
- Disclaimer modal před prvním plánem
- Smazat `mobile/node_modules` z gitu, přidat `.gitignore`
- **Files:** `api/generate.js`, `js/domain/nutrition.js`, `js/main.js`, `.gitignore`

### Day 2 — Onboarding sjednocení
**Cíl:** Jeden flow, ne dva.
- Wizard nahradí starý formulář — když je wizard hotový, skoč rovnou na Today tab a skryj `.steps-row` + 2 staré karty
- Wizard ukládá výsledek do Supabase profile (pokud auth)
- Smaž duplicitní `loadFormFromLS`
- **Files:** `js/main.js`, `js/ui/onboarding.js`, `index.html`

### Day 3 — AI sjednocení
**Cíl:** Jeden prompt, jedna validace, jedna pravda.
- `recipes.js` migrate na `buildAIPlanPrompt`
- Použít `validateAIPlanOutput`
- Smazat duplicitní validační logiku
- Telemetry: log retry rate
- **Files:** `js/recipes.js`, `js/services/ai-plan-service.js`

### Day 4 — Today tab adaptive
**Cíl:** First "adaptive" feature, viditelně.
- V Today tab volat `adjustForDay(baseline, todaysSession, profile)`
- Render karta "Dnešní úprava" s důvodem
- Pokud žádný session → "Volný den — méně sacharidů, více tuků."
- **Files:** `js/main.js` (Today render), `js/domain/nutrition.js`

### Day 5 — Weekly check-in
**Cíl:** Retence feedback loop.
- Nový modal "Týdenní reflexe" (po 7 dnech od první generace)
- Vstup: aktuální váha, energie 1-5, hlad 1-5, adherence 0-100%
- Volat `planWeeklyAdjustment`
- Render result: "Snižujeme kcal o 150" + důvod
- Persist do Supabase `weekly_checkins` table
- **Files:** `js/ui/modals/check-in.js` (nový), `js/main.js`, Supabase migration

### Day 6 — Training tab MVP
**Cíl:** Vytáhnout doménu do UI.
- Nový "Trénink" tab (jen pro goals: `run_5k`, `run_10k`, `half_marathon`)
- Render týdenního plánu pomocí `generateTrainingPlan`
- "Označit jako splněno" tlačítko (persist do Supabase)
- **Files:** `index.html`, `js/main.js`, nový `js/ui/tabs/training.js`

### Day 7 — Polish + demo prep
**Cíl:** Demo-ready stav.
- Mobile responsive sweep (testovat na 360 px)
- Empty states Today / Plan / Training
- Loading skeletons konzistentní
- Error messages konkrétnější
- Screenshot/screencast pro landing page
- Aktualizovat README + ARCHITECTURE.md s reálným stavem
- **Files:** všechny CSS files, README.md

---

## 17. Final brutal summary

### 🔥 Biggest weakness
**Domain layer ↔ UI gap.** Postavil jsi krásný adaptive nutrition + training motor s 70 testy, ale **UI volá jen 10 % z toho**. `adjustForDay`, `planWeeklyAdjustment`, `generateTrainingPlan` — vše dead code z perspektivy uživatele. Pokud to nezapojíš tento týden, je to **muzejní kód**.

### 🚀 Biggest opportunity
**"Adaptive Czech nutrition planner pro běžce."** Niche, dobře targeted, defendable. Strava OAuth + AI plán + váhový trend = příběh, který ChatGPT ani MFP neumí říct. Czech market = 50-100k lidí, paywall 199 Kč/měsíc = realistický revenue scenario.

### 🎯 The ONE feature to build next
**"Today adjustment card."** Na Today tabu pod hlavními makra ukázat: *"Dnes je úterý, máš naplánovaný long run 16 km. Přidávám +95 g sacharidů (refuel + pre-fuel). Dnešní cíl: 2350 kcal."* Tohle volá `adjustForDay`, je to **jedna karta, 50 LOC v UI**, a okamžitě to dělá rozdíl mezi "AI generated text" a "smart coach". Tohle musí existovat ZÍTRA.

### 💀 The ONE thing that makes the app look fake
**Hero říká "bez vážení, bez databází", onboarding chce váhu v kg a appka má Supabase.** Buď oprav copy ("Bez logování každého jídla. AI ti spočítá co potřebuješ."), nebo oprav onboarding (no weight required, BMI z body fat estimate). Současný stav je marketing lež a chytrý uživatel to vidí do 30 sekund.

### ✨ The ONE thing that would make it impressive
**Stream the meal plan jako Cursor streamuje kód.** První jídlo se zobrazí do 1.5 sekundy, další se objevují jak AI generuje. To je 2 dny práce (Gemini má `streamGenerateContent`), a obrátí to vnímání z "čekání" na "kouzlo". Žádný český nutrition produkt to nemá.

---

## TLDR pro tebe

1. Smaž 50 % toho co je v repu (training niche cíle, mobile/, Apple Health zmínky, druhý onboarding flow).
2. Zapoj 100 % toho co necháš (každá doménová funkce má mít UI surface).
3. Fix gemini model name, nebo to padá v produkci.
4. Pick ONE persona (běžec 28-45) a postav vše proti ní.
5. Sluř to v 7 dnech, pak měřit retenci, ne features.
