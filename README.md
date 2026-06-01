# Trenr

**Trenr je mobile-first AI kouč pro jídlo, trénink a regeneraci.** Každé ráno
odpoví na jednu otázku: *co dnes jíst, jak trénovat a jestli přidat nebo ubrat podle
regenerace.* Apple Health / HealthKit slouží jako datový základ (kroky, spánek, HRV,
tréninky) — a ten je dostupný jen v nativní iOS vrstvě, ne v prohlížeči.

## Struktura repa

| Cesta | Role |
|---|---|
| **`mobile/`** | **Produkt** — React Native / Expo app (Trenr AI Coach). Single source of truth pro doménovou logiku (TypeScript). Viz [`mobile/README.md`](mobile/README.md). |
| **root web** (`index.html`, `js/`, `css/`) | **Landing / legal / waitlist.** Není to produkt — jen distribuce. |
| **`api/`** | **Sdílený backend** (Vercel serverless) — AI proxy, Stripe, OAuth exchange/refresh, delete/export. Volá ho mobilní app. |
| **`js/domain/`** | ⚠️ **FROZEN** legacy origin. Kanonická logika je v `mobile/src/{utils,lib}`. Viz [`js/domain/README.md`](js/domain/README.md). |
| **`supabase/migrations/`** | DB schema (sdílené). |

> **Rozhodnutí (mobile-first, inkrementálně):** mobilní app je produkt, web je landing
> nad sdíleným `api/` backendem. Monorepo (`packages/core`) je **odložené** — vytáhne se
> z mobilu, až bude druhý reálný konzument (web demo / serverový výpočet). Web se zatím
> **nepřepisuje do Reactu** a **nepředstírá Apple Health v prohlížeči**.

## Mobilní app (produkt)

```bash
cd mobile
npm install
./node_modules/.bin/expo start     # 'i' = iOS sim, 'a' = Android, nebo QR v Expo Go
```
Nativní HealthKit / notifikace vyžadují **EAS dev build** (v Expo Go jsou stubnuté; v dev
módu běží mock health data). Testy + typecheck:
```bash
cd mobile
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/vitest run
```

## Web (landing + backend)

- Frontend: HTML / CSS / vanilla JS — **landing, legal, waitlist**. Nasazení na Vercel.
- `api/` — Gemini proxy (`/api/generate`, klíč jen na serveru), `analyze-food-photo`,
  Stripe, OAuth (garmin/oura/strava/whoop) exchange/refresh, `delete-account`/`export-data`.
- Auth/DB: Supabase. Platby: Stripe.

## Bezpečnost a privacy

- Není zdravotnická rada; žádná diagnóza ani léčba.
- Hubnutí limitované: max ~1 % hmotnosti / týden, floor 1500 kcal (M) / 1200 kcal (Ž).
- Tréninkový objem roste max 10 % / týden, deload každý 4. týden; při nízkém spánku /
  poklesu HRV se kvalitní session vymění za easy.
- **Apple Health jen na mobilu** (EAS build) — web HealthKit data nepředstírá.

## Testy

```bash
node tests/run.js     # frozen js/domain (zero-dep runner)
cd mobile && ./node_modules/.bin/vitest run   # produkt (mobile)
```

Detail historie a domén v [ARCHITECTURE.md](ARCHITECTURE.md).
