// Vercel serverless — Stripe Customer Portal Session
// Env vars: STRIPE_SECRET_KEY, NEXT_PUBLIC_URL

const stripe = require('stripe');
const { method, requireUser, sendError, rateLimit, supabaseRest } = require('./_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;

  const requester = await requireUser(req, res);
  if (!requester) return;
  if (!(await rateLimit(req, res, 'create-portal', 10))) return;

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return sendError(res, 500, 'stripe_not_configured', 'Stripe není nakonfigurován.');
  }

  const userId = requester.user.id;
  const email = requester.user.email;
  if (!email) {
    return sendError(res, 400, 'missing_user_email', 'Přihlášený účet nemá e-mail.');
  }

  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://nutri-fit-omega.vercel.app';

  try {
    const stripeClient = stripe(STRIPE_SECRET_KEY);

    // Prefer the customer id stored on the profile (set by the webhook on
    // checkout completion) — searching Stripe by email is fragile, since a
    // user can end up with more than one Customer object sharing the same
    // email and .list() gives no guarantee about which one comes back.
    let customerId = null;
    const rows = await supabaseRest(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id`);
    customerId = rows?.[0]?.stripe_customer_id || null;

    if (!customerId) {
      const customers = await stripeClient.customers.list({ email, limit: 1 });
      if (!customers.data.length) {
        return sendError(res, 404, 'customer_not_found', 'Zákazník nenalezen.');
      }
      customerId = customers.data[0].id;
      // Self-heal: persist it so future portal requests use the reliable path.
      await supabaseRest(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ stripe_customer_id: customerId }),
      }).catch(() => {
        // Non-fatal — the portal session below still works this time,
        // it'll just fall back to the email search again next time.
      });
    }

    const session = await stripeClient.billingPortal.sessions.create({
      customer: customerId,
      return_url: baseUrl,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return sendError(res, 500, 'portal_failed', err.message || 'Portál se nepodařilo vytvořit.');
  }
};
