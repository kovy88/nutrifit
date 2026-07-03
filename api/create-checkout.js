// Vercel serverless — Stripe Checkout Session
// Env vars: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, NEXT_PUBLIC_URL

const stripe = require('stripe');
const { method, requireUser, sendError, rateLimit } = require('./_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;

  const requester = await requireUser(req, res);
  if (!requester) return;
  if (!(await rateLimit(req, res, 'create-checkout', 10))) return;

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return sendError(res, 500, 'stripe_not_configured', 'Stripe není nakonfigurován.');
  }

  const PRICE_ID = process.env.STRIPE_PRICE_ID;
  if (!PRICE_ID) {
    return sendError(res, 500, 'missing_price_id', 'STRIPE_PRICE_ID není nastaven.');
  }

  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://nutri-fit-omega.vercel.app';
  const userId = requester.user.id;
  const email = requester.user.email;
  if (!email) {
    return sendError(res, 400, 'missing_user_email', 'Přihlášený účet nemá e-mail.');
  }

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
    return sendError(res, 500, 'checkout_failed', err.message || 'Platbu se nepodařilo vytvořit.');
  }
};
