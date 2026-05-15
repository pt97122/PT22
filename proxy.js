const FMTK = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiUFQuMjIiLCJlbWFpbCI6ImlvcDc0MTg1MjBAZ21haWwuY29tIn0.6Une0M6Q1fb-0mywGmr03SJN2dSnei-wlnK_SxRnRns';
const CLAUDE_KEY = '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';
const FM = 'https://api.finmindtrade.com/api/v4/data';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k, v));

  let body;
  try { body = req.body || JSON.parse(await getRawBody(req)); }
  catch(e) { body = req.body || {}; }

  const { type, params, prompt } = body;

  try {
    // ── FINMIND ──
    if (type === 'finmind') {
      const qs = new URLSearchParams({ ...params, token: FMTK }).toString();
      const r = await fetch(`${FM}?${qs}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // ── CLAUDE ──
    if (type === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'Unknown type' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
