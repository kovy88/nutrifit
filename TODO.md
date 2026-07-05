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

1. ~~Oura `HealthDataProvider`~~ — done 2026-07-04.
2. `HealthConnectProvider.ts` real implementation (unblocks Android entirely —
   Health Connect aggregates Garmin/Samsung/Zepp/Withings/Polar Flow, so this
   one change covers many Android wearables at once, not just one brand).
3. ~~WHOOP data methods~~ — done 2026-07-04.
4. Garmin `HealthDataProvider` (gate on developer program approval — kick
   off that application early since it's the long pole, not the coding).
5. Once (2) and (4) ship, restore the fuller "connect Oura/WHOOP/Garmin" claim
   in `APP_STORE.md` (Oura and WHOOP specifically could arguably go back in
   sooner, once someone's confirmed the field mapping against a real account).
