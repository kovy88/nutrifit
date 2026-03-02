// Vercel serverless — Stripe Checkout Session
// Env vars: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, NEXT_PUBLIC_URL

const stripe = require('stripe');

module.exports = async function handler(req, res) {
  const allowedOrigins = [
    'https://nutri-fit-omega.vercel.app',
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe není nakonfigurován.' });
  }

  const { userId, email } = req.body || {};
  if (!userId || !email) {
    return res.status(400).json({ error: 'Chybí userId nebo email.' });
  }

  const PRICE_ID = process.env.STRIPE_PRICE_ID;
  if (!PRICE_ID) {
    return res.status(500).json({ error: 'STRIPE_PRICE_ID není nastaven.' });
  }

  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://nutri-fit-omega.vercel.app';

  try {
    const stripeClient = stripe(STRIPE_SECRET_KEY);
    const session = await stripeClient.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      metadata: { supabase_user_id: userId },
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${baseUrl}?checkout=success`,
      cancel_url: `${baseUrl}?checkout=cancel`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
