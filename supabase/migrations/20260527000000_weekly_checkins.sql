-- Migration to add weekly_checkins table and update delete_user_account_data
create table if not exists public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  week_start_date date not null,
  weight_kg numeric,
  adherence numeric not null,
  energy_level integer,
  hunger_level integer,
  completed_sessions integer,
  planned_sessions integer,
  notes text,
  kcal_delta integer not null default 0,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start_date)
);

alter table public.weekly_checkins enable row level security;

drop policy if exists "Users can manage own weekly checkins" on public.weekly_checkins;
create policy "Users can manage own weekly checkins"
on public.weekly_checkins for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Update delete_user_account_data to also clean up weekly checkins
create or replace function public.delete_user_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
