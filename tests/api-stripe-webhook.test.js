// api/stripe-webhook.js — revenue-critical: tenhle handler je jediné místo,
// kde se uživateli zapíná/vypíná premium. Chybné ověření podpisu = kdokoli si
// zapne premium POSTem; chybný handling eventu = zaplacený uživatel ho nedostane.
//
// Podpisy se tu **nemockují** — testy používají skutečný Stripe SDK
// (`generateTestHeaderString`), takže constructEvent v handleru ověřuje
// doopravdy. Mockovaný podpis by z těchhle testů udělal atrapu.

import {
  USER_ID, installStripe, setStripeStub, signPayload, installFetch, withEnv,
  makeStreamReq, makeRes, jsonResponse, textResponse, captureThrow,
} from './_api-harness.js';

// Musí být před dynamickým importem handleru — ten si stripe requiruje na
// vrchu modulu, takže statický import by ho načetl dřív než injection.
installStripe();
const handler = (await import('../api/stripe-webhook.js')).default;

const PROFILES_PATH = '/rest/v1/profiles';
const CUSTOMER_ID = 'cus_TEST123';

function eventPayload(type, object) {
  return JSON.stringify({ id: 'evt_test', object: 'event', type, data: { object } });
}

const profilesOk = { path: PROFILES_PATH, response: () => jsonResponse(null, { status: 204 }) };

async function post({ payload, signature, env = {}, routes = [profilesOk], stripe = {} }) {
  const restoreEnv = withEnv(env);
  const fetchMock = installFetch(routes);
  setStripeStub(stripe);
  const req = makeStreamReq({
    method: 'POST',
    headers: signature === null ? {} : { 'stripe-signature': signature ?? signPayload(payload) },
    rawBody: payload,
  });
  const res = makeRes();
  try {
    const err = await captureThrow(() => handler(req, res));
    return { res, fetch: fetchMock, err };
  } finally {
    fetchMock.restore();
    restoreEnv();
  }
}

// ── method + konfigurace ────────────────────────────────────────────────────

await test('odmítne jinou metodu než POST', async () => {
  const restoreEnv = withEnv();
  const res = makeRes();
  await handler(makeStreamReq({ method: 'GET' }), res);
  restoreEnv();
  expect(res.statusCode).toBe(405);
});

await test('vrátí 500, když chybí povinné env proměnné', async () => {
  const payload = eventPayload('checkout.session.completed', {});
  const { res } = await post({ payload, env: { STRIPE_WEBHOOK_SECRET: undefined } });
  expect(res.statusCode).toBe(500);
  expect(res.body.error).toBe('Missing env vars');
});

// ── ověření podpisu (bezpečnostní jádro) ────────────────────────────────────

await test('odmítne neplatný podpis a nesáhne na Supabase', async () => {
  const payload = eventPayload('checkout.session.completed', {
    metadata: { supabase_user_id: USER_ID }, customer: CUSTOMER_ID,
  });
  const { res, fetch } = await post({ payload, signature: 't=1,v1=deadbeef' });
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toBe('Webhook signature verification failed');
  // Zásadní: žádný zápis premia na základě nepodepsaného požadavku.
  expect(fetch.calls.length).toBe(0);
});

await test('odmítne úplně chybějící hlavičku stripe-signature', async () => {
  const payload = eventPayload('checkout.session.completed', { metadata: { supabase_user_id: USER_ID } });
  const { res, fetch } = await post({ payload, signature: null });
  expect(res.statusCode).toBe(400);
  expect(fetch.calls.length).toBe(0);
});

await test('odmítne body pozměněné po podepsání', async () => {
  const original = eventPayload('checkout.session.completed', {
    metadata: { supabase_user_id: USER_ID }, customer: CUSTOMER_ID,
  });
  const signature = signPayload(original);
  // Útočník zachytí legitimní podepsaný event a přepíše ho na svoje user id.
  const tampered = original.replace(USER_ID, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
  const { res, fetch } = await post({ payload: tampered, signature });
  expect(res.statusCode).toBe(400);
  expect(fetch.calls.length).toBe(0);
});

await test('odmítne podpis vyrobený jiným webhook secretem', async () => {
  const payload = eventPayload('checkout.session.completed', { metadata: { supabase_user_id: USER_ID } });
  const signature = signPayload(payload, 'whsec_attacker_secret');
  const { res, fetch } = await post({ payload, signature });
  expect(res.statusCode).toBe(400);
  expect(fetch.calls.length).toBe(0);
});

// ── checkout.session.completed ──────────────────────────────────────────────

await test('checkout.session.completed zapne premium a uloží stripe_customer_id', async () => {
  const payload = eventPayload('checkout.session.completed', {
    metadata: { supabase_user_id: USER_ID }, customer: CUSTOMER_ID,
  });
  const { res, fetch } = await post({ payload });

  expect(res.statusCode).toBe(200);
  expect(res.body.received).toBe(true);

  const writes = fetch.to(PROFILES_PATH, 'PATCH');
  expect(writes.length).toBe(1);
  expect(writes[0].url).toContain(`user_id=eq.${USER_ID}`);
  expect(writes[0].body.is_premium).toBe(true);
  expect(writes[0].body.stripe_customer_id).toBe(CUSTOMER_ID);
});

await test('checkout.session.completed posílá service-role klíč, ne anon', async () => {
  const payload = eventPayload('checkout.session.completed', {
    metadata: { supabase_user_id: USER_ID }, customer: CUSTOMER_ID,
  });
  const { fetch } = await post({ payload });
  const [write] = fetch.to(PROFILES_PATH, 'PATCH');
  expect(write.options.headers.apikey).toBe('service_role_key');
  expect(write.options.headers.Authorization).toBe('Bearer service_role_key');
});

await test('checkout.session.completed bez metadata.supabase_user_id nic nezapíše', async () => {
  const payload = eventPayload('checkout.session.completed', { customer: CUSTOMER_ID });
  const { res, fetch } = await post({ payload });
  expect(res.statusCode).toBe(200);
  expect(fetch.to(PROFILES_PATH).length).toBe(0);
});

await test('checkout.session.completed s user id, které není UUID, nic nezapíše', async () => {
  // isUuid() guard — brání injektáži do PostgREST filtru přes metadata.
  const payload = eventPayload('checkout.session.completed', {
    metadata: { supabase_user_id: 'not-a-uuid; drop table profiles' }, customer: CUSTOMER_ID,
  });
  const { res, fetch } = await post({ payload });
  expect(res.statusCode).toBe(200);
  expect(fetch.to(PROFILES_PATH).length).toBe(0);
});

await test('checkout.session.completed bez customeru zapíše premium, ale ne customer id', async () => {
  const payload = eventPayload('checkout.session.completed', { metadata: { supabase_user_id: USER_ID } });
  const { fetch } = await post({ payload });
  const [write] = fetch.to(PROFILES_PATH, 'PATCH');
  expect(write.body.is_premium).toBe(true);
  expect('stripe_customer_id' in write.body).toBe(false);
});

// ── customer.subscription.deleted ───────────────────────────────────────────

await test('customer.subscription.deleted vypne premium podle metadat session', async () => {
  const payload = eventPayload('customer.subscription.deleted', { id: 'sub_123' });
  const listCalls = [];
  const { res, fetch } = await post({
    payload,
    stripe: {
      checkout: {
        sessions: {
          list: async args => {
            listCalls.push(args);
            return { data: [{ metadata: { supabase_user_id: USER_ID } }] };
          },
        },
      },
    },
  });

  expect(res.statusCode).toBe(200);
  expect(listCalls[0].subscription).toBe('sub_123');

  const writes = fetch.to(PROFILES_PATH, 'PATCH');
  expect(writes.length).toBe(1);
  expect(writes[0].body.is_premium).toBe(false);
  // Odhlášení nesmí přepsat/smazat uložené customer id.
  expect('stripe_customer_id' in writes[0].body).toBe(false);
});

await test('customer.subscription.deleted bez dohledatelné session nic nezapíše', async () => {
  const payload = eventPayload('customer.subscription.deleted', { id: 'sub_orphan' });
  const { res, fetch } = await post({
    payload,
    stripe: { checkout: { sessions: { list: async () => ({ data: [] }) } } },
  });
  expect(res.statusCode).toBe(200);
  expect(fetch.to(PROFILES_PATH).length).toBe(0);
});

// ── ostatní eventy ──────────────────────────────────────────────────────────

await test('neznámý typ eventu potvrdí 200 a nic nezapíše', async () => {
  const payload = eventPayload('invoice.payment_succeeded', { id: 'in_1' });
  const { res, fetch } = await post({ payload });
  expect(res.statusCode).toBe(200);
  expect(res.body.received).toBe(true);
  expect(fetch.to(PROFILES_PATH).length).toBe(0);
});

// ── chyba zápisu do Supabase ────────────────────────────────────────────────

await test('selhání zápisu do Supabase nesmí skončit potvrzením 200', async () => {
  // Kdyby handler chybu spolkl a vrátil 200, Stripe by event nikdy neposlal
  // znovu a zaplacený uživatel by zůstal bez premia. Musí selhat nahlas.
  const payload = eventPayload('checkout.session.completed', {
    metadata: { supabase_user_id: USER_ID }, customer: CUSTOMER_ID,
  });
  const { res, err } = await post({
    payload,
    routes: [{ path: PROFILES_PATH, response: () => textResponse('permission denied', { status: 403 }) }],
  });
  expect(err === null).toBe(false);
  expect(err.message).toContain('permission denied');
  expect(res.statusCode === 200).toBe(false);
});
