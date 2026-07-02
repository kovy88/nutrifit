// Vercel serverless funkce — Garmin Connect OAuth code → token exchange.
// Garmin používá OAuth 2.0 s PKCE (na rozdíl od Strava/Whoop).
//
// Setup:
//   1. Apply for Garmin Connect Developer Program at
//      https://developerportal.garmin.com/user/me/apps
//      (vyžaduje review + schválení, může trvat ~2 týdny)
//   2. Set Vercel env:
//      GARMIN_CLIENT_ID = <UUID>
//      GARMIN_CLIENT_SECRET = <hex string>

const { method, requireUser, sendError, isAllowedRedirectUri } = require('../_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  if (!(await requireUser(req, res))) return;

  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return sendError(res, 500, 'missing_garmin_credentials', 'GARMIN_CLIENT_ID nebo GARMIN_CLIENT_SECRET není nastavený.');
  }

  const { code, codeVerifier, redirectUri } = req.body || {};
  if (!code) return sendError(res, 400, 'missing_code', 'Chybí `code`.');
  if (!codeVerifier) return sendError(res, 400, 'missing_code_verifier', 'Chybí `codeVerifier` — Garmin PKCE.');
  if (!redirectUri) return sendError(res, 400, 'missing_redirect_uri', 'Chybí `redirectUri`.');
  if (!isAllowedRedirectUri(redirectUri)) return sendError(res, 400, 'invalid_redirect_uri', 'Neplatná `redirectUri`.');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
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
    return sendError(res, gRes.status || 500, 'garmin_exchange_failed', data?.error_description || data?.error || 'Garmin token exchange selhalo.');
  }

  return res.status(200).json({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in || 86400) * 1000).toISOString(),
    refreshExpiresAt: data.refresh_token_expires_in
      ? new Date(Date.now() + data.refresh_token_expires_in * 1000).toISOString()
      : undefined,
    scope: data.scope,
  });
};
