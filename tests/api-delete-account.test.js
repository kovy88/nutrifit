// api/delete-account.js — nevratná operace: smaže uživatelova data i jeho auth
// účet, bez potvrzovacího kroku. Testy hlídají hlavně to, co musí platit *dřív*,
// než se cokoli smaže: přihlášení, rate limit a správné user id.
//
// `await test(...)` je povinný, viz hlavička _api-harness.js.

import handler from '../api/delete-account.js';
import {
  USER_ID, installFetch, withEnv, makeReq, makeRes, jsonResponse, textResponse,
  authRoute, authRejectedRoute, rateLimitRoute,
} from './_api-harness.js';

const RPC_PATH = '/rest/v1/rpc/delete_user_account_data';
const ADMIN_PATH = '/auth/v1/admin/users/';

const rpcOk = { path: RPC_PATH, response: () => jsonResponse(null, { status: 204 }) };
const adminOk = { path: ADMIN_PATH, method: 'DELETE', response: () => jsonResponse({}, { status: 200 }) };

const BEARER = { authorization: 'Bearer valid-token' };

async function call({ method = 'DELETE', headers = BEARER, routes, env = {} } = {}) {
  const restoreEnv = withEnv(env);
  const fetchMock = installFetch(routes ?? [authRoute(), rateLimitRoute(true), rpcOk, adminOk]);
  const res = makeRes();
  try {
    await handler(makeReq({ method, headers }), res);
    return { res, fetch: fetchMock };
  } finally {
    fetchMock.restore();
    restoreEnv();
  }
}

/** Smazalo se cokoli? Používá se k tvrzení "tahle cesta NESMÍ nic smazat". */
function deletedAnything(fetchMock) {
  return fetchMock.to(RPC_PATH).length > 0 || fetchMock.to(ADMIN_PATH).length > 0;
}

// ── method ──────────────────────────────────────────────────────────────────

await test('povolí DELETE i POST', async () => {
  const del = await call({ method: 'DELETE' });
  expect(del.res.statusCode).toBe(200);
  const post = await call({ method: 'POST' });
  expect(post.res.statusCode).toBe(200);
});

await test('odmítne GET', async () => {
  const { res, fetch } = await call({ method: 'GET' });
  expect(res.statusCode).toBe(405);
  expect(deletedAnything(fetch)).toBe(false);
});

await test('na OPTIONS preflight odpoví 200 a nic nesmaže', async () => {
  const { res, fetch } = await call({ method: 'OPTIONS' });
  expect(res.statusCode).toBe(200);
  expect(deletedAnything(fetch)).toBe(false);
});

// ── autentizace ─────────────────────────────────────────────────────────────

await test('bez tokenu vrátí 401 a nic nesmaže', async () => {
  const { res, fetch } = await call({ headers: {} });
  expect(res.statusCode).toBe(401);
  expect(res.body.error.code).toBe('auth_required');
  expect(deletedAnything(fetch)).toBe(false);
});

await test('s neplatným tokenem vrátí 401 a nic nesmaže', async () => {
  const { res, fetch } = await call({
    routes: [authRejectedRoute(401), rateLimitRoute(true), rpcOk, adminOk],
  });
  expect(res.statusCode).toBe(401);
  expect(deletedAnything(fetch)).toBe(false);
});

// ── rate limit ──────────────────────────────────────────────────────────────

await test('při vyčerpaném rate limitu vrátí 429 a nic nesmaže', async () => {
  // Nejdůležitější test souboru: ukradený token nesmí dostat víc pokusů
  // o nevratné smazání, než kolik povolíme.
  const { res, fetch } = await call({
    routes: [authRoute(), rateLimitRoute(false), rpcOk, adminOk],
  });
  expect(res.statusCode).toBe(429);
  expect(res.body.error.code).toBe('rate_limited');
  expect(deletedAnything(fetch)).toBe(false);
});

await test('rate limit je 2 pokusy/hodinu na uživatele', async () => {
  // Regrese: limit byl zpřísněn z 5 na 2 (viz IMPROVEMENT_PLAN.md). Kdyby se
  // vrátil na 5, tenhle test spadne.
  const { fetch } = await call();
  const [rpc] = fetch.to('/rest/v1/rpc/increment_api_rate_limit');
  expect(rpc.body.p_bucket).toBe('delete-account');
  expect(rpc.body.p_max_hits).toBe(2);
  expect(rpc.body.p_window_seconds).toBe(3600);
  // Subjektem limitu je user id, ne IP — jinak by šel obejít změnou IP.
  expect(rpc.body.p_subject).toBe(USER_ID);
});

// ── happy path ──────────────────────────────────────────────────────────────

await test('smaže data uživatele i jeho auth účet a vrátí ok', async () => {
  const { res, fetch } = await call();

  expect(res.statusCode).toBe(200);
  expect(res.body.ok).toBe(true);

  const [rpc] = fetch.to(RPC_PATH);
  expect(rpc.method).toBe('POST');
  expect(rpc.body.p_user_id).toBe(USER_ID);

  const [admin] = fetch.to(ADMIN_PATH, 'DELETE');
  expect(admin.url).toContain(USER_ID);
  expect(admin.options.headers.apikey).toBe('service_role_key');
});

await test('maže data dřív, než smaže auth účet', async () => {
  // Opačné pořadí by při selhání uprostřed nechalo osiřelá data bez majitele.
  const { fetch } = await call();
  const order = fetch.calls.map(c => c.url);
  const rpcIndex = order.findIndex(u => u.includes(RPC_PATH));
  const adminIndex = order.findIndex(u => u.includes(ADMIN_PATH));
  expect(rpcIndex).toBeGreaterThanOrEqual(0);
  expect(adminIndex).toBeGreaterThan(rpcIndex);
});

// ── chybové stavy ───────────────────────────────────────────────────────────

await test('selhání mazání dat vrátí 500 a nesáhne na auth účet', async () => {
  const { res, fetch } = await call({
    routes: [
      authRoute(), rateLimitRoute(true),
      { path: RPC_PATH, response: () => textResponse('rpc boom', { status: 500 }) },
      adminOk,
    ],
  });
  expect(res.statusCode).toBe(500);
  expect(res.body.error.code).toBe('delete_failed');
  expect(fetch.to(ADMIN_PATH).length).toBe(0);
});

await test('selhání mazání auth účtu vrátí 500', async () => {
  const { res } = await call({
    routes: [
      authRoute(), rateLimitRoute(true), rpcOk,
      { path: ADMIN_PATH, method: 'DELETE', response: () => textResponse('user not found', { status: 404 }) },
    ],
  });
  expect(res.statusCode).toBe(500);
  expect(res.body.error.code).toBe('delete_failed');
  expect(res.body.error.message).toContain('user not found');
});

// ── lokalizace ──────────────────────────────────────────────────────────────

await test('chybová hláška respektuje X-Locale', async () => {
  const routes = [
    authRoute(), rateLimitRoute(true),
    { path: RPC_PATH, response: () => textResponse('', { status: 500 }) },
    adminOk,
  ];
  const restoreEnv = withEnv();
  const fetchMock = installFetch(routes);
  const res = makeRes();
  await handler(makeReq({ method: 'DELETE', headers: { ...BEARER, 'x-locale': 'en-US' } }), res);
  fetchMock.restore();
  restoreEnv();
  expect(res.body.error.message).toContain('failed');
});
