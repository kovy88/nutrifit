// Vercel serverless funkce — výměna Strava OAuth authorization code za token.
//
// Volá se z mobile po Strava redirect: POST { code }.
// Vrátíme: { accessToken, refreshToken, expiresAt (ISO), athlete: { id, firstname, ... } }
//
// CLIENT_SECRET je v env, NIKDY se nedostane do mobile bundle.
// Setup:
//   1. Registruj appku na https://www.strava.com/settings/api
//   2. Authorization Callback Domain = "nutri-fit-omega.vercel.app"
//      (Strava dovoluje JEN https domain, ne deep link scheme — mobile pak
//       redirectne přes hosted bridge na nutrifit://strava/callback)
//   3. Set env vars na Vercelu:
//      STRAVA_CLIENT_ID = <číslo>
//      STRAVA_CLIENT_SECRET = <40-znaků hex>

const { method, requireUser, sendError, rateLimit } = require('../_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  if (!(await requireUser(req, res))) return;
  if (!(await rateLimit(req, res, 'oauth-exchange', 10))) return;

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return sendError(res, 500, 'missing_strava_credentials', 'STRAVA_CLIENT_ID nebo STRAVA_CLIENT_SECRET není nastavený.');
  }

  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return sendError(res, 400, 'missing_code', 'Chybí parametr `code` z OAuth callbacku.');
  }

  let stravaRes;
  try {
    stravaRes = await fetch('https://www.strava.com/api/v3/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    });
  } catch (err) {
    return sendError(res, 502, 'strava_unreachable', 'Strava API není dostupná. Zkus to znovu za chvíli.');
  }

  const data = await stravaRes.json().catch(() => null);
  if (!stravaRes.ok || !data || !data.access_token) {
    return sendError(res, stravaRes.status || 500, 'strava_exchange_failed', data?.message || 'Strava token exchange selhalo.');
  }

  return res.status(200).json({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000).toISOString(),
    scope: data.scope,
    athlete: data.athlete ? {
      id: data.athlete.id,
      firstname: data.athlete.firstname,
      lastname: data.athlete.lastname,
    } : null,
  });
};
