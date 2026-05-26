// Vercel serverless funkce — proxy pro individuální návrh jídelníčku (Gemini)
// API klíč zůstává na serveru, nikdy nedorazí do prohlížeče

const { method, rateLimit, sendError } = require('./_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  if (!(await rateLimit(req, res, 'generate', 15))) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return sendError(res, 500, 'missing_gemini_key', 'GEMINI_API_KEY není nastavený v prostředí serveru.');
  }

  const { systemPrompt, prompt } = req.body || {};
  const maxTokens = Math.min(parseInt(req.body.maxTokens) || 3500, 4500);
  if (!prompt) {
    return sendError(res, 400, 'missing_prompt', 'Chybí parametr prompt.');
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
