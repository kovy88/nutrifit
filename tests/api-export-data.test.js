// api/export-data.js — GDPR export: vrací kompletní obsah účtu v jedné odpovědi.
// Dvě věci tu můžou bolet: vrátit cizí data (PII leak) a vrátit *neúplná* data
// (tichý ořez stránkováním, kvůli kterému export vypadá hotově, ale není).
//
// `await test(...)` je povinný, viz hlavička _api-harness.js.

import handler from '../api/export-data.js';
import {
  USER_ID, installFetch, withEnv, makeReq, makeRes, jsonResponse, textResponse,
  pagedTable, authRoute, authRejectedRoute, rateLimitRoute,
} from './_api-harness.js';

const BEARER = { authorization: 'Bearer valid-token' };

/** Stránkované tabulky, které handler tahá přes supabaseRestAll. */
const TABLES = [
  'meal_history', 'daily_meal_plans', 'daily_targets', 'daily_food_logs',
  'water_logs', 'weight_entries', 'weekly_checkins', 'training_completions',
  'coach_threads', 'daily_coach_recommendations', 'daily_health_summaries',
];

const DEFAULT_PROFILE = { user_id: USER_ID, display_name: 'Runner' };

function tableRoutes(overrides = {}) {
  return [
    {
      path: '/rest/v1/profiles',
      method: 'GET',
      response: overrides.profiles ?? (() => jsonResponse([DEFAULT_PROFILE])),
    },
    ...TABLES.map(table => ({
      path: `/rest/v1/${table}`,
      method: 'GET',
      response: overrides[table] ?? pagedTable([]),
    })),
  ];
}

async function call({ method = 'GET', headers = BEARER, routes, overrides = {}, env = {} } = {}) {
  const restoreEnv = withEnv(env);
  const fetchMock = installFetch(
    routes ?? [authRoute(), rateLimitRoute(true), ...tableRoutes(overrides)],
  );
  const res = makeRes();
  try {
    await handler(makeReq({ method, headers }), res);
    return { res, fetch: fetchMock };
  } finally {
    fetchMock.restore();
    restoreEnv();
  }
}

function rows(count, prefix = 'row') {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, user_id: USER_ID }));
}

// ── method / auth / rate limit ──────────────────────────────────────────────

await test('odmítne POST', async () => {
  const { res } = await call({ method: 'POST' });
  expect(res.statusCode).toBe(405);
});

await test('bez tokenu vrátí 401 a nesáhne na data', async () => {
  const { res, fetch } = await call({ headers: {} });
  expect(res.statusCode).toBe(401);
  expect(fetch.to('/rest/v1/meal_history').length).toBe(0);
});

await test('s neplatným tokenem vrátí 401', async () => {
  const { res } = await call({ routes: [authRejectedRoute(401), rateLimitRoute(true)] });
  expect(res.statusCode).toBe(401);
});

await test('při vyčerpaném rate limitu vrátí 429 a nesáhne na data', async () => {
  const { res, fetch } = await call({ routes: [authRoute(), rateLimitRoute(false)] });
  expect(res.statusCode).toBe(429);
  expect(fetch.to('/rest/v1/meal_history').length).toBe(0);
});

await test('rate limit je 5 exportů/hodinu na uživatele', async () => {
  const { fetch } = await call();
  const [rpc] = fetch.to('/rest/v1/rpc/increment_api_rate_limit');
  expect(rpc.body.p_bucket).toBe('export-data');
  expect(rpc.body.p_max_hits).toBe(5);
  expect(rpc.body.p_subject).toBe(USER_ID);
});

// ── tvar odpovědi ───────────────────────────────────────────────────────────

await test('vrátí všechny očekávané sekce exportu', async () => {
  const { res } = await call();
  expect(res.statusCode).toBe(200);
  const keys = Object.keys(res.body).sort();
  expect(keys).toEqual([
    'coachThreads', 'dailyCoachRecommendations', 'dailyFoodLogs', 'dailyHealthSummaries',
    'dailyMealPlans', 'dailyTargets', 'exportedAt', 'mealHistory', 'profile',
    'trainingCompletions', 'user', 'waterLogs', 'weeklyCheckins', 'weightEntries',
  ]);
});

await test('vrátí identitu uživatele a časové razítko exportu', async () => {
  const { res } = await call();
  expect(res.body.user.id).toBe(USER_ID);
  expect(res.body.user.email).toBe('runner@example.com');
  // ISO 8601 — musí jít naparsovat zpátky.
  expect(Number.isNaN(Date.parse(res.body.exportedAt))).toBe(false);
});

await test('prázdné tabulky vrací jako [] a chybějící profil jako null', async () => {
  // Klient (a GDPR export) potřebuje stabilní tvar — ne undefined/null místo pole.
  const { res } = await call({ overrides: { profiles: () => jsonResponse([]) } });
  expect(res.body.profile).toBe(null);
  expect(res.body.mealHistory).toEqual([]);
  expect(res.body.waterLogs).toEqual([]);
  expect(res.body.dailyHealthSummaries).toEqual([]);
});

await test('profil bere první řádek výsledku', async () => {
  const { res } = await call();
  expect(res.body.profile.display_name).toBe('Runner');
});

// ── izolace dat (PII) ───────────────────────────────────────────────────────

await test('každý dotaz filtruje na user_id přihlášeného uživatele', async () => {
  const { fetch } = await call();
  const dataCalls = fetch.calls.filter(c => c.url.includes('/rest/v1/') && !c.url.includes('/rpc/'));
  expect(dataCalls.length).toBeGreaterThan(0);
  for (const c of dataCalls) {
    expect(c.url).toContain(`user_id=eq.${USER_ID}`);
  }
});

await test('exportuje se všech 12 zdrojů dat', async () => {
  const { fetch } = await call();
  expect(fetch.to('/rest/v1/profiles').length).toBe(1);
  for (const table of TABLES) {
    expect(fetch.to(`/rest/v1/${table}`).length).toBeGreaterThan(0);
  }
});

// ── stránkování ─────────────────────────────────────────────────────────────

await test('stránkuje přes hranici jedné stránky (2500 řádků)', async () => {
  // PostgREST ořezává počet řádků na dotaz; jednorázový dotaz by u dlouho
  // žijícího účtu export tiše uřízl.
  const { res, fetch } = await call({ overrides: { daily_food_logs: pagedTable(rows(2500, 'food')) } });

  expect(res.body.dailyFoodLogs.length).toBe(2500);
  expect(res.body.dailyFoodLogs[0].id).toBe('food-0');
  expect(res.body.dailyFoodLogs[2499].id).toBe('food-2499');
  // 3 plné/částečné stránky + 1 prázdná, která smyčku ukončí.
  expect(fetch.to('/rest/v1/daily_food_logs').length).toBe(4);
});

await test('nezacyklí se a nezduplikuje na přesném násobku stránky', async () => {
  const { res, fetch } = await call({ overrides: { meal_history: pagedTable(rows(1000, 'meal')) } });
  expect(res.body.mealHistory.length).toBe(1000);
  // 1000 řádků + prázdná stránka navíc, aby se poznal konec.
  expect(fetch.to('/rest/v1/meal_history').length).toBe(2);
});

await test('nepřijde o řádky, když si server sníží limit pod vyžádaný', async () => {
  // supabaseRest posouvá offset o skutečný počet vrácených řádků, ne o pageSize.
  // Kdyby posouval o pageSize (1000), tenhle případ by vrátil 100 z 250 řádků.
  const { res } = await call({
    overrides: { weight_entries: pagedTable(rows(250, 'w'), { serverMaxRows: 100 }) },
  });
  expect(res.body.weightEntries.length).toBe(250);
  expect(res.body.weightEntries[249].id).toBe('w-249');
});

await test('stránkované dotazy mají stabilní řazení', async () => {
  // Bez `order=` může PostgREST vracet řádky mezi stránkami v jiném pořadí —
  // export by pak některé řádky zdvojil a jiné vynechal.
  const { fetch } = await call();
  const paged = fetch.calls.filter(c => c.url.includes('offset='));
  expect(paged.length).toBeGreaterThan(0);
  for (const c of paged) {
    expect(c.url).toContain('order=');
  }
});

// ── chybové stavy ───────────────────────────────────────────────────────────

await test('selhání jedné tabulky vrátí 500 export_failed', async () => {
  // Radši nahlas selhat než uživateli podstrčit neúplný export jako kompletní.
  const { res } = await call({
    overrides: { coach_threads: () => textResponse('relation does not exist', { status: 500 }) },
  });
  expect(res.statusCode).toBe(500);
  expect(res.body.error.code).toBe('export_failed');
  expect(res.body.error.message).toContain('relation does not exist');
});

await test('chybová hláška respektuje X-Locale', async () => {
  const restoreEnv = withEnv();
  const fetchMock = installFetch([
    authRoute(), rateLimitRoute(true),
    ...tableRoutes({ coach_threads: () => textResponse('', { status: 500 }) }),
  ]);
  const res = makeRes();
  await handler(makeReq({ method: 'GET', headers: { ...BEARER, 'x-locale': 'en-GB' } }), res);
  fetchMock.restore();
  restoreEnv();
  expect(res.body.error.message).toContain('failed');
});
