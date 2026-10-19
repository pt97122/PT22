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

    // ── TWSE OpenAPI 即時股價（單支）──
    // input: { type:'twse_realtime', code:'2330' }
    if (type === 'twse_realtime') {
      const url = `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      const data = await r.json();
      const stock = Array.isArray(data) ? data.find(s => s.Code === code) : null;
      if (stock) {
        const price = parseFloat(stock.ClosingPrice) || parseFloat(stock.OpeningPrice) || null;
        const open = parseFloat(stock.OpeningPrice) || null;
        const high = parseFloat(stock.HighestPrice) || null;
        const low = parseFloat(stock.LowestPrice) || null;
        const prevClose = parseFloat(stock.LastBestBidPrice) || price;
        const volume = parseInt(stock.TradeVolume) || 0;
        return res.status(200).json({
          ok: true,
          code: code,
          name: stock.Name || '',
          price: price,
          open: open,
          high: high,
          low: low,
          prevClose: prevClose,
          volume: volume,
          time: new Date().toISOString(),
          status: 'open'
        });
      }
      return res.status(200).json({ ok: false, code, error: 'no data' });
    }

    // ── TWSE OpenAPI 即時股價（批次）──
    // input: { type:'twse_batch', codes:['2330','2382',...] }
    if (type === 'twse_batch') {
      const codeList = (codes || []).slice(0, 30);
      const url = `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        const result = {};
        for (const c of codeList) {
          const stock = data.find(s => s.Code === c);
          if (stock) {
            const price = parseFloat(stock.ClosingPrice) || parseFloat(stock.OpeningPrice) || null;
            result[c] = {
              ok: true,
              code: c,
              name: stock.Name || '',
              price: price,
              open: parseFloat(stock.OpeningPrice) || null,
              high: parseFloat(stock.HighestPrice) || null,
              low: parseFloat(stock.LowestPrice) || null,
              prevClose: parseFloat(stock.LastBestBidPrice) || price,
              volume: parseInt(stock.TradeVolume) || 0,
              time: new Date().toISOString(),
              status: 'open'
            };
          }
        }
        return res.status(200).json({ ok: true, stocks: result });
      }
      return res.status(200).json({ ok: false, error: 'no data' });
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
