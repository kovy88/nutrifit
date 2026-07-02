// Vercel serverless funkce — přidání emailu do Brevo listu
// BREVO_API_KEY musí být nastaven v Environment Variables na Vercelu

const { isValidEmail } = require('./_lib/store-readiness');

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
  if (req.method !== 'POST') return res.status(405).end();

  const email = String(req.body?.email || '').trim();
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Neplatný e-mail.' });
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) {
    return res.status(500).json({ error: 'Newsletter není nakonfigurován.' });
  }

  // List ID — zkontroluj v Brevo dashboardu (Contacts → Lists)
  const LIST_ID = parseInt(process.env.BREVO_LIST_ID || '2');

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

  return res.status(400).json({ error: err.message || 'Nepodařilo se přihlásit k odběru.' });
};
