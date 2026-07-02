-- daily_food_logs is the one user-data table without a unique(user_id, date)
-- constraint (multiple log entries per day are expected), so unlike every
-- other date-keyed table it has no implicit composite index covering
-- log_date. It already has (user_id, client_id) from beta_coach_sync.sql,
-- which doesn't help queries that filter by user and order by log_date
-- (export-data.js, daily sync range reads).
create index if not exists daily_food_logs_user_log_date_idx
  on public.daily_food_logs (user_id, log_date desc);
