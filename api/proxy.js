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

    // ── TWSE 即時股價（單支）──
    // input: { type:'twse_realtime', code:'2330' }
    // 回傳: { z:現價, o:開盤, h:最高, l:最低, v:成交量, y:昨收, t:時間, n:名稱 }
    if (type === 'twse_realtime') {
      const ex = code && code.length === 4 ? 'tse' : 'tse';
      const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${ex}_${code}.tw&json=1&delay=0`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://mis.twse.com.tw/stock/fibest.jsp'
        }
      });
      const data = await r.json();
      // data.msgArray[0] 含股票資料
      if (data.msgArray && data.msgArray.length > 0) {
        const s = data.msgArray[0];
        return res.status(200).json({
          ok: true,
          code: code,
          name: s.n || '',
          price: parseFloat(s.z) || parseFloat(s.y) || null,   // 現價（收盤用 y 昨收備用）
          open: parseFloat(s.o) || null,
          high: parseFloat(s.h) || null,
          low: parseFloat(s.l) || null,
          prevClose: parseFloat(s.y) || null,
          volume: parseInt((s.v || '0').replace(/,/g, '')) || 0,
          time: s.t || '',
          status: s.z === '-' ? 'closed' : 'open'  // '-' 表示今日未開盤/已收盤
        });
      }
      return res.status(200).json({ ok: false, code, error: 'no data' });
    }

    // ── TWSE 即時股價（批次，最多30支）──
    // input: { type:'twse_batch', codes:['2330','2382',...] }
    if (type === 'twse_batch') {
      const codeList = (codes || []).slice(0, 30);
      const ex_ch = codeList.map(c => `tse_${c}.tw`).join('|');
      const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${ex_ch}&json=1&delay=0`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://mis.twse.com.tw/stock/fibest.jsp'
        }
      });
      const data = await r.json();
      if (data.msgArray) {
        const result = {};
        for (const s of data.msgArray) {
          const c = s.c;
          result[c] = {
            ok: true,
            code: c,
            name: s.n || '',
            price: parseFloat(s.z) || parseFloat(s.y) || null,
            open: parseFloat(s.o) || null,
            high: parseFloat(s.h) || null,
            low: parseFloat(s.l) || null,
            prevClose: parseFloat(s.y) || null,
            volume: parseInt((s.v || '0').replace(/,/g, '')) || 0,
            time: s.t || '',
            status: s.z === '-' ? 'closed' : 'open'
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
