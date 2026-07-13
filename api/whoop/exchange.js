// Vercel serverless funkce — Whoop OAuth code → token exchange.
// Stejný pattern jako api/strava/exchange.js, jen jiný provider.
//
// Setup:
//   1. Register app at https://developer.whoop.com/
//   2. Set redirect URL = https://nutri-fit-omega.vercel.app/whoop-callback.html
//   3. Set Vercel env: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET

const { method, requireUser, sendError, isAllowedRedirectUri, rateLimit } = require('../_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  if (!(await requireUser(req, res))) return;
  if (!(await rateLimit(req, res, 'oauth-exchange', 10))) return;

  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return sendError(res, 500, 'missing_whoop_credentials', 'WHOOP_CLIENT_ID nebo WHOOP_CLIENT_SECRET není nastavený.');
  }

  const { code, redirectUri } = req.body || {};
  if (!code || typeof code !== 'string') {
    return sendError(res, 400, 'missing_code', 'Chybí parametr `code`.');
  }
  if (!redirectUri) {
    return sendError(res, 400, 'missing_redirect_uri', 'Chybí `redirectUri` — musí přesně sedět s URL co Whoop appka má v dashboardu.');
  }
  if (!isAllowedRedirectUri(redirectUri)) {
    return sendError(res, 400, 'invalid_redirect_uri', 'Neplatná `redirectUri`.');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
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
    return sendError(res, whoopRes.status || 500, 'whoop_exchange_failed', data?.error_description || data?.error || 'Whoop token exchange selhalo.');
  }

  return res.status(200).json({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    // Whoop vrací expires_in (sekundy) místo expires_at — přepočítáme.
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    scope: data.scope,
  });
};
