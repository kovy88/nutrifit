-- Waitlist for the NutriPlan landing page.
-- Writes happen only via the service-role API endpoint (api/waitlist.js):
-- RLS is enabled with NO anon/authenticated policies, so the table is closed to
-- the public API key; the service role bypasses RLS.

create table if not exists public.waitlist (
  email      text primary key,
  source     text,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Defensive: ensure neither anon nor authenticated roles can read/write directly.
revoke all on public.waitlist from anon, authenticated;
