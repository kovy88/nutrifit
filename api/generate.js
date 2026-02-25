// Vercel serverless funkce — proxy pro Gemini API
// API klíč zůstává na serveru, nikdy nedorazí do prohlížeče

module.exports = async function handler(req, res) {
  // CORS pro lokální vývoj
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'GEMINI_API_KEY není nastavený v prostředí serveru.' } });
  }

  const { systemPrompt, prompt, maxTokens = 2000 } = req.body || {};
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
