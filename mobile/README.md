# NutriFit Mobile

Expo/React Native mobilní aplikace pro Google Play a App Store.

## Lokální spuštění

```bash
cd mobile
npm install
npm run start
```

Volitelné env proměnné:

```bash
EXPO_PUBLIC_API_BASE_URL=https://nutri-fit-omega.vercel.app
EXPO_PUBLIC_SUPABASE_URL=https://gjkbtpfpgigifapjpaci.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## Store policy defaults

- Mobilní v1 neobsahuje Stripe checkout ani Premium nákup.
- Smazání účtu je dostupné v appce přes `Profil` a veřejně přes `/delete-account.html`.
- Appka nepoužívá HealthKit/Health Connect a nedělá diagnostická ani léčebná tvrzení.
- Foto oprávnění se používá jen pro výběr fotografie jídla k orientačnímu AI odhadu.
