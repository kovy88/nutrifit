// Vercel serverless funkce — multimodální odhad maker z fotky jídla (Gemini Vision)

const { method, rateLimit, sendError } = require('./_lib/store-readiness');

const MAX_IMAGE_BASE64_LENGTH = Math.ceil((5 * 1024 * 1024 * 4) / 3);

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  if (!(await rateLimit(req, res, 'analyze-food-photo', 20))) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return sendError(res, 500, 'missing_gemini_key', 'GEMINI_API_KEY není nastavený v prostředí serveru.');
  }

  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64 || !mimeType) {
    return sendError(res, 400, 'missing_image', 'Chybí imageBase64 nebo mimeType.');
  }
  if (typeof imageBase64 !== 'string' || typeof mimeType !== 'string') {
    return sendError(res, 400, 'invalid_image', 'Neplatný formát obrázku.');
  }
  if (!mimeType.startsWith('image/')) {
    return sendError(res, 400, 'invalid_mime', 'Soubor musí být obrázek.');
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    return sendError(res, 400, 'image_too_large', 'Fotka je moc velká. Maximum je 5 MB.');
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(imageBase64)) {
    return sendError(res, 400, 'invalid_base64', 'Obrázek není validní base64.');
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
