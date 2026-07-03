// Whoop refresh token endpoint.
// POST { refreshToken } → { accessToken, refreshToken (rotated), expiresAt }

const { method, requireUser, sendError, rateLimit } = require('../_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  if (!(await requireUser(req, res))) return;
  if (!(await rateLimit(req, res, 'oauth-refresh', 20))) return;

  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return sendError(res, 500, 'missing_whoop_credentials', 'WHOOP_CLIENT_ID nebo WHOOP_CLIENT_SECRET není nastavený.');
  }

  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return sendError(res, 400, 'missing_refresh_token', 'Chybí `refreshToken`.');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'offline read:recovery read:sleep read:workout read:profile read:body_measurement read:cycles',
  }).toString();

  let whoopRes;
  try {
    whoopRes = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    return sendError(res, 502, 'whoop_unreachable', 'Whoop API není dostupná.');
  }

  const data = await whoopRes.json().catch(() => null);
  if (!whoopRes.ok || !data?.access_token) {
    return sendError(res, whoopRes.status || 500, 'whoop_refresh_failed', data?.error_description || 'Refresh selhal.');
  }

  return res.status(200).json({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
  });
};
