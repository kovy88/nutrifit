# Data Safety / App Privacy Notes

Use these notes when filling Google Play Data Safety and Apple App Privacy.

## Data Collected
- Account identifiers: e-mail, Supabase user ID.
- User-provided profile: age, gender, height, weight, activity level, diet goal, food preferences, allergies/avoidances.
- User content: generated meal plans, manual food logs, optional food photos sent for AI analysis.
- Diagnostics/usage: API rate limit identifiers and basic server logs from Vercel/Supabase.

## Purpose
- App functionality: macro calculation, meal planning, food logging, account sync.
- Fraud/abuse prevention: API rate limiting.
- Analytics: web Google Analytics only after cookie consent; mobile v1 does not add mobile analytics SDK.

## Sharing / Third Parties
- Supabase: authentication and database.
- Vercel: hosting and serverless API.
- Google Gemini API: AI meal generation and food photo analysis.
- Stripe: web-only subscription payments, not used for mobile in-app purchases.
- Brevo: optional deletion request/support e-mail handling if configured.

## Retention / Deletion
- Logged-in users can delete account data in the mobile Profile screen.
- Public deletion request URL: https://nutri-fit-omega.vercel.app/delete-account.html
- Account profile, meal history, and daily logs are deleted through `delete_user_account_data`.
