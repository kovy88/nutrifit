// Harness pro testy `api/*.js` handlerů.
//
// Není to `*.test.js`, takže si ho tests/run.js nevyzvedne jako test soubor.
//
// Handlery jsou CommonJS (api/package.json → "type": "commonjs"), testy ESM.
// `import handler from '../api/x.js'` funguje (default = module.exports), ale
// POZOR: statické importy se vyhodnocují dřív než tělo modulu, takže handler,
// který nahoře dělá `require('stripe')`, se načte dřív, než mu stihneš stripe
// podstrčit. Handlery se stripe závislostí proto importuj až **dynamicky**
// po `installStripe()` — viz api-stripe-webhook.test.js.
//
// ⚠ Testy proti tomuhle harnessu piš jako `await test('…', async () => {…})`.
// tests/run.js si vrácený promise nepočká — bez `await` běží všechny async
// testy v souboru **současně**. Čistě výpočetním testům (js/domain/*) to
// nevadí, ale tenhle harness přepisuje *globální* stav (globalThis.fetch,
// process.env, stripe stub), takže by si souběžné testy navzájem přepsaly
// mocky. `await` na top-level modulu je zároveň jediné, co run.js donutí
// počkat, než soubor dokončí (run.js dělá `await import(file)`).

import { Readable } from 'node:stream';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const USER_ID = '3f1a9c7e-2b64-4d5a-9f83-1c0e7a6b4d21';
export const OTHER_USER_ID = 'a7d2e4b1-8c53-4f16-b920-6e5d3a8c1f47';

// ── fake req/res ────────────────────────────────────────────────────────────

/** Node lowercases incoming header names; napodob to, ať se testy nechytnou
 *  na tom, že handler čte `req.headers['stripe-signature']`. */
function lowerHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
}

export function makeReq({ method = 'POST', headers = {}, body } = {}) {
  return { method, headers: lowerHeaders(headers), body, socket: { remoteAddress: '203.0.113.7' } };
}

/** Req jako čitelný stream — pro handlery, které si čtou raw body ze socketu
 *  (stripe-webhook kvůli ověření podpisu). */
export function makeStreamReq({ method = 'POST', headers = {}, rawBody = Buffer.alloc(0) } = {}) {
  const req = Readable.from([Buffer.from(rawBody)]);
  req.method = method;
  req.headers = lowerHeaders(headers);
  req.socket = { remoteAddress: '203.0.113.7' };
  return req;
}

/** Fake Vercel `res` — místo zápisu do socketu si zapamatuje, co by odešlo. */
export function makeRes() {
  const res = {
    statusCode: null,
    body: undefined,
    headers: {},
    ended: false,
    setHeader(key, value) { res.headers[key] = value; return res; },
    status(code) { res.statusCode = code; return res; },
    json(payload) { res.body = payload; res.ended = true; return res; },
    end() { res.ended = true; return res; },
  };
  return res;
}

// ── fetch router ────────────────────────────────────────────────────────────

export function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

export function textResponse(text, { status = 500 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => { throw new Error('not json'); },
    text: async () => text,
  };
}

/** Nahradí globální fetch routerem. Každá route je `{ path, method?, response }`,
 *  kde `response` je buď hotová odpověď, nebo `(url, options) => odpověď`.
 *  Nenamockovaný fetch **hodí** — test tak spadne hlasitě místo toho, aby tiše
 *  odešel na síť nebo spadl do in-memory rate-limit fallbacku. */
export function installFetch(routes) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || 'GET';
    calls.push({ url: href, method, options, body: options.body ? safeParse(options.body) : undefined });
    for (const route of routes) {
      if (!href.includes(route.path)) continue;
      if (route.method && route.method !== method) continue;
      return typeof route.response === 'function' ? route.response(href, options) : route.response;
    }
    throw new Error(`Unmocked fetch: ${method} ${href}`);
  };
  return {
    calls,
    /** Volání na daný path (substring), volitelně filtrovaná metodou. */
    to(path, method) {
      return calls.filter(c => c.url.includes(path) && (!method || c.method === method));
    },
    restore() { globalThis.fetch = original; },
  };
}

function safeParse(body) {
  try { return JSON.parse(body); } catch { return body; }
}

/** PostgREST-like tabulka: respektuje `limit`/`offset` z query stringu, takže
 *  se proti ní dá testovat stránkování v supabaseRestAll.
 *  `serverMaxRows` simuluje server, který si limit sám sníží (PostgREST to dělá
 *  přes db-max-rows) — přesně ten případ, kvůli kterému supabaseRestAll posouvá
 *  offset o skutečný počet vrácených řádků, ne o vyžádanou velikost stránky. */
export function pagedTable(rows, { serverMaxRows = Infinity } = {}) {
  return url => {
    const params = new URL(url).searchParams;
    const offset = Number(params.get('offset') || 0);
    const limit = Math.min(Number(params.get('limit') || 1000), serverMaxRows);
    return jsonResponse(rows.slice(offset, offset + limit));
  };
}

// ── auth / rate limit routes ────────────────────────────────────────────────

export const AUTH_PATH = '/auth/v1/user';
export const RATE_LIMIT_PATH = '/rest/v1/rpc/increment_api_rate_limit';

/** Supabase auth odpověď pro platný token. */
export function authRoute(user = { id: USER_ID, email: 'runner@example.com' }) {
  return { path: AUTH_PATH, response: () => jsonResponse(user) };
}

/** Supabase auth odmítne token (vypršelý/neplatný). */
export function authRejectedRoute(status = 401) {
  return { path: AUTH_PATH, response: () => jsonResponse({ message: 'invalid token' }, { status }) };
}

/** rate-limit RPC vrací `true` = smíš, `false` = limit vyčerpán.
 *  Musí být namockovaný ve **všech** testech: bez něj fetch hodí, handler spadne
 *  do in-memory fallbacku, který drží stav mezi testy v jednom procesu. */
export function rateLimitRoute(allowed = true) {
  return { path: RATE_LIMIT_PATH, response: () => jsonResponse(allowed) };
}

// ── env ─────────────────────────────────────────────────────────────────────

export const BASE_ENV = {
  SUPABASE_URL: 'https://fake-project.supabase.co',
  SUPABASE_SERVICE_KEY: 'service_role_key',
  SUPABASE_ANON_KEY: 'anon_key',
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
  NEXT_PUBLIC_URL: 'https://nutri-fit-omega.vercel.app',
  // rate limit má produkční fail-closed větev; testy běží jako ne-produkce
  NODE_ENV: 'test',
  VERCEL: undefined,
};

/** Nastaví env proměnné a vrátí funkci, která vrátí původní stav. */
export function withEnv(vars = {}) {
  const merged = { ...BASE_ENV, ...vars };
  const saved = {};
  for (const [key, value] of Object.entries(merged)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

// ── stripe ──────────────────────────────────────────────────────────────────

let stripeStub = {};

/** Podstrčí `require('stripe')` továrnu, která nechá **skutečné** `webhooks`
 *  (ověření podpisu je to hlavní, co u webhooku testujeme — mockovat ho by
 *  test zbavil smyslu), ale API volání nahradí stubem z `setStripeStub`.
 *  Volej **před** prvním importem handleru, který stripe vyžaduje. */
export function installStripe() {
  const stripePath = require.resolve('stripe');
  const realStripe = require('stripe');
  const saved = require.cache[stripePath];

  const factory = secretKey => {
    const realClient = realStripe(secretKey);
    return {
      webhooks: realClient.webhooks,
      checkout: stripeStub.checkout,
      billingPortal: stripeStub.billingPortal,
      customers: stripeStub.customers,
    };
  };

  require.cache[stripePath] = {
    id: stripePath, filename: stripePath, loaded: true, exports: factory, children: [], paths: [],
  };
  return () => { require.cache[stripePath] = saved; };
}

export function setStripeStub(stub) { stripeStub = stub; }

/** Skutečný Stripe podpis pro daný payload — stejná cesta, jakou podepisuje
 *  Stripe v produkci, takže constructEvent v handleru ověřuje doopravdy. */
export function signPayload(payload, secret = BASE_ENV.STRIPE_WEBHOOK_SECRET) {
  return require('stripe')('sk_test_fake').webhooks.generateTestHeaderString({ payload, secret });
}

// ── misc ────────────────────────────────────────────────────────────────────

/** Runner nemá `toThrow`; tohle vrátí chybu, nebo null když nic nehodilo. */
export async function captureThrow(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}
