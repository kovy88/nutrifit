# Monetization & launch readiness (Trenr Premium)

The app monetizes via an **auto-renewing subscription** ("Trenr Premium") that
unlocks the AI Coach (beyond the free teaser), AI meal-plan generation and the
food-photo analysis. Everything is wired in code behind a provider abstraction;
turning on real charging is configuration + a native build (no code changes).

## What's already done (in code)

- **Subscription abstraction** — `mobile/src/lib/subscription/`
  - `SubscriptionProvider` interface: `configure / getOfferings / getStatus / purchase / restore`.
  - `RevenueCatSubscriptionProvider` — real billing via `react-native-purchases` (loaded with a dynamic import, so the app builds/tests without the package).
  - `MockSubscriptionProvider` — dev / Expo Go / no-keys fallback that persists a local flag so the full paywall + gating flow works without a store.
  - `factory.ts` picks RevenueCat automatically when an API key is set, else Mock.
- **Wiring** — `context/TrenrContext.tsx` exposes `purchaseSubscription`, `restoreSubscription`, `subscriptionPackages`, reconciles the live entitlement on launch, and caches it locally for offline.
- **Paywall** — `components/PaywallModal.tsx` runs a real purchase + **Restore purchases**; gated on Coach (after a 3-reply free teaser), meal generation and photo analysis.
- **Entitlement id** the code checks: **`premium`** (`PREMIUM_ENTITLEMENT`).
- **Default product ids** (placeholders, used by the mock + as a hint): `trenr_premium_monthly`, `trenr_premium_yearly`.

## What you must do to actually charge money

1. **Developer accounts**: Apple Developer Program ($99/yr) and/or Google Play Console ($25 once).
2. **Create the subscription products** in App Store Connect (Subscriptions) and Google Play (Subscriptions):
   - `trenr_premium_monthly` and `trenr_premium_yearly` (or your own ids — then update `FALLBACK_PACKAGES` / RevenueCat mapping). Add a 7-day free trial intro offer if you want (the paywall copy mentions it).
3. **RevenueCat** (free tier is fine to start) — https://www.revenuecat.com:
   - Create a project; add an iOS app + Android app; paste the App Store / Play credentials.
   - Create an **Entitlement** with identifier **`premium`**.
   - Add your two products and attach them to the `premium` entitlement.
   - Create an **Offering** (e.g. `default`) with a **monthly** and **yearly** package.
4. **Install the SDK**: `cd mobile && npx expo install react-native-purchases`.
5. **Set the API keys** (RevenueCat → Project → API keys → *public* SDK keys) in `mobile/.env`:
   ```
   EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxx
   EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxx
   ```
6. **Build natively** (the SDK is native — not available in Expo Go):
   `eas build --profile development` (or production). Run on a device.
7. **Test** with App Store **sandbox** / Play **license testers**: purchase, kill app, **Restore**, verify the entitlement unlocks across reinstalls.

No code change is needed for the above — the factory switches from Mock to
RevenueCat as soon as a key is present in a native build.

## Pricing
Real prices come from the store at runtime (RevenueCat offerings). The strings in
`FALLBACK_PACKAGES` and the marketing copy in `PaywallModal` are only shown when
live offerings can't load (Expo Go / offline). Keep store prices and copy in sync,
or wire `subscriptionPackages` prices into the paywall cards (small follow-up).

## Store-listing / legal checklist (required to ship)
- [ ] App icon + splash + screenshots (per device sizes) — `mobile/app.json` assets.
- [ ] Bundle id / package name, version, build number in `mobile/app.json` / `eas.json`.
- [ ] Privacy policy + Terms URLs (already linked in Settings → legal).
- [ ] Auto-renew disclosure on the paywall (present) + Restore purchases (wired).
- [ ] App Privacy "nutrition labels" (data collected: health/nutrition, account email).
- [ ] HealthKit usage strings + entitlement if you ship Apple Health (see `settings.iosInstrMsg`).
- [ ] Account deletion path (present: Settings → delete account) — required by Apple.

## Web (Stripe) channel — built, currently dormant
The web landing is marketing-only, but a Stripe path exists to sell on the web later
(no Apple/Google cut): `api/create-checkout.js`, `api/create-portal.js`,
`api/stripe-webhook.js` (the webhook writes `profiles.is_premium` in Supabase, keyed by
`supabase_user_id`). It stays **inert until** `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` /
`STRIPE_WEBHOOK_SECRET` are set AND a web page calls `/api/create-checkout`. To make a
web purchase also unlock the mobile app, have the app read `profiles.is_premium` from
Supabase and merge it with the RevenueCat entitlement. Until then, **mobile IAP
(RevenueCat) is the only active channel.**

## Optional hardening (post-launch)
- Server-side entitlement sync: RevenueCat webhook → Supabase, so the backend
  also knows who's premium (e.g. for any server features). Not required — the SDK
  validates receipts and the app reads the entitlement directly.
