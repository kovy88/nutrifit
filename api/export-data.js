const { method, requireUser, sendError, supabaseRest } = require('./_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;

  const requester = await requireUser(req, res);
  if (!requester) return;

  try {
    const userId = requester.user.id;
    const [profiles, history, plans, targets, foodLogs, waterLogs, weightEntries] = await Promise.all([
      supabaseRest(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`),
      supabaseRest(`/rest/v1/meal_history?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc`),
      supabaseRest(`/rest/v1/daily_meal_plans?user_id=eq.${encodeURIComponent(userId)}&select=*&order=plan_date.desc`),
      supabaseRest(`/rest/v1/daily_targets?user_id=eq.${encodeURIComponent(userId)}&select=*&order=target_date.desc`),
      supabaseRest(`/rest/v1/daily_food_logs?user_id=eq.${encodeURIComponent(userId)}&select=*&order=log_date.desc`),
      supabaseRest(`/rest/v1/water_logs?user_id=eq.${encodeURIComponent(userId)}&select=*&order=log_date.desc`),
      supabaseRest(`/rest/v1/weight_entries?user_id=eq.${encodeURIComponent(userId)}&select=*&order=entry_date.desc`),
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
    });
  } catch (err) {
    return sendError(res, 500, 'export_failed', err.message || 'Export dat se nepodařil.');
  }
};
