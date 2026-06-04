// Vercel serverless — Stripe Customer Portal Session
// Env vars: STRIPE_SECRET_KEY, NEXT_PUBLIC_URL

const stripe = require('stripe');
const { method, requireUser, sendError } = require('./_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;

  const requester = await requireUser(req, res);
  if (!requester) return;

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return sendError(res, 500, 'stripe_not_configured', 'Stripe není nakonfigurován.');
  }

  const email = requester.user.email;
  if (!email) {
    return sendError(res, 400, 'missing_user_email', 'Přihlášený účet nemá e-mail.');
  }

  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://nutri-fit-omega.vercel.app';

  try {
    const stripeClient = stripe(STRIPE_SECRET_KEY);

    // Find customer by email
    const customers = await stripeClient.customers.list({ email, limit: 1 });
    if (!customers.data.length) {
      return sendError(res, 404, 'customer_not_found', 'Zákazník nenalezen.');
    }

    const session = await stripeClient.billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: baseUrl,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return sendError(res, 500, 'portal_failed', err.message || 'Portál se nepodařilo vytvořit.');
  }
};
