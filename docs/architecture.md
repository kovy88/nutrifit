# Trenr Architecture

Trenr is a mobile-first AI coach for nutrition, training, running goals, and
recovery. The Expo app in `mobile/` is the product. The root web app is limited
to landing, waitlist, legal pages, legacy demo access, admin, and internal AI
prompt playgrounds.

## Product Ownership

- `mobile/` is the canonical user experience and the current source of truth for
  domain logic.
- Root web files such as `index.html`, `legacy-app.html`, `js/`, and `css/` are
  not the main product. Do not add new coach, nutrition, training, or HealthKit
  features there.
- `api/` remains the shared Vercel backend for Gemini proxy calls, photo food
  analysis, OAuth exchange/refresh, Stripe, waitlist, export, and deletion.
- `supabase/migrations/` remains the shared database history.

## Target Shape

The target repository shape is a monorepo, extracted incrementally:

```text
apps/
  mobile/        # Expo app, primary product
  web/           # landing, waitlist, legal, legacy demo/admin only
api/             # Vercel functions, can stay root initially
packages/
  core/          # types, nutrition, training, coaching, onboarding parsers
  ai/            # prompt builders, response schemas, AI safety contracts
  health/        # HealthDataProvider, native/OAuth/manual providers
docs/
  architecture.md
  domain-model.md
```

Do not extract packages as a cosmetic move. First stabilize the interfaces in
`mobile/src`; then move pure modules when a second real consumer exists.

## Domain Rules

- Deterministic code owns calories, macros, readiness, training volume, race
  feasibility, and safety limits.
- AI may explain, personalize wording, generate meal creativity, parse
  onboarding intent, and propose structured actions.
- AI must not invent calorie targets, macro targets, readiness scores, or
  training volume. Structured AI actions are advisory until deterministic code
  validates them.

## Health Data

Health data is mobile-native. A normal web app cannot provide Apple Health or
HealthKit integration.

The contract is `HealthDataProvider`:

- Native providers: Apple Health on iOS, Health Connect on Android.
- OAuth providers: Strava, WHOOP, Garmin, Oura, and future sources.
- Fallbacks: Manual provider for production gaps, Mock provider for development
  and tests.

Persist only daily summaries needed for coaching. Do not sync raw health samples
unless a future feature explicitly requires them and privacy copy is updated.

## Current Canonical Modules

- Nutrition: `mobile/src/utils/nutrition.ts` and `mobile/src/lib/nutrition/*`
- Training and race feasibility: `mobile/src/lib/training/*`
- Coaching, readiness, strain, load, weekly adjustment:
  `mobile/src/lib/coaching/*`
- AI prompt/schema contracts: `mobile/src/lib/ai/*`
- Health providers: `mobile/src/lib/health/*`

Root `js/domain/*` is frozen legacy origin. Keep its tests green, but do not add
product features there.
