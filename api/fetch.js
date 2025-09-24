const { URLSearchParams } = require('url');

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
    const repo = (body.repo || '').trim();
    if (!repo || !repo.includes('/')) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Provide repo as owner/repo' }));
    }
    const since = body.since ? new Date(body.since).toISOString() : null;
    const params = new URLSearchParams({ state: 'open', per_page: '50' });
    if (since) params.set('since', since);
    const url = `https://api.github.com/repos/${repo}/issues?` + params.toString();
    const r = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
    if (!r.ok) {
      res.statusCode = r.status;
      return res.end(JSON.stringify({ error: `GitHub ${r.status}` }));
    }
    const data = await r.json();
    const untilTs = body.until ? Date.parse(body.until) : Infinity;
    const issues = (data || [])
      .filter(x => !x.pull_request)
      .filter(x => Date.parse(x.created_at) <= untilTs)
      .map(x => ({
        id: x.id,
        number: x.number,
        title: (x.title || '').slice(0, 200),
        body: (x.body || '').slice(0, 900),
        url: x.html_url,
        created_at: x.created_at
      }));

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(issues));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message || 'Server error' }));
  }
};
