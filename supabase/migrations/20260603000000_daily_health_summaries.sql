-- Daily aggregate health summaries for the mobile coach.
-- Stores only coaching-level daily summaries, not raw health samples.

create table if not exists public.daily_health_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  summary_date date not null,
  activity jsonb,
  sleep jsonb,
  resting_heart_rate jsonb,
  hrv jsonb,
  latest_weight jsonb,
  workouts jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  completeness jsonb not null default '{}'::jsonb,
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, summary_date)
);

alter table public.daily_health_summaries enable row level security;

drop policy if exists "Users can manage own daily health summaries" on public.daily_health_summaries;
create policy "Users can manage own daily health summaries"
on public.daily_health_summaries for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.delete_user_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.daily_health_summaries where user_id = p_user_id;
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
