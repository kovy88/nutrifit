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

## 2. Android Health Connect — STUB (ready to wire)

Provider class je stub s TODO(android) markery. Postup:

```bash
cd mobile
npx expo install react-native-health-connect
```

Add to `app.json` → `expo.android.permissions`:
```json
"android.permission.health.READ_STEPS",
"android.permission.health.READ_ACTIVE_CALORIES_BURNED",
"android.permission.health.READ_SLEEP",
"android.permission.health.READ_HEART_RATE",
"android.permission.health.READ_HEART_RATE_VARIABILITY",
"android.permission.health.READ_WEIGHT",
"android.permission.health.READ_EXERCISE"
```

Then implement the TODO(android) bodies in `HealthConnectProvider.ts` —
the package's `readRecords()` API maps cleanly to our methods. Zepp, Mi Band,
Garmin Connect, Samsung Health, Withings všechno teče skrz Health Connect.

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

## 5. Garmin / Oura — OAUTH DONE, needs a HealthDataProvider

Kroky 1-5 z template patternu (backend exchange/refresh, web bridge,
`lib/health/oauth/<Service>OAuth.ts`, `hooks/use<Service>Connect.ts`,
Settings wiring) jsou u obou už hotové stejně jako u Strava/Whoop —
uživatel se dnes reálně může připojit a token se uloží. Chybí jen krok 6:
žádná `<Service>Provider.ts` (HealthDataProvider implementace) zatím
neexistuje, takže composite provider připojený token zatím nevyužije pro
čtení dat. Vzor viz `WhoopProvider.ts` (read-side stub, čeká na reálné
API mapování).

## 6. Polar / Fitbit — TEMPLATE, NOTHING BUILT YET

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

## 6. Zepp / Mi Fit / Amazfit / Suunto — VIA NATIVE BRIDGE

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
