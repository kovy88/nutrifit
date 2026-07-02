// Vercel serverless funkce — Strava refresh tokenu.
//
// POST { refreshToken } → { accessToken, refreshToken (rotated), expiresAt }
//
// Strava access tokeny vyprší po 6h, refresh tokeny se občas rotují
// (vrácený `refresh_token` se musí přepsat oproti starému).

const { method, requireUser, sendError } = require('../_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  if (!(await requireUser(req, res))) return;

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return sendError(res, 500, 'missing_strava_credentials', 'STRAVA_CLIENT_ID nebo STRAVA_CLIENT_SECRET není nastavený.');
  }

  const { refreshToken } = req.body || {};
  if (!refreshToken || typeof refreshToken !== 'string') {
    return sendError(res, 400, 'missing_refresh_token', 'Chybí parametr `refreshToken`.');
  }

  let stravaRes;
  try {
    stravaRes = await fetch('https://www.strava.com/api/v3/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
  } catch {
    return sendError(res, 502, 'strava_unreachable', 'Strava API není dostupná.');
  }

  const data = await stravaRes.json().catch(() => null);
  if (!stravaRes.ok || !data || !data.access_token) {
    return sendError(res, stravaRes.status || 500, 'strava_refresh_failed', data?.message || 'Strava token refresh selhal.');
  }

  return res.status(200).json({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000).toISOString(),
  });
};
