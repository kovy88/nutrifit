// Vercel serverless funkce — multimodální odhad maker z fotky jídla (Gemini Vision)

const { method, rateLimit, sendError } = require('./_lib/store-readiness');

const MAX_IMAGE_BASE64_LENGTH = Math.ceil((5 * 1024 * 1024 * 4) / 3);
const EMPTY_ESTIMATE = {
  foodName: 'Jídlo se nepodařilo rozpoznat',
  portionGuess: 'porce nerozpoznána',
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  confidence: 'nízká',
  note: 'Na fotce není dost jasně vidět jídlo. Zkus lepší světlo, záběr shora a celý talíř.',
};

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

  const model = process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `
You are a nutrition assistant. Estimate the food and approximate macros from the image.
Return ONLY valid JSON with no markdown, comments, or extra text.
All user-facing JSON string values must be in Czech.
If there is no food in the image or the portion cannot be recognized, return JSON with zero macros and low confidence.
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
Use integers for kcal/protein/carbs/fat.
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
        responseSchema: {
          type: 'OBJECT',
          required: ['foodName', 'portionGuess', 'kcal', 'protein', 'carbs', 'fat', 'confidence', 'note'],
          properties: {
            foodName: { type: 'STRING' },
            portionGuess: { type: 'STRING' },
            kcal: { type: 'INTEGER' },
            protein: { type: 'INTEGER' },
            carbs: { type: 'INTEGER' },
            fat: { type: 'INTEGER' },
            confidence: { type: 'STRING' },
            note: { type: 'STRING' },
          },
        },
        maxOutputTokens: 900,
      },
    }),
  });

  const data = await geminiRes.json();
  if (!geminiRes.ok || data.error) return res.status(geminiRes.status).json(data);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const estimate = normalizeEstimate(parseJSONLoose(text) || EMPTY_ESTIMATE);
  return res.status(200).json({ ...data, estimate });
};

function parseJSONLoose(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function normalizeEstimate(raw) {
  const confidence = String(raw.confidence || EMPTY_ESTIMATE.confidence).toLowerCase();
  return {
    foodName: text(raw.foodName, EMPTY_ESTIMATE.foodName),
    portionGuess: text(raw.portionGuess, EMPTY_ESTIMATE.portionGuess),
    kcal: number(raw.kcal),
    protein: number(raw.protein),
    carbs: number(raw.carbs),
    fat: number(raw.fat),
    confidence: ['nízká', 'střední', 'vysoká'].includes(confidence) ? confidence : 'střední',
    note: text(raw.note, EMPTY_ESTIMATE.note),
  };
}

function text(value, fallback) {
  const out = String(value ?? '').trim();
  return out || fallback;
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}
