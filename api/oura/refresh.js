// Oura refresh token endpoint.
// POST { refreshToken } → { accessToken, refreshToken (rotated), expiresAt }

const { method, requireUser, sendError, rateLimit } = require('../_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  if (!(await requireUser(req, res))) return;
  if (!(await rateLimit(req, res, 'oauth-refresh', 20))) return;

  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return sendError(res, 500, 'missing_oura_credentials', 'OURA credentials nejsou nastavené.');
  }

  const { refreshToken } = req.body || {};
  if (!refreshToken) return sendError(res, 400, 'missing_refresh_token', 'Chybí `refreshToken`.');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();

  let oRes;
  try {
    oRes = await fetch('https://api.ouraring.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    return sendError(res, 502, 'oura_unreachable', 'Oura API není dostupná.');
  }

  const data = await oRes.json().catch(() => null);
  if (!oRes.ok || !data?.access_token) {
    return sendError(res, oRes.status || 500, 'oura_refresh_failed', data?.error_description || 'Refresh selhal.');
  }

  return res.status(200).json({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in || 86400) * 1000).toISOString(),
  });
};
