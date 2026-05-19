// Vercel serverless funkce — multimodální odhad maker z fotky jídla (Gemini Vision)

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 20;
const MAX_IMAGE_BASE64_LENGTH = Math.ceil((5 * 1024 * 1024 * 4) / 3);
const hits = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of hits) {
    if (now - entry.start > RATE_WINDOW_MS) hits.delete(ip);
  }
}, 10 * 60 * 1000);

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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (rateLimit(ip)) {
    return res.status(429).json({ error: { message: 'Příliš mnoho požadavků na analýzu fotek. Zkus to za chvíli.' } });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'GEMINI_API_KEY není nastavený v prostředí serveru.' } });
  }

  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64 || !mimeType) {
    return res.status(400).json({ error: { message: 'Chybí imageBase64 nebo mimeType.' } });
  }
  if (typeof imageBase64 !== 'string' || typeof mimeType !== 'string') {
    return res.status(400).json({ error: { message: 'Neplatný formát obrázku.' } });
  }
  if (!mimeType.startsWith('image/')) {
    return res.status(400).json({ error: { message: 'Soubor musí být obrázek.' } });
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    return res.status(400).json({ error: { message: 'Fotka je moc velká. Maximum je 5 MB.' } });
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(imageBase64)) {
    return res.status(400).json({ error: { message: 'Obrázek není validní base64.' } });
  }

  const model = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `
Jsi výživový asistent. Z obrázku odhadni jídlo a orientační makra.
Vrať POUZE validní JSON v češtině bez markdownu:
{
  "foodName": "Název jídla",
  "portionGuess": "Krátký odhad porce",
  "kcal": 0,
  "protein": 0,
  "carbs": 0,
  "fat": 0,
  "confidence": "nízká|střední|vysoká",
  "note": "Krátké upozornění, že jde o orientační odhad"
}
Používej celá čísla pro kcal/protein/carbs/fat.
`;

  const geminiRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 900,
      },
    }),
  });

  const data = await geminiRes.json();
  return res.status(geminiRes.status).json(data);
};
