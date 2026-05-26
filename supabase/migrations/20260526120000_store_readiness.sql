-- Store readiness support for the native mobile app.
-- Run in Supabase SQL editor or via Supabase CLI before submitting mobile builds.

create extension if not exists pgcrypto;

create table if not exists public.api_rate_limits (
  bucket text not null,
  subject text not null,
  window_start timestamptz not null default now(),
  count integer not null default 0,
  primary key (bucket, subject)
);

alter table public.api_rate_limits enable row level security;

create or replace function public.increment_api_rate_limit(
  p_bucket text,
  p_subject text,
  p_window_seconds integer,
  p_max_hits integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.api_rate_limits%rowtype;
begin
  insert into public.api_rate_limits(bucket, subject, window_start, count)
  values (p_bucket, p_subject, v_now, 1)
  on conflict (bucket, subject) do update
    set
      window_start = case
        when public.api_rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
          then v_now
        else public.api_rate_limits.window_start
      end,
      count = case
        when public.api_rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
          then 1
        else public.api_rate_limits.count + 1
      end
  returning * into v_row;

  return v_row.count <= p_max_hits;
end;
$$;

create table if not exists public.daily_food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  log_date date not null default current_date,
  source text not null default 'manual',
  food_name text not null,
  meal_type text,
  planned_meal_id text,
  portion_guess text,
  kcal integer not null default 0,
  protein integer not null default 0,
  carbs integer not null default 0,
  fat integer not null default 0,
  confidence text,
  note text,
  eaten_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.daily_food_logs add column if not exists meal_type text;
alter table public.daily_food_logs add column if not exists planned_meal_id text;
alter table public.daily_food_logs add column if not exists eaten_at timestamptz not null default now();
alter table public.daily_food_logs add column if not exists updated_at timestamptz not null default now();

create table if not exists public.daily_meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  plan_date date not null default current_date,
  meals jsonb not null default '[]'::jsonb,
  total_kcal integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table if not exists public.daily_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  target_date date not null default current_date,
  kcal integer not null default 0,
  protein integer not null default 0,
  carbs integer not null default 0,
  fat integer not null default 0,
  fiber integer not null default 0,
  bmr integer not null default 0,
  tdee integer not null default 0,
  water_goal_ml integer not null default 0,
  weight_kg numeric,
  goal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_date)
);

alter table public.daily_targets add column if not exists bmr integer not null default 0;
alter table public.daily_targets add column if not exists tdee integer not null default 0;

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  log_date date not null default current_date,
  amount_ml integer not null default 0,
  goal_ml integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  entry_date date not null default current_date,
  weight_kg numeric not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

alter table public.daily_food_logs enable row level security;
alter table public.daily_meal_plans enable row level security;
alter table public.daily_targets enable row level security;
alter table public.water_logs enable row level security;
alter table public.weight_entries enable row level security;

drop policy if exists "Users can read own daily food logs" on public.daily_food_logs;
create policy "Users can read own daily food logs"
on public.daily_food_logs for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own daily food logs" on public.daily_food_logs;
create policy "Users can insert own daily food logs"
on public.daily_food_logs for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own daily food logs" on public.daily_food_logs;
create policy "Users can update own daily food logs"
on public.daily_food_logs for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own daily food logs" on public.daily_food_logs;
create policy "Users can delete own daily food logs"
on public.daily_food_logs for delete
using (auth.uid() = user_id);

drop policy if exists "Users can manage own daily meal plans" on public.daily_meal_plans;
create policy "Users can manage own daily meal plans"
on public.daily_meal_plans for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own daily targets" on public.daily_targets;
create policy "Users can manage own daily targets"
on public.daily_targets for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own water logs" on public.water_logs;
create policy "Users can manage own water logs"
on public.water_logs for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own weight entries" on public.weight_entries;
create policy "Users can manage own weight entries"
on public.weight_entries for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.delete_user_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.weight_entries where user_id = p_user_id;
  delete from public.water_logs where user_id = p_user_id;
  delete from public.daily_targets where user_id = p_user_id;
  delete from public.daily_meal_plans where user_id = p_user_id;
  delete from public.daily_food_logs where user_id = p_user_id;
  delete from public.meal_history where user_id = p_user_id;
  delete from public.profiles where user_id = p_user_id;
end;
$$;
