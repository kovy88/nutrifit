// Vercel serverless funkce — Oura OAuth code → token exchange.
// Setup:
//   1. Register app at https://cloud.ouraring.com/oauth/applications
//      - Redirect URL: https://nutri-fit-omega.vercel.app/oura-callback.html
//      - Scopes: email personal daily heartrate workout tag session
//                spo2 ring_configuration
//   2. Set Vercel env: OURA_CLIENT_ID + OURA_CLIENT_SECRET

const { method, requireUser, sendError, isAllowedRedirectUri, rateLimit } = require('../_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  if (!(await requireUser(req, res))) return;
  if (!(await rateLimit(req, res, 'oauth-exchange', 10))) return;

  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return sendError(res, 500, 'missing_oura_credentials', 'OURA_CLIENT_ID nebo OURA_CLIENT_SECRET není nastavený.');
  }

  const { code, redirectUri } = req.body || {};
  if (!code) return sendError(res, 400, 'missing_code', 'Chybí `code`.');
  if (!redirectUri) return sendError(res, 400, 'missing_redirect_uri', 'Chybí `redirectUri`.');
  if (!isAllowedRedirectUri(redirectUri)) return sendError(res, 400, 'invalid_redirect_uri', 'Neplatná `redirectUri`.');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
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
    return sendError(res, oRes.status || 500, 'oura_exchange_failed', data?.error_description || data?.error || 'Oura token exchange selhalo.');
  }

  return res.status(200).json({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in || 86400) * 1000).toISOString(),
    scope: data.scope,
  });
};
