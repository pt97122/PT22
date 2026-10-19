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

    // ── Yahoo Finance 即時股價（單支）──
    // input: { type:'twse_realtime', code:'2330' }
    if (type === 'twse_realtime') {
      const symbol = `${code}.TW`;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      const data = await r.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        const price = meta.regularMarketPrice || meta.previousClose || null;
        const prevClose = meta.previousClose || null;
        const open = meta.regularMarketOpen || null;
        const high = meta.regularMarketDayHigh || null;
        const low = meta.regularMarketDayLow || null;
        const volume = meta.regularMarketVolume || 0;
        const marketState = meta.marketState || 'CLOSED'; // REGULAR=盤中, POST=盤後, CLOSED=收盤
        return res.status(200).json({
          ok: true,
          code: code,
          name: meta.shortName || meta.longName || '',
          price: price,
          open: open,
          high: high,
          low: low,
          prevClose: prevClose,
          volume: volume,
          time: new Date(meta.regularMarketTime * 1000).toISOString(),
          status: marketState === 'REGULAR' ? 'open' : 'closed'
        });
      }
      return res.status(200).json({ ok: false, code, error: 'no data' });
    }

    // ── Yahoo Finance 即時股價（批次）──
    // input: { type:'twse_batch', codes:['2330','2382',...] }
    if (type === 'twse_batch') {
      const codeList = (codes || []).slice(0, 30);
      const symbols = codeList.map(c => `${c}.TW`).join(',');
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      const data = await r.json();
      const quotes = data?.quoteResponse?.result || [];
      if (quotes.length > 0) {
        const result = {};
        for (const q of quotes) {
          const c = q.symbol.replace('.TW', '');
          result[c] = {
            ok: true,
            code: c,
            name: q.shortName || q.longName || '',
            price: q.regularMarketPrice || q.previousClose || null,
            open: q.regularMarketOpen || null,
            high: q.regularMarketDayHigh || null,
            low: q.regularMarketDayLow || null,
            prevClose: q.regularMarketPreviousClose || null,
            volume: q.regularMarketVolume || 0,
            time: q.regularMarketTime ? new Date(q.regularMarketTime * 1000).toISOString() : '',
            status: q.marketState === 'REGULAR' ? 'open' : 'closed'
          };
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
