// Garmin refresh token endpoint.
// POST { refreshToken } → { accessToken, refreshToken (rotated), expiresAt }

const { method, requireUser, sendError, rateLimit } = require('../_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  if (!(await requireUser(req, res))) return;
  if (!(await rateLimit(req, res, 'oauth-refresh', 20))) return;

  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return sendError(res, 500, 'missing_garmin_credentials', 'GARMIN credentials nejsou nastavené.');
  }

  const { refreshToken } = req.body || {};
  if (!refreshToken) return sendError(res, 400, 'missing_refresh_token', 'Chybí `refreshToken`.');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  }).toString();

  let gRes;
  try {
    gRes = await fetch('https://diauth.garmin.com/di-oauth2-service/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    return sendError(res, 502, 'garmin_unreachable', 'Garmin API není dostupná.');
  }

  const data = await gRes.json().catch(() => null);
  if (!gRes.ok || !data?.access_token) {
    return sendError(res, gRes.status || 500, 'garmin_refresh_failed', data?.error_description || 'Refresh selhal.');
  }

  return res.status(200).json({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in || 86400) * 1000).toISOString(),
  });
};
