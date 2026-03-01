// Vercel serverless funkce — proxy pro individuální návrh jídelníčku (Gemini)
// API klíč zůstává na serveru, nikdy nedorazí do prohlížeče

// ── RATE LIMITING (in-memory, přežije dokud Vercel drží instanci ~5–15 min)
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hodina
const RATE_MAX = 15; // max 15 požadavků za hodinu na IP
const hits = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false; // OK
  }
  entry.count++;
  if (entry.count > RATE_MAX) return true; // BLOCKED
  return false;
}

// Úklid starých záznamů (max 5000 IP v paměti)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of hits) {
    if (now - entry.start > RATE_WINDOW_MS) hits.delete(ip);
  }
}, 10 * 60 * 1000);

module.exports = async function handler(req, res) {
  const allowedOrigins = [
    'https://nutri-fit-omega.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  // Rate limit — IP z Vercel headers
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (rateLimit(ip)) {
    return res.status(429).json({ error: { message: 'Příliš mnoho požadavků. Zkus to za chvíli.' } });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'GEMINI_API_KEY není nastavený v prostředí serveru.' } });
  }

  const { systemPrompt, prompt } = req.body || {};
  const maxTokens = Math.min(parseInt(req.body.maxTokens) || 2000, 3000);
  if (!prompt) {
    return res.status(400).json({ error: { message: 'Chybí parametr prompt.' } });
  }

  const model   = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const url     = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const geminiRes = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt || '' }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = await geminiRes.json();
  return res.status(geminiRes.status).json(data);
};
