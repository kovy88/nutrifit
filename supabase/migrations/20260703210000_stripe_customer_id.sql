-- Store the Stripe customer id on the profile so create-portal.js can look
-- it up directly instead of searching Stripe by email (fragile: a user can
-- end up with more than one Stripe Customer sharing the same email, and
-- customers.list() gives no ordering guarantee about which one comes back).

alter table if exists public.profiles
  add column if not exists stripe_customer_id text;
