# TODO — Wearable / health-source integrations

Tracking doc for the gap between what `APP_STORE.md` used to claim and what
actually works today (2026-07-04). App Store copy was toned down to match
reality in the meantime — this file tracks closing that gap for real.

## Status by source

- **Apple Health** — done. `AppleHealthProvider.ts` reads real HealthKit data
  (steps, HRV, sleep, resting HR, body weight, workouts).
- **Strava** — done. `StravaProvider.ts` reads real workouts via the Strava API.
- **Oura** — done (2026-07-04). `OuraProvider.ts` reads real sleep (+HRV/RHR),
  daily activity, and workouts via `/v2/usercollection/{sleep,daily_activity,
  workout}`, plus a static profile weight via `/personal_info`. Field names
  verified against Oura's official OpenAPI spec (cross-checked two independent
  sources — no live Oura account was available to test against a real API
  response, so treat the mapping as verified-on-paper, not field-tested).
  Wired into `factory.ts`'s auto-mode composite and as an explicit `'oura'`
  mode. 17 unit tests cover token refresh and data mapping.
- **WHOOP** — done (2026-07-04). `WhoopProvider.ts` reads real sleep
  (stage-summary based), workouts, resting HR, and HRV via the v2 API
  (`/v2/activity/sleep`, `/v2/activity/workout`, `/v2/recovery`), plus a
  static profile weight via `/v2/user/measurement/body`. Note: WHOOP has
  migrated v1→v2 (v1 is being deprecated) — this targets v2 throughout,
  unlike the old skeleton's v1 base URL. HRV/RHR come from `/v2/recovery`,
  *not* `/v2/cycle` (cycle only has strain/kilojoule/heart-rate, no
  HRV/RHR) — the old skeleton's comments had this endpoint wrong. Field
  names verified against a real, maintained OSS client
  (github.com/hedgertronic/whoop) with literal example JSON in its
  docstrings — WHOOP's own tutorial pages turned out to have stale v1
  field names on at least one page, same "docs are unreliable" trap as
  Oura. No live WHOOP account was available to test against a real API
  response, so treat the mapping as verified-on-paper, not field-tested.
  18 unit tests cover token refresh, data mapping, and pagination.
- **Garmin** — same as Oura: OAuth connect works, no `GarminProvider.ts` yet.
  Requires Garmin Connect Developer Program approval (~2 week review) before
  it's testable against the real API — see `INTEGRATIONS.md` section 6.
- **Android (Health Connect)** — done (2026-07-04). `HealthConnectProvider.ts`
  reads real Health Connect data (steps, active calories, distance, workouts,
  sleep stages, resting HR, HRV, body weight) via `react-native-health-connect`.
  Field names/shapes verified against the package's own TypeScript
  declarations (source of truth over docs). Native module — requires EAS
  Build, no Expo Go/web support, so this is verified via typecheck-against-
  real-types + mocked-module unit tests (14 tests), **not** field-tested on a
  real Android device with Health Connect installed. This unblocks Garmin/
  Samsung/Zepp/Withings/Polar Flow on Android all at once, since they all
  route through Health Connect.

## Amazfit / Zepp (incl. Helio Strap) — user request

No dedicated OAuth integration needed — same approach as Suunto, documented
in `INTEGRATIONS.md` section 8 ("VIA NATIVE BRIDGE"):
- **iOS**: turn on Health sync in the Zepp app → data lands in Apple Health →
  `AppleHealthProvider` should already pick it up today, since that
  provider is a real implementation. Worth a manual confirmation pass once
  a Helio Strap is in hand — Zepp's HealthKit writes need to actually cover
  the fields we read (sleep, HRV, resting HR, workouts).
- **Android**: same idea via Health Connect — `HealthConnectProvider.ts` now
  has a real implementation (see above), so a Zepp→Health Connect sync should
  surface in-app already, same field-testing caveat as everything else in
  this file (no real device to confirm against yet).

## Suggested order

1. ~~Oura `HealthDataProvider`~~ — done 2026-07-04.
2. ~~`HealthConnectProvider.ts` real implementation~~ — done 2026-07-04.
3. ~~WHOOP data methods~~ — done 2026-07-04.
4. Garmin `HealthDataProvider` (gate on developer program approval — kick
   off that application early since it's the long pole, not the coding).
5. Once (4) ships, restore the fuller "connect Oura/WHOOP/Garmin" claim
   in `APP_STORE.md` (Oura and WHOOP specifically could arguably go back in
   sooner, once someone's confirmed the field mapping against a real account).
