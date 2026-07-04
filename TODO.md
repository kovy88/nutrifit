# TODO — Wearable / health-source integrations

Tracking doc for the gap between what `APP_STORE.md` used to claim and what
actually works today (2026-07-04). App Store copy was toned down to match
reality in the meantime — this file tracks closing that gap for real.

## Status by source

- **Apple Health** — done. `AppleHealthProvider.ts` reads real HealthKit data
  (steps, HRV, sleep, resting HR, body weight, workouts).
- **Strava** — done. `StravaProvider.ts` reads real workouts via the Strava API.
- **Oura** — OAuth connect works end-to-end (backend exchange/refresh,
  `OuraOAuth.ts`, `useOuraConnect` hook, wired into Settings) and a token gets
  stored — but there's no `OuraProvider.ts` at all, so nothing ever reads
  sleep/HRV/readiness from Oura's API. **Needs:** a `HealthDataProvider`
  implementation against Oura's REST API (see `INTEGRATIONS.md` for the
  endpoint list already scoped out).
- **WHOOP** — same OAuth-connect situation as Oura, but `WhoopProvider.ts`
  does exist as a skeleton. Every data method (`getSleepSummary`,
  `getLatestHrv`, `getLatestRestingHeartRate`, `getRecoveryInputs`,
  `getWorkoutSummaries`, `getLatestBodyWeight`) is an unimplemented stub
  returning `[]`/`null` — see the `TODO(whoop)` comments in that file for the
  exact endpoint each one needs.
- **Garmin** — same as Oura: OAuth connect works, no `GarminProvider.ts` yet.
  Requires Garmin Connect Developer Program approval (~2 week review) before
  it's testable against the real API — see `INTEGRATIONS.md` section 5.
- **Android (Health Connect)** — `HealthConnectProvider.ts` is entirely
  `TODO(android)` stubs too. Nothing reads real data on Android yet
  regardless of source; even a Zepp→Health Connect sync wouldn't surface
  in-app until this one has a real implementation.

## Amazfit / Zepp (incl. Helio Strap) — user request

No dedicated OAuth integration needed — same approach as Suunto, documented
in `INTEGRATIONS.md` section 6 ("VIA NATIVE BRIDGE"):
- **iOS**: turn on Health sync in the Zepp app → data lands in Apple Health →
  `AppleHealthProvider` should already pick it up today, since that
  provider is a real implementation. Worth a manual confirmation pass once
  a Helio Strap is in hand — Zepp's HealthKit writes need to actually cover
  the fields we read (sleep, HRV, resting HR, workouts).
- **Android**: same idea via Health Connect, but blocked on
  `HealthConnectProvider.ts` actually being implemented (see above) —
  syncing Zepp → Health Connect won't do anything in-app until then.

## Suggested order

1. Oura `HealthDataProvider` (OAuth already works, REST API is well-documented,
   no external approval process needed — likely the fastest real integration).
2. `HealthConnectProvider.ts` real implementation (unblocks Android entirely —
   Health Connect aggregates Garmin/Samsung/Zepp/Withings/Polar Flow, so this
   one change covers many Android wearables at once, not just one brand).
3. WHOOP data methods (OAuth already works, `WhoopProvider.ts` skeleton and
   endpoint list already scoped in the file's own comments).
4. Garmin `HealthDataProvider` (gate on developer program approval — kick
   off that application early since it's the long pole, not the coding).
5. Once (1)-(4) ship, restore the fuller "connect Oura/WHOOP/Garmin" claim
   in `APP_STORE.md`.
