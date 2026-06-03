-- Phase 2 beta sync tables for NutriPlan mobile.

alter table if exists public.daily_food_logs
  add column if not exists client_id text;

create unique index if not exists daily_food_logs_user_client_id_idx
  on public.daily_food_logs(user_id, client_id)
  where client_id is not null;

alter table if exists public.profiles
  add column if not exists profile jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.training_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  completion_date date not null,
  status text not null check (status in ('completed', 'skipped', 'adjusted')),
  planned_session jsonb,
  actual_duration_minutes integer,
  actual_distance_km numeric,
  rpe integer check (rpe is null or (rpe >= 1 and rpe <= 10)),
  note text,
  source text not null default 'manual',
  paired_workout_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, completion_date)
);

create table if not exists public.coach_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  thread_date date not null,
  messages jsonb not null default '[]'::jsonb,
  memory jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, thread_date)
);

create table if not exists public.daily_coach_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  recommendation_date date not null,
  recommendation jsonb not null,
  memory jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, recommendation_date)
);

alter table public.training_completions enable row level security;
alter table public.coach_threads enable row level security;
alter table public.daily_coach_recommendations enable row level security;

drop policy if exists "Users can manage own training completions" on public.training_completions;
create policy "Users can manage own training completions"
on public.training_completions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own coach threads" on public.coach_threads;
create policy "Users can manage own coach threads"
on public.coach_threads for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own daily coach recommendations" on public.daily_coach_recommendations;
create policy "Users can manage own daily coach recommendations"
on public.daily_coach_recommendations for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.delete_user_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.daily_coach_recommendations where user_id = p_user_id;
  delete from public.coach_threads where user_id = p_user_id;
  delete from public.training_completions where user_id = p_user_id;
  delete from public.weekly_checkins where user_id = p_user_id;
  delete from public.weight_entries where user_id = p_user_id;
  delete from public.water_logs where user_id = p_user_id;
  delete from public.daily_targets where user_id = p_user_id;
  delete from public.daily_meal_plans where user_id = p_user_id;
  delete from public.daily_food_logs where user_id = p_user_id;
  delete from public.meal_history where user_id = p_user_id;
  delete from public.profiles where user_id = p_user_id;
end;
$$;
