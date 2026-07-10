-- profiles.stripe_customer_id (added in 20260703210000_stripe_customer_id.sql)
-- has no index. The current create-portal.js / stripe-webhook.js paths filter
-- by user_id (the primary key), so they don't need this — but the reverse
-- lookup (find the profile that owns a given Stripe Customer) does: webhook
-- reconciliation and the planned customer-ownership check on the email-search
-- fallback both key off the customer id, and would otherwise full-table scan.
--
-- Partial index (only non-null values): the column is null for every non-paying
-- user, so a partial index is much smaller and covers exactly the equality
-- lookups we care about. Not unique — a defensive read scan, not a constraint,
-- since historical data could in theory carry duplicate/shared customer ids.
create index if not exists idx_profiles_stripe_customer_id
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;
