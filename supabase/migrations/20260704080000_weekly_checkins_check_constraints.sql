-- weekly_checkins had no bounds on any of its subjective/ratio columns —
-- the app enforces these via TypeScript's SubjectiveLevel (1..5) type and
-- a 0..1 adherence ratio, but nothing stopped a malformed client request
-- from writing e.g. energy_level = 999 or adherence = -5 straight through
-- Supabase's REST API (RLS controls *who* can write, not *what* values).
--
-- Added NOT VALID so this doesn't fail (or lock the table scanning every
-- existing row) if any pre-existing data happens to violate it — new
-- rows are still checked immediately. Run VALIDATE CONSTRAINT separately
-- once any historical violations (if any) have been cleaned up.
--
-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so this guards manually
-- via pg_constraint to keep the migration re-runnable.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'weekly_checkins_adherence_range') then
    alter table public.weekly_checkins
      add constraint weekly_checkins_adherence_range
      check (adherence >= 0 and adherence <= 1) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'weekly_checkins_energy_level_range') then
    alter table public.weekly_checkins
      add constraint weekly_checkins_energy_level_range
      check (energy_level is null or (energy_level >= 1 and energy_level <= 5)) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'weekly_checkins_hunger_level_range') then
    alter table public.weekly_checkins
      add constraint weekly_checkins_hunger_level_range
      check (hunger_level is null or (hunger_level >= 1 and hunger_level <= 5)) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'weekly_checkins_soreness_level_range') then
    alter table public.weekly_checkins
      add constraint weekly_checkins_soreness_level_range
      check (soreness_level is null or (soreness_level >= 1 and soreness_level <= 5)) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'weekly_checkins_completed_sessions_range') then
    alter table public.weekly_checkins
      add constraint weekly_checkins_completed_sessions_range
      check (completed_sessions is null or completed_sessions >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'weekly_checkins_planned_sessions_range') then
    alter table public.weekly_checkins
      add constraint weekly_checkins_planned_sessions_range
      check (planned_sessions is null or planned_sessions >= 0) not valid;
  end if;
end $$;
