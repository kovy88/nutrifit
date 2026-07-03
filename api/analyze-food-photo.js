// Vercel serverless funkce — multimodální odhad maker z fotky jídla (Gemini Vision)

const { method, rateLimit, requireUser, sendError, msg, getLocale } = require('./_lib/store-readiness');

const MAX_IMAGE_BASE64_LENGTH = Math.ceil((5 * 1024 * 1024 * 4) / 3);
const GEMINI_TIMEOUT_MS = 25000;

function emptyEstimate(locale) {
  if (locale === 'en') {
    return {
      foodName: 'Could not recognize the food',
      portionGuess: 'portion not recognized',
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      confidence: 'low',
      note: 'The food is not clearly visible in the photo. Try better lighting, a top-down shot, and the whole plate.',
    };
  }
  return {
    foodName: 'Jídlo se nepodařilo rozpoznat',
    portionGuess: 'porce nerozpoznána',
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    confidence: 'nízká',
    note: 'Na fotce není dost jasně vidět jídlo. Zkus lepší světlo, záběr shora a celý talíř.',
  };
}

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  if (!(await requireUser(req, res))) return;
  if (!(await rateLimit(req, res, 'analyze-food-photo', 20))) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return sendError(res, 500, 'missing_gemini_key', msg(req, 'GEMINI_API_KEY není nastavený v prostředí serveru.', 'GEMINI_API_KEY is not configured on the server.'));
  }

  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64 || !mimeType) {
    return sendError(res, 400, 'missing_image', msg(req, 'Chybí imageBase64 nebo mimeType.', 'Missing imageBase64 or mimeType.'));
  }
  if (typeof imageBase64 !== 'string' || typeof mimeType !== 'string') {
    return sendError(res, 400, 'invalid_image', msg(req, 'Neplatný formát obrázku.', 'Invalid image format.'));
  }
  if (!mimeType.startsWith('image/')) {
    return sendError(res, 400, 'invalid_mime', msg(req, 'Soubor musí být obrázek.', 'The file must be an image.'));
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    return sendError(res, 400, 'image_too_large', msg(req, 'Fotka je moc velká. Maximum je 5 MB.', 'The photo is too large. Maximum is 5 MB.'));
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(imageBase64)) {
    return sendError(res, 400, 'invalid_base64', msg(req, 'Obrázek není validní base64.', 'The image is not valid base64.'));
  }

  const model = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const thinkingConfig = model.includes('gemini-3')
    ? { thinkingLevel: 'minimal' }
    : { thinkingBudget: 0 };

  const locale = getLocale(req);
  const prompt = locale === 'en'
    ? `
You are a nutrition assistant. Estimate the food and approximate macros from the image.
Return ONLY valid JSON with no markdown, comments, or extra text.
All user-facing JSON string values must be in English.
If there is no food in the image or the portion cannot be recognized, return JSON with zero macros and low confidence.
{
  "foodName": "Food name",
  "portionGuess": "Short portion estimate",
  "kcal": 0,
  "protein": 0,
  "carbs": 0,
  "fat": 0,
  "confidence": "low|medium|high",
  "note": "Short note that this is an approximate estimate"
}
Use integers for kcal/protein/carbs/fat.
`
    : `
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let geminiRes;
  try {
    geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: controller.signal,
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
          thinkingConfig,
        },
      }),
    });
  } catch (err) {
    const code = err?.name === 'AbortError' ? 'gemini_timeout' : 'gemini_unreachable';
    return sendError(res, 502, code, msg(req, 'AI se nepodařilo kontaktovat. Zkus to prosím znovu.', 'Could not reach the AI. Please try again.'));
  } finally {
    clearTimeout(timeout);
  }

  const data = coalesceCandidateText(await geminiRes.json());
  if (!geminiRes.ok || data.error) return res.status(geminiRes.status).json(data);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const estimate = normalizeEstimate(parseJSONLoose(text) || emptyEstimate(locale), locale);
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

function coalesceCandidateText(data) {
  if (!data?.candidates) return data;
  return {
    ...data,
    candidates: data.candidates.map(candidate => {
      const parts = candidate.content?.parts;
      if (!Array.isArray(parts)) return candidate;
      const text = parts.map(part => part.text || '').join('').trim();
      if (!text) return candidate;
      return {
        ...candidate,
        content: {
          ...candidate.content,
          parts: [{ text }],
        },
      };
    }),
  };
}

const CONFIDENCE_LEVELS = ['nízká', 'střední', 'vysoká', 'low', 'medium', 'high'];

function normalizeEstimate(raw, locale) {
  const fallback = emptyEstimate(locale);
  const confidence = String(raw.confidence || fallback.confidence).toLowerCase();
  return {
    foodName: text(raw.foodName, fallback.foodName),
    portionGuess: text(raw.portionGuess, fallback.portionGuess),
    kcal: number(raw.kcal),
    protein: number(raw.protein),
    carbs: number(raw.carbs),
    fat: number(raw.fat),
    confidence: CONFIDENCE_LEVELS.includes(confidence) ? confidence : (locale === 'en' ? 'medium' : 'střední'),
    note: text(raw.note, fallback.note),
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
