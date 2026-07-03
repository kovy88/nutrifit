// Vercel serverless funkce — přidání emailu do Brevo listu
// BREVO_API_KEY musí být nastaven v Environment Variables na Vercelu

const { method, rateLimit, sendError, isValidEmail } = require('./_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  // Light abuse guard: 5 signups / hour per IP (anon — no auth on the landing).
  if (!(await rateLimit(req, res, 'subscribe', 5))) return;

  const email = String(req.body?.email || '').trim();
  if (!isValidEmail(email)) {
    return sendError(res, 400, 'invalid_email', 'Neplatný e-mail.');
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) {
    return sendError(res, 500, 'newsletter_not_configured', 'Newsletter není nakonfigurován.');
  }

  // List ID — zkontroluj v Brevo dashboardu (Contacts → Lists)
  const LIST_ID = parseInt(process.env.BREVO_LIST_ID || '2');

  try {
    const r = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify({
        email,
        listIds: [LIST_ID],
        updateEnabled: true,  // pokud kontakt existuje, jen ho přidá do listu
      }),
    });

    if (r.ok || r.status === 204) return res.status(200).json({ ok: true });

    const err = await r.json().catch(() => ({}));
    // Kód 400 s "Contact already exist" je vlastně OK
    if (err.code === 'duplicate_parameter') return res.status(200).json({ ok: true });

    return sendError(res, 400, 'subscribe_failed', err.message || 'Nepodařilo se přihlásit k odběru.');
  } catch (err) {
    return sendError(res, 502, 'brevo_unreachable', 'Newsletter službu se nepodařilo kontaktovat. Zkus to prosím později.');
  }
};
