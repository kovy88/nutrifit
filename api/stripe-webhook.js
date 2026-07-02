// Vercel serverless — Stripe Webhook
// Env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY

const stripe = require('stripe');

// Vercel neposílá raw body defaultně — musíme vypnout bodyParser
module.exports.config = { api: { bodyParser: false } };

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!STRIPE_SECRET_KEY || !WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  const stripeClient = stripe(STRIPE_SECRET_KEY);
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('Stripe webhook: failed to read request body:', err.message);
    return res.status(400).json({ error: 'Failed to read request body' });
  }
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripeClient.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // Zpracuj relevantní eventy
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.supabase_user_id;
    if (isUuid(userId)) {
      await setUserPremium(SUPABASE_URL, SUPABASE_SERVICE_KEY, userId, true);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    // Předplatné zrušeno — odeber premium
    const subscription = event.data.object;
    const sessions = await stripeClient.checkout.sessions.list({
      subscription: subscription.id,
      limit: 1,
    });
    const userId = sessions.data[0]?.metadata?.supabase_user_id;
    if (isUuid(userId)) {
      await setUserPremium(SUPABASE_URL, SUPABASE_SERVICE_KEY, userId, false);
    }
  }

  return res.status(200).json({ received: true });
};

async function setUserPremium(supabaseUrl, serviceKey, userId, isPremium) {
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ is_premium: isPremium }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Supabase premium update failed (${response.status})`);
  }
}
