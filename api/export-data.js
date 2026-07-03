const { method, requireUser, sendError, supabaseRest, msg, rateLimit } = require('./_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;

  const requester = await requireUser(req, res);
  if (!requester) return;
  if (!(await rateLimit(req, res, 'export-data', 5))) return;

  try {
    const userId = requester.user.id;
    const [
      profiles,
      history,
      plans,
      targets,
      foodLogs,
      waterLogs,
      weightEntries,
      weeklyCheckins,
      trainingCompletions,
      coachThreads,
      dailyCoachRecommendations,
      dailyHealthSummaries,
    ] = await Promise.all([
      supabaseRest(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`),
      supabaseRest(`/rest/v1/meal_history?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc`),
      supabaseRest(`/rest/v1/daily_meal_plans?user_id=eq.${encodeURIComponent(userId)}&select=*&order=plan_date.desc`),
      supabaseRest(`/rest/v1/daily_targets?user_id=eq.${encodeURIComponent(userId)}&select=*&order=target_date.desc`),
      supabaseRest(`/rest/v1/daily_food_logs?user_id=eq.${encodeURIComponent(userId)}&select=*&order=log_date.desc`),
      supabaseRest(`/rest/v1/water_logs?user_id=eq.${encodeURIComponent(userId)}&select=*&order=log_date.desc`),
      supabaseRest(`/rest/v1/weight_entries?user_id=eq.${encodeURIComponent(userId)}&select=*&order=entry_date.desc`),
      supabaseRest(`/rest/v1/weekly_checkins?user_id=eq.${encodeURIComponent(userId)}&select=*&order=week_start_date.desc`),
      supabaseRest(`/rest/v1/training_completions?user_id=eq.${encodeURIComponent(userId)}&select=*&order=completion_date.desc`),
      supabaseRest(`/rest/v1/coach_threads?user_id=eq.${encodeURIComponent(userId)}&select=*&order=thread_date.desc`),
      supabaseRest(`/rest/v1/daily_coach_recommendations?user_id=eq.${encodeURIComponent(userId)}&select=*&order=recommendation_date.desc`),
      supabaseRest(`/rest/v1/daily_health_summaries?user_id=eq.${encodeURIComponent(userId)}&select=*&order=summary_date.desc`),
    ]);

    return res.status(200).json({
      exportedAt: new Date().toISOString(),
      user: {
        id: userId,
        email: requester.user.email,
      },
      profile: profiles?.[0] || null,
      mealHistory: history || [],
      dailyMealPlans: plans || [],
      dailyTargets: targets || [],
      dailyFoodLogs: foodLogs || [],
      waterLogs: waterLogs || [],
      weightEntries: weightEntries || [],
      weeklyCheckins: weeklyCheckins || [],
      trainingCompletions: trainingCompletions || [],
      coachThreads: coachThreads || [],
      dailyCoachRecommendations: dailyCoachRecommendations || [],
      dailyHealthSummaries: dailyHealthSummaries || [],
    });
  } catch (err) {
    return sendError(res, 500, 'export_failed', err.message || msg(req, 'Export dat se nepodařil.', 'Data export failed.'));
  }
};
