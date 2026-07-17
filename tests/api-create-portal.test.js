// api/create-portal.js — vydává session do Stripe billing portálu, kde jde
// zrušit předplatné a vidět platební údaje. Vydat ji na cizího Customera =
// cross-account přístup k fakturaci.
//
// `await test(...)` je povinný, viz hlavička _api-harness.js.

import {
  USER_ID, installStripe, setStripeStub, installFetch, withEnv, makeReq, makeRes,
  jsonResponse, textResponse, authRoute, authRejectedRoute, rateLimitRoute,
} from './_api-harness.js';

installStripe();
const handler = (await import('../api/create-portal.js')).default;

const PROFILES_PATH = '/rest/v1/profiles';
const PORTAL_URL = 'https://billing.stripe.com/session/test_123';
const CACHED_CUSTOMER = 'cus_CACHED';
const FOUND_CUSTOMER = 'cus_FOUND_BY_EMAIL';

const BEARER = { authorization: 'Bearer valid-token' };

/** Profil s uloženým (nebo chybějícím) stripe_customer_id. */
function profileRoute(stripeCustomerId) {
  return {
    path: PROFILES_PATH,
    method: 'GET',
    response: () => jsonResponse([{ stripe_customer_id: stripeCustomerId }]),
  };
}

const profilePatchOk = { path: PROFILES_PATH, method: 'PATCH', response: () => jsonResponse(null, { status: 204 }) };

function stripeStub({ customers = [], onPortalCreate } = {}) {
  return {
    customers: { list: async args => ({ data: customers.map(id => ({ id, email: args.email })) }) },
    billingPortal: {
      sessions: {
        create: async args => {
          onPortalCreate?.(args);
          return { url: PORTAL_URL };
        },
      },
    },
  };
}

async function call({
  method = 'POST', headers = BEARER, routes, stripe = stripeStub(), env = {}, user,
} = {}) {
  const restoreEnv = withEnv(env);
  const fetchMock = installFetch(
    routes ?? [
      user === undefined ? authRoute() : authRoute(user),
      rateLimitRoute(true), profileRoute(CACHED_CUSTOMER), profilePatchOk,
    ],
  );
  setStripeStub(stripe);
  const res = makeRes();
  try {
    await handler(makeReq({ method, headers }), res);
    return { res, fetch: fetchMock };
  } finally {
    fetchMock.restore();
    restoreEnv();
  }
}

// ── method / auth / rate limit ──────────────────────────────────────────────

await test('odmítne GET', async () => {
  const { res } = await call({ method: 'GET' });
  expect(res.statusCode).toBe(405);
});

await test('bez tokenu vrátí 401', async () => {
  const { res } = await call({ headers: {} });
  expect(res.statusCode).toBe(401);
  expect(res.body.error.code).toBe('auth_required');
});

await test('s neplatným tokenem vrátí 401', async () => {
  const { res } = await call({ routes: [authRejectedRoute(401), rateLimitRoute(true)] });
  expect(res.statusCode).toBe(401);
});

await test('při vyčerpaném rate limitu vrátí 429', async () => {
  const { res } = await call({ routes: [authRoute(), rateLimitRoute(false)] });
  expect(res.statusCode).toBe(429);
  expect(res.body.error.code).toBe('rate_limited');
});

await test('rate limit je 10 požadavků/hodinu na uživatele', async () => {
  const { fetch } = await call();
  const [rpc] = fetch.to('/rest/v1/rpc/increment_api_rate_limit');
  expect(rpc.body.p_bucket).toBe('create-portal');
  expect(rpc.body.p_max_hits).toBe(10);
  expect(rpc.body.p_subject).toBe(USER_ID);
});

// ── konfigurace / vstupy ────────────────────────────────────────────────────

await test('bez STRIPE_SECRET_KEY vrátí 500', async () => {
  const { res } = await call({ env: { STRIPE_SECRET_KEY: undefined } });
  expect(res.statusCode).toBe(500);
  expect(res.body.error.code).toBe('stripe_not_configured');
});

await test('účet bez e-mailu vrátí 400', async () => {
  const { res } = await call({ user: { id: USER_ID } });
  expect(res.statusCode).toBe(400);
  expect(res.body.error.code).toBe('missing_user_email');
});

// ── preferovaná cesta: customer id z profilu ────────────────────────────────

await test('použije stripe_customer_id z profilu a nehledá podle e-mailu', async () => {
  // Hledání podle e-mailu je nespolehlivé (víc Customerů na jeden e-mail),
  // takže cache na profilu má mít přednost.
  let listed = false;
  const stripe = stripeStub();
  stripe.customers.list = async () => { listed = true; return { data: [] }; };

  let portalArgs = null;
  stripe.billingPortal.sessions.create = async args => { portalArgs = args; return { url: PORTAL_URL }; };

  const { res } = await call({ stripe });

  expect(res.statusCode).toBe(200);
  expect(res.body.url).toBe(PORTAL_URL);
  expect(listed).toBe(false);
  expect(portalArgs.customer).toBe(CACHED_CUSTOMER);
});

await test('return_url bere z NEXT_PUBLIC_URL', async () => {
  let portalArgs = null;
  const { res } = await call({
    stripe: stripeStub({ onPortalCreate: args => { portalArgs = args; } }),
    env: { NEXT_PUBLIC_URL: 'https://example.test' },
  });
  expect(res.statusCode).toBe(200);
  expect(portalArgs.return_url).toBe('https://example.test');
});

// ── fallback: hledání podle e-mailu ─────────────────────────────────────────

await test('bez uloženého customer id dohledá Customera podle e-mailu', async () => {
  let portalArgs = null;
  const { res } = await call({
    routes: [authRoute(), rateLimitRoute(true), profileRoute(null), profilePatchOk],
    stripe: stripeStub({ customers: [FOUND_CUSTOMER], onPortalCreate: args => { portalArgs = args; } }),
  });
  expect(res.statusCode).toBe(200);
  expect(portalArgs.customer).toBe(FOUND_CUSTOMER);
});

await test('dohledaného Customera si uloží zpět na profil (self-heal)', async () => {
  const { fetch } = await call({
    routes: [authRoute(), rateLimitRoute(true), profileRoute(null), profilePatchOk],
    stripe: stripeStub({ customers: [FOUND_CUSTOMER] }),
  });
  const [patch] = fetch.to(PROFILES_PATH, 'PATCH');
  expect(patch.url).toContain(`user_id=eq.${USER_ID}`);
  expect(patch.body.stripe_customer_id).toBe(FOUND_CUSTOMER);
});

await test('když Customer podle e-mailu neexistuje, vrátí 404', async () => {
  const { res } = await call({
    routes: [authRoute(), rateLimitRoute(true), profileRoute(null), profilePatchOk],
    stripe: stripeStub({ customers: [] }),
  });
  expect(res.statusCode).toBe(404);
  expect(res.body.error.code).toBe('customer_not_found');
});

await test('selhání self-heal zápisu portál nezhatí', async () => {
  // PATCH je best-effort — když selže, session se stejně má vydat.
  const { res } = await call({
    routes: [
      authRoute(), rateLimitRoute(true), profileRoute(null),
      { path: PROFILES_PATH, method: 'PATCH', response: () => textResponse('write failed', { status: 500 }) },
    ],
    stripe: stripeStub({ customers: [FOUND_CUSTOMER] }),
  });
  expect(res.statusCode).toBe(200);
  expect(res.body.url).toBe(PORTAL_URL);
});

// ── známá díra (charakterizační test) ───────────────────────────────────────

await test('ZNÁMÁ DÍRA: fallback podle e-mailu neověřuje vlastnictví Customera', async () => {
  // Dokumentuje *současné* chování, ne to žádoucí. `customers.list({ email })`
  // vezme první výsledek bez ověření, že Customer patří přihlášenému uživateli
  // — viz "Validate Stripe customer ownership" v IMPROVEMENT_PLAN.md.
  // Až se díra zalepí, tenhle test má spadnout a být přepsán na 403.
  let portalArgs = null;
  const foreignCustomer = 'cus_SOMEONE_ELSE';
  const { res } = await call({
    routes: [authRoute(), rateLimitRoute(true), profileRoute(null), profilePatchOk],
    stripe: {
      customers: {
        list: async () => ({
          // Customer patřící jinému supabase účtu, jen sdílí e-mail.
          data: [{ id: foreignCustomer, metadata: { supabase_user_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' } }],
        }),
      },
      billingPortal: { sessions: { create: async args => { portalArgs = args; return { url: PORTAL_URL }; } } },
    },
  });
  expect(res.statusCode).toBe(200);
  expect(portalArgs.customer).toBe(foreignCustomer);
});

// ── chyby Stripe ────────────────────────────────────────────────────────────

await test('výpadek Stripe vrátí 500 portal_failed', async () => {
  const stripe = stripeStub();
  stripe.billingPortal.sessions.create = async () => { throw new Error('stripe is down'); };
  const { res } = await call({ stripe });
  expect(res.statusCode).toBe(500);
  expect(res.body.error.code).toBe('portal_failed');
  expect(res.body.error.message).toContain('stripe is down');
});

await test('selhání čtení profilu vrátí 500 portal_failed', async () => {
  const { res } = await call({
    routes: [
      authRoute(), rateLimitRoute(true),
      { path: PROFILES_PATH, method: 'GET', response: () => textResponse('db down', { status: 500 }) },
    ],
  });
  expect(res.statusCode).toBe(500);
  expect(res.body.error.code).toBe('portal_failed');
});
