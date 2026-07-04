# Health Source Integrations — Setup Guide

Trenr mobilní app umí číst data z více zdrojů zdravotních dat
najednou. Architektura je hotová; níže najdeš návod, jak připojit
jednotlivé zdroje v produkci.

## Architektura ve zkratce

Všechny zdroje implementují **`HealthDataProvider`** interface
(`mobile/src/lib/health/HealthDataProvider.ts`). **`CompositeHealthDataProvider`**
je všechny obalí a vrátí merged data podle priority pořadí. UI volá vždy
přes jeden hook (`useHealthDataProvider`, `useTrend`, `useRecentWorkouts`,
`useDailyCoaching`) — který zdroj data dodal, je transparentní.

Faktory (`createHealthDataProvider({ mode: 'auto' })`) v auto módu sestaví
composite z:

1. **Native** — Apple Health (iOS) nebo Health Connect (Android)
2. **Strava** — pokud připojeno OAuth flow
3. **Whoop** — pokud připojeno OAuth flow
4. **Mock** (dev) / **Manual** (prod) — fallback

---

## 1. Apple Health (iOS) — REAL IMPLEMENTATION READY

Provider class má reálnou implementaci, ale balíček není v `package.json`.
Stačí 3 kroky:

### Instalace
```bash
cd mobile
npx expo install @kingstinct/react-native-healthkit
```

### Config plugin v `app.json`
Přidej do `expo.plugins`:
```json
[
  "@kingstinct/react-native-healthkit",
  {
    "healthSharePermission": "NutriFit používá Apple Health pro čtení kroků, spánku, HRV, klidového tepu, váhy a tréninků — abychom mohli přizpůsobit jídelníček a doporučovat regeneraci.",
    "healthUpdatePermission": "NutriFit neukládá do Apple Health žádná data, jen čte."
  }
]
```

A do `expo.ios.infoPlist`:
```json
"NSHealthShareUsageDescription": "Čteme spánek, HRV, kroky a tréninky pro adaptivní coaching.",
"NSHealthUpdateUsageDescription": "Neukládáme do Apple Health, jen čteme."
```

### EAS Build
HealthKit nefunguje v Expo Go — musí to být EAS Build (nebo `expo run:ios`
s nativním projektem).
```bash
eas build --platform ios --profile development
```

Po tomhle: na iOS se otevře native permission dialog při prvním klepnutí
na "Detail / instrukce" v Settings → Apple Health, granted typy se začnou
plnit a Composite je transparentně přiřadí.

---

## 2. Android Health Connect — DONE (2026-07-04)

`HealthConnectProvider.ts` reads real data via `react-native-health-connect`
(steps, active calories, distance, workouts, sleep stages, resting HR, HRV,
body weight). Zepp, Mi Band, Garmin Connect, Samsung Health, Withings všechno
teče skrz Health Connect, takže tahle jedna implementace odemyká všechny
najednou na Androidu.

Native module — vyžaduje EAS Build (žádný Expo Go/web support). Config
plugin + `expo.android.permissions` (READ_STEPS/READ_ACTIVE_CALORIES_BURNED/
READ_SLEEP/READ_HEART_RATE/READ_RESTING_HEART_RATE/READ_HEART_RATE_VARIABILITY/
READ_WEIGHT/READ_EXERCISE/READ_DISTANCE/READ_TOTAL_CALORIES_BURNED) už jsou
v `app.json`.

Verifikace: typecheck proti reálným typům balíčku + mockované unit testy
(`healthConnectProvider.test.ts`, 14 testů). **Bez reálného Android zařízení
s Health Connect nainstalovaným nejde field-testovat živě** — field
names/shapes ověřené proti balíčku's vlastním TS typům, ne proti skutečné
API odpovědi.

---

## 3. Strava OAuth — DONE, needs credentials

1. Register app: https://www.strava.com/settings/api
   - Authorization Callback Domain: `nutri-fit-omega.vercel.app`
2. Vercel env vars:
   - `STRAVA_CLIENT_ID` = `<number>`
   - `STRAVA_CLIENT_SECRET` = `<40-char hex>`
3. Local `.env`:
   - `EXPO_PUBLIC_STRAVA_CLIENT_ID` = `<number>`
4. Rebuild: `npx expo start --clear`

V appce: Profil → ⚙️ Zdravotní zdroje → Strava → "Připojit"

---

## 4. Whoop OAuth — DONE, needs credentials + subscription

1. Register at https://developer.whoop.com/
   - Redirect URL: `https://nutri-fit-omega.vercel.app/whoop-callback.html`
   - Scopes: `read:recovery read:sleep read:workout read:profile read:body_measurement read:cycles offline`
2. Vercel env vars:
   - `WHOOP_CLIENT_ID`
   - `WHOOP_CLIENT_SECRET`
3. Local `.env`:
   - `EXPO_PUBLIC_WHOOP_CLIENT_ID`
4. Rebuild

Uživatel musí mít aktivní Whoop subscription, aby OAuth povolení proběhlo.

---

## 5. Oura — DONE

Všech 6 kroků z template patternu hotovo, včetně `OuraProvider.ts`
(2026-07-04): čte sleep (+ HRV/RHR), daily activity, workouty a statickou
profile váhu z `/v2/usercollection/{sleep,daily_activity,workout,personal_info}`.
Field names ověřené proti Oura's oficiálnímu OpenAPI spec (křížově přes
dva nezávislé zdroje), ale BEZ přístupu k živému Oura účtu — považovat
za ověřené na papíře, ne field-testované. Viz `TODO.md` pro detaily.

## 6. Garmin — OAUTH DONE, needs a HealthDataProvider

Kroky 1-5 z template patternu (backend exchange/refresh, web bridge,
`lib/health/oauth/GarminOAuth.ts`, `hooks/useGarminConnect.ts`,
Settings wiring) jsou už hotové stejně jako u Strava/Whoop/Oura —
uživatel se dnes reálně může připojit a token se uloží. Chybí jen krok 6:
žádný `GarminProvider.ts` (HealthDataProvider implementace) zatím
neexistuje, takže composite provider připojený token zatím nevyužije pro
čtení dat. Navíc vyžaduje schválení Garmin Connect Developer Program
(~2 týdny review) — kick off tu žádost brzy, je to delší krok než samotné
kódování. Vzor viz `OuraProvider.ts` (hotová implementace) nebo
`WhoopProvider.ts` (read-side stub, čeká na reálné API mapování).

## 7. Polar / Fitbit — TEMPLATE, NOTHING BUILT YET

Na rozdíl od Garmin/Oura tady neexistuje vůbec nic — jen placeholder
entry v `OAuthService`/`HealthDataProvider['name']` union types. Stejný
pattern jako Strava a Whoop, od nuly:

1. Backend: `api/<service>/exchange.js` + `api/<service>/refresh.js`
   - Stejný shape jako `api/strava/exchange.js`
2. Web bridge: `<service>-callback.html`
   - Repackaging `?code/state` na `nutrifit://<service>/callback?...`
3. Mobile: `lib/health/oauth/<Service>OAuth.ts` (paralelně k `StravaOAuth.ts`)
4. Hook: `hooks/use<Service>Connect.ts`
5. Settings: napojení `handleConnect` na nový hook
6. `<Service>Provider.ts` (HealthDataProvider implementace) s reálným API mapováním

---

## 8. Zepp / Mi Fit / Amazfit / Suunto — VIA NATIVE BRIDGE

Tyto ekosystémy NEMAJÍ public OAuth API. Cesta:

- iOS uživatel: V Zepp / Mi Fit appce zapnout sync do Apple Health
  → data poteče skrz `AppleHealthProvider`
- Android: V Zepp appce zapnout sync do Health Connect
  → data poteče skrz `HealthConnectProvider`
- Suunto: V Suunto appce zapnout sync do Strava
  → data poteče skrz `StravaProvider`

Není potřeba žádný kód navíc — Composite je transparentně sloučí.

---

## Token storage

OAuth tokeny se ukládají přes `OAuthTokenStore` — produkčně `SecureOAuthTokenStore`
(iOS Keychain / Android Keystore přes `expo-secure-store`), s `AsyncStorageTokenStore`
jako plain-text fallback jen když `expo-secure-store` není dostupný (Expo Go / testy).
Migrace mezi nimi je automatická a jednorázová per token per service.

## Account deletion

`purgeAllLocalData()` (volaná z `ProfileScreen` "Smazat účet a data") wipe-uje:
- Všechny core NutriFit storage keys
- Všechny manual health records (`nutrifit.health.manual.*`)
- Všechny OAuth tokeny (`nutrifit.oauth.*`)
- Notification schedule
- Briefing settings

Po delete uživatel zůstane bez profile a bez dat na zařízení.
