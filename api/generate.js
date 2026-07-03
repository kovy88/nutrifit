// Vercel serverless funkce — proxy pro individuální návrh jídelníčku (Gemini)
// API klíč zůstává na serveru, nikdy nedorazí do prohlížeče

const { method, rateLimit, requireUser, sendError, msg } = require('./_lib/store-readiness');

module.exports = async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  if (!(await requireUser(req, res))) return;
  if (!(await rateLimit(req, res, 'generate', 15))) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return sendError(res, 500, 'missing_gemini_key', msg(req, 'GEMINI_API_KEY není nastavený v prostředí serveru.', 'GEMINI_API_KEY is not configured on the server.'));
  }

  const { systemPrompt, prompt } = req.body || {};
  const requestedMaxTokens = Math.min(parseInt(req.body.maxTokens) || 3500, 6500);
  if (!prompt) {
    return sendError(res, 400, 'missing_prompt', msg(req, 'Chybí parametr prompt.', 'Missing prompt parameter.'));
  }
  // Cost/abuse guard — real prompts (meal plan context, coach chat + history)
  // stay well under this; it only stops someone pasting a huge blob.
  if (typeof prompt !== 'string' || prompt.length > 12000) {
    return sendError(res, 400, 'prompt_too_long', msg(req, 'Zpráva je příliš dlouhá.', 'Message is too long.'));
  }
  if (systemPrompt != null && (typeof systemPrompt !== 'string' || systemPrompt.length > 6000)) {
    return sendError(res, 400, 'system_prompt_too_long', msg(req, 'Systémový prompt je příliš dlouhý.', 'System prompt is too long.'));
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const maxTokens = model.includes('gemini-3')
    ? Math.min(requestedMaxTokens + 1200, 8192)
    : requestedMaxTokens;
  const thinkingConfig = model.includes('gemini-3')
    ? { thinkingLevel: 'minimal' }
    : { thinkingBudget: 0 };

  let result = await callGeminiModel({
    apiKey,
    model,
    systemPrompt,
    prompt,
    maxTokens,
    thinkingConfig,
  });

  const fallbackModel = 'gemini-2.5-flash';
  if (isModelFallbackError(result.status) && model !== fallbackModel) {
    result = await callGeminiModel({
      apiKey,
      model: fallbackModel,
      systemPrompt,
      prompt,
      maxTokens: requestedMaxTokens,
      thinkingConfig: { thinkingBudget: 0 },
      fallbackFrom: model,
    });
  }

  return res.status(result.status).json(coalesceCandidateText({
    ...result.data,
    modelUsed: result.model,
    fallbackFrom: result.fallbackFrom,
  }));
};

async function callGeminiModel({ apiKey, model, systemPrompt, prompt, maxTokens, thinkingConfig, fallbackFrom }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const geminiRes = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt || '' }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
        thinkingConfig,
      },
    }),
  });
  const data = await geminiRes.json();
  return { status: geminiRes.status, data, model, fallbackFrom };
}

function isModelFallbackError(status) {
  return status === 400 || status === 404;
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
