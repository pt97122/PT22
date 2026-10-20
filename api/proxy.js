const FMTK = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiUFQuMjIiLCJlbWFpbCI6ImlvcDc0MTg1MjBAZ21haWwuY29tIn0.6Une0M6Q1fb-0mywGmr03SJN2dSnei-wlnK_SxRnRns';
const CLAUDE_KEY = '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';
const FM = 'https://api.finmindtrade.com/api/v4/data';
const FUGLE_KEY = '8248219c-73d7-45c2-b0d1-d2d02b1de9b4';

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

  const { type, params, prompt, code, codes } = body;

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

    // ── Fugle 即時股價（單支）──
    // input: { type:'twse_realtime', code:'2330' }
    if (type === 'twse_realtime') {
      const url = `https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${code}`;
      const r = await fetch(url, {
        headers: {
          'X-API-KEY': FUGLE_KEY,
          'Accept': 'application/json'
        }
      });
      const data = await r.json();
      if (data && data.symbol) {
        const price = data.closePrice || data.lastPrice || data.referencePrice || null;
        return res.status(200).json({
          ok: true,
          code: code,
          name: data.name || '',
          price: price,
          open: data.openPrice || null,
          high: data.highPrice || null,
          low: data.lowPrice || null,
          prevClose: data.referencePrice || null,
          volume: data.total?.tradeVolume || 0,
          time: data.lastUpdated || new Date().toISOString(),
          status: data.isTradingHalt ? 'closed' : 'open'
        });
      }
      return res.status(200).json({ ok: false, code, error: data?.message || 'no data' });
    }

    // ── Fugle 即時股價（批次）──
    // input: { type:'twse_batch', codes:['2330','2382',...] }
    if (type === 'twse_batch') {
      const codeList = (codes || []).slice(0, 30);
      const result = {};
      await Promise.all(codeList.map(async (c) => {
        try {
          const url = `https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${c}`;
          const r = await fetch(url, {
            headers: { 'X-API-KEY': FUGLE_KEY, 'Accept': 'application/json' }
          });
          const data = await r.json();
          if (data && data.symbol) {
            const price = data.closePrice || data.lastPrice || data.referencePrice || null;
            result[c] = {
              ok: true,
              code: c,
              name: data.name || '',
              price: price,
              open: data.openPrice || null,
              high: data.highPrice || null,
              low: data.lowPrice || null,
              prevClose: data.referencePrice || null,
              volume: data.total?.tradeVolume || 0,
              time: data.lastUpdated || new Date().toISOString(),
              status: data.isTradingHalt ? 'closed' : 'open'
            };
          }
        } catch(e) { /* skip */ }
      }));
      return res.status(200).json({ ok: true, stocks: result });
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
