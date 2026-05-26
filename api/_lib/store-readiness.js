const PROD_ORIGINS = [
  'https://nutri-fit-omega.vercel.app',
];

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const fallbackHits = new Map();

function setCors(req, res) {
  const origin = req.headers.origin;
  if (PROD_ORIGINS.includes(origin) || LOCAL_ORIGIN_RE.test(origin || '')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function method(req, res, allowed) {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return false;
  }
  if (!allowed.includes(req.method)) {
    res.status(405).json({ error: { code: 'method_not_allowed', message: 'Method not allowed' } });
    return false;
  }
  return true;
}

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}

function getBearerToken(req) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

async function getRequester(req) {
  const token = getBearerToken(req);
  if (!token) return { token: null, user: null };

  const supabaseUrl = process.env.SUPABASE_URL || 'https://gjkbtpfpgigifapjpaci.supabase.co';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) return { token, user: null };

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return { token, user: null };
  const user = await response.json();
  return { token, user };
}

async function requireUser(req, res) {
  const requester = await getRequester(req);
  if (!requester.user?.id) {
    sendError(res, 401, 'auth_required', 'Přihlaš se prosím znovu.');
    return null;
  }
  return requester;
}

function fallbackRateLimit(key, windowMs, max) {
  const now = Date.now();
  const entry = fallbackHits.get(key);
  if (!entry || now - entry.start > windowMs) {
    fallbackHits.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

async function rateLimit(req, res, bucket, max, windowMs = 60 * 60 * 1000) {
  const ip = getClientIp(req);
  const requester = await getRequester(req);
  const subject = requester.user?.id || ip;
  const key = `${bucket}:${subject}`;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (supabaseUrl && serviceKey) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/increment_api_rate_limit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          p_bucket: bucket,
          p_subject: subject,
          p_window_seconds: Math.ceil(windowMs / 1000),
          p_max_hits: max,
        }),
      });
      if (response.ok) {
        const allowed = await response.json();
        if (!allowed) {
          sendError(res, 429, 'rate_limited', 'Příliš mnoho požadavků. Zkus to za chvíli.');
          return false;
        }
        return true;
      }
    } catch {
      // Fall through to local fallback so development and partial env setup keep working.
    }
  }

  if (fallbackRateLimit(key, windowMs, max)) {
    sendError(res, 429, 'rate_limited', 'Příliš mnoho požadavků. Zkus to za chvíli.');
    return false;
  }
  return true;
}

async function supabaseRest(path, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL nebo SUPABASE_SERVICE_KEY není nastavený.');
  }
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Supabase request failed (${response.status})`);
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

module.exports = {
  method,
  sendError,
  rateLimit,
  requireUser,
  getRequester,
  supabaseRest,
};
