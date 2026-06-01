# Trenr Mobile 📱

Moderní, plně typovaná mobilní aplikace (Expo SDK 56, React Native 0.85, TypeScript, Vitest) postavená jako mobilní klient pro ekosystém **Trenr**.

Aplikace prošla kompletním **Brutálním Auditem** a refaktorem, který ji posunul od jednoduchého AI prompt wrapperu ke špičkovému, interaktivnímu produktu se zaměřením na sportovní výživu.

---

## 🚀 Klíčové Funkce (Refaktorováno & Implementováno)

### 1. Vizuální upgrade & Premium Design (Den 2 & 3)
*   **Kruhový Macro Progress Ring (`MacroRing`)**: Custom SVG vizualizace denního zbývajícího rozpočtu kalorií na dashboardu se stupňující barevnou zpětnou vazbou.
*   **Moderní typografie (Inter)**: Nativní integrace rodiny písem Google Fonts (Inter Regular, Bold, ExtraBold) pro prémiový mobilní pocit.
*   **OLED Dark Mode**: Vysoce kontrastní, oku lahodící tmavý lesní motiv (`#111815` pozadí, `#1b2420` karty, akcentní zelená) automaticky respektující systémové nastavení a přepínatelný přes Theme Context.
*   **GPU-akcelerované micro-animace (`FadeInView`)**: Stupňovaný náběh karet (staggered delay) na domovské a tréninkové obrazovce pro špičkový nativní zážitek.
*   **Skeletony & Fun Loading stavy**: Cyklické textové tipy během AI generování plánu ("Vaříme ti plán...", "Počítáme makra...").
*   **CTA prázdné stavy**: Vyčištěné empty states s hezkými ilustracemi a přímými akčními tlačítky ("Vygenerovat plán" / "Vyfotit jídlo").

### 2. Adaptivní zpětná vazba & Coaching (Den 4)
*   **Sledování trendu váhy**: Záznam tělesné hmotnosti k jakémukoliv dni uložený do AsyncStorage a hezký 7denní přehledný grid přímo na HomeScreen.
*   **Weekly Check-in & Adaptace**: Interaktivní koučinkový check-in v Profilu. Zhodnotí pokrok (energie, hlad, váha) a doporučí adaptaci kalorického příjmu o $\pm 5-10\ \%$ s automatickým přepočtem Mifflin-St Jeor BMR.

### 3. Tréninkový plánovač (Trénink Tab) (Den 5)
*   **Plnohodnotný kalendář tréninků**: Nová záložka v tab navigaci (s ikonou činky) generuje na základě tvého profilu a tréninkového cíle kompletní týdenní plán (Po-Ne) s rozlišením tréninků (tempo, síla, long run, volno), délkou a intenzitou.

### 4. Inteligentní AI Integrace & Fotoaparát (Den 6)
*   **Tréninkový kontext v promptu**: Generátor jídelníčku ví, jaký trénink tě dnes čeká. Pro tréninkové dny automaticky přidává pre-fuel/post-workout sacharidy na základě intenzity a tvé reálné váhy.
*   **Přímé focení jídla**: Integrace fotoaparátu s nativním vyžádáním práv pro okamžitý zápis jídla na jeden klik.
*   **Robustní I/O & Retry s Backoffem**: API klient automaticky zkouší neúspěšné požadavky s exponenciálním zpožděním (retry s backoffem). Po uložení jídla tě navíc aplikace automaticky přesměruje zpět na dashboard.

---

## 🛠️ Lokální Spuštění

### 1. Příprava a instalace
```bash
cd mobile
npm install
```

### 2. Konfigurace prostředí
Vytvoř soubor `.env` ve složce `mobile/` na základě `.env.example`:
```bash
EXPO_PUBLIC_API_BASE_URL=https://nutri-fit-omega.vercel.app
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

### 3. Spuštění Expo serveru
```bash
npm run start
```
Následně stiskni `a` pro emulátor Androidu, `i` pro iOS emulátor, nebo naskenuj QR kód v aplikaci Expo Go na svém telefonu.

---

## 🧪 Testování

Aplikace využívá **Vitest** pro rychlé, robustní unit a integrační testy pokrývající výpočty maker, tréninkovou logiku, AsyncStorage migrace a normalizace.

Spuštění testů:
```bash
npm test
```

Všechny testy v souborech `storage.test.ts` a `nutrition.test.ts` procházejí a ověřují:
1.  Přesný výpočet BMR a TDEE s ochrannými limity (safety floors).
2.  Dynamický odhad kalorického výdeje z reálné hmotnosti uživatele.
3.  Správné mapování frekvence tréninků na aktivní faktory.
4.  Migraci datových struktur ze starších verzí na více-denní ukládání.

---

## 🗄️ Architektura Mobilní Části
Aplikace je čistě oddělená do logických celků:
*   `src/components/`: Režimové UI elementy (`MacroRing.tsx`, `DateHeader.tsx`, custom `UI.tsx` a `Screen.tsx`).
*   `src/context/`: State management (`ThemeContext.tsx` pro OLED dark mode, `TrenrContext.tsx` jako hlavní data store).
*   `src/screens/`: Obrazovky onboardingu, dashboardu, tréninků, AI jídelníčků, historie a profilu.
*   `src/utils/`: Pure utility (`nutrition.ts` s Mifflin-St Jeor rovnicemi, `mealPrompts.ts`).
*   `src/services/`: Supabase, storage a síťové rozhraní API.
