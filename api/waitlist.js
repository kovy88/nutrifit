// Vercel serverless — waitlist signup for the NutriPlan landing page.
// Inserts an email into the `waitlist` table via the service-role REST helper
// (table has RLS on with no anon policies, so only this endpoint can write).

const { method, rateLimit, sendError, supabaseRest } = require('./_lib/store-readiness');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  // Light abuse guard: 5 signups / hour per IP (anon — no auth on the landing).
  if (!(await rateLimit(req, res, 'waitlist', 5))) return;

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return sendError(res, 400, 'invalid_email', 'Zadej platný e-mail.');
  }

  try {
    // Upsert on the email primary key → re-submitting the same address is a no-op.
    await supabaseRest('/rest/v1/waitlist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ email, source: 'landing' }),
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendError(res, 500, 'waitlist_failed', 'Uložení se nepodařilo. Zkus to prosím později.');
  }
};
