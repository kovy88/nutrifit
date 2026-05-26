# Store Review Checklist

- [ ] Run Supabase migration `20260526120000_store_readiness.sql`.
- [ ] Set Vercel env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`, optional `BREVO_API_KEY`, `SUPPORT_EMAIL`.
- [ ] Verify `/delete-account.html` is reachable without login.
- [ ] Verify mobile Profile can export data and delete a logged-in account.
- [ ] Confirm mobile build contains no Stripe checkout, portal, or external purchase CTA.
- [ ] Capture phone screenshots for onboarding, Dnes, Jídelníček, Foto, Profil.
- [ ] Fill Data Safety/App Privacy with profile data, auth identifiers, photos submitted for AI analysis, analytics only where applicable.
- [ ] Add health disclaimer to store description and in-app Profile compliance card.
- [ ] Test Android release build and iOS release build before submission.
