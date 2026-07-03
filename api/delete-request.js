const { method, rateLimit, sendError, isValidEmail } = require('./_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  if (!(await rateLimit(req, res, 'delete-request', 5))) return;

  const email = String(req.body?.email || '').trim().toLowerCase();
  const message = String(req.body?.message || '').trim();
  if (!isValidEmail(email)) {
    return sendError(res, 400, 'invalid_email', 'Zadej platný e-mail k účtu.');
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const supportEmail = process.env.SUPPORT_EMAIL || 'koval.macek@gmail.com';
  if (!BREVO_API_KEY) {
    return res.status(200).json({
      ok: true,
      fallback: true,
      message: `Žádost prosím pošli na ${supportEmail}.`,
    });
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: 'NutriFit', email: supportEmail },
        to: [{ email: supportEmail }],
        subject: 'NutriFit - žádost o smazání účtu',
        textContent: `E-mail účtu: ${email}\n\nZpráva:\n${message || '(bez zprávy)'}`,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendError(res, 500, 'request_failed', 'Žádost se nepodařilo odeslat.');
  }
};
