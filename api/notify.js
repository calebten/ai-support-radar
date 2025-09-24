async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e7) req.destroy(); });
    req.on('end', () => resolve(data || '{}'));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: 'Use POST' }));
    }
    const body = JSON.parse(await readBody(req));
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, note: 'No SLACK_WEBHOOK_URL configured; skipping.' }));
    }
    const counts = body.counts || {};
    const sentiments = body.sentiments || {};
    const execSummary = body.execSummary || '';

    const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const text = `*Support Signal*
Top categories: ${top.map(([k,v])=>`${k} (${v})`).join(', ') || 'n/a'}
Sentiment: Neg ${sentiments.Negative||0} | Neu ${sentiments.Neutral||0} | Pos ${sentiments.Positive||0}

${execSummary}`;

    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
    if (!r.ok) {
      res.statusCode = r.status;
      return res.end(JSON.stringify({ error: `Slack ${r.status}` }));
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message || 'Server error' }));
  }
};
