async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 2e7) req.destroy(); });
    req.on('end', () => resolve(data || '{}'));
    req.on('error', reject);
  });
}

function redactPII(text="") {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/\b\d{13,19}\b/g, "[CARD]")
    .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, "[SSN]");
}

const CLASSIFY_PROMPT = `You are a support analyst. For each item, output JSONL with:
{"category":"Login/Access|Billing|Performance/Outage|Bugs|UX/Usability|Feature Request|Other",
 "sentiment":"Negative|Neutral|Positive",
 "rootCause":"<=8 words",
 "action":"<=10 words"}
Return strictly valid JSONL. Keep fields terse.`;

const ROLLUP_PROMPT = `Summarize patterns across items:
- Top 3 categories with % share
- 2–3 root causes
- 2 measurable actions
- 2–3 sentence exec summary
<= 180 tokens. Crisp, no fluff.`;

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: 'Use POST' }));
    }
    const body = JSON.parse(await readBody(req));
    const issues = Array.isArray(body.issues) ? body.issues : [];
    if (!issues.length) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'No issues provided' }));
    }
    const KEY = process.env.OPENAI_API_KEY;
    if (!KEY) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }));
    }
    const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';
    const MAX_OUTPUT = parseInt(process.env.MAX_OUTPUT_TOKENS || '120', 10);
    const MAX_BATCHES = parseInt(process.env.MAX_BATCHES || '4', 10);
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` };

    // Trim + redact PII
    const cleaned = issues.map(it => ({
      ...it,
      body: redactPII((it.body || '').slice(0, 900))
    }));

    // Batch the issues
    const batchSize = 30;
    const batches = [];
    for (let i = 0; i < cleaned.length; i += batchSize) batches.push(cleaned.slice(i, i + batchSize));
    const limited = batches.slice(0, MAX_BATCHES);

    const allLines = [];
    for (const b of limited) {
      const inputText = `Issues:\\n` + b.map((it, i) => `${i+1}. ${it.title}\\n${it.body}`).join(`\\n\\n`) + `\\n\\n` + CLASSIFY_PROMPT;
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: 'Return compact JSONL only.' },
            { role: 'user', content: inputText }
          ],
          max_tokens: MAX_OUTPUT,
          temperature: 0.2
        })
      });
      if (!r.ok) {
        res.statusCode = r.status;
        return res.end(JSON.stringify({ error: `OpenAI ${r.status}` }));
      }
      const data = await r.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      text.split(/\r?\n/).forEach(line => { line = line.trim(); if (line) allLines.push(line); });
    }

    // Parse JSONL safely
    const parsed = [];
    for (const line of allLines) {
      try { parsed.push(JSON.parse(line)); } catch (e) {}
    }

    // Aggregate
    const counts = {};
    const sentiments = { Negative: 0, Neutral: 0, Positive: 0 };
    parsed.forEach(p => {
      counts[p.category] = (counts[p.category] || 0) + 1;
      if (p.sentiment in sentiments) sentiments[p.sentiment]++;
    });

    // Exec roll-up
    const rollReq = {
      model: MODEL,
      messages: [
        { role: 'system', content: 'You produce concise executive insights.' },
        { role: 'user', content: `Aggregates: ${JSON.stringify({ counts, sentiments })}\\n\\n${ROLLUP_PROMPT}` }
      ],
      max_tokens: 180,
      temperature: 0.2
    };
    const rr = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers, body: JSON.stringify(rollReq)
    });
    let execSummary = '';
    if (rr.ok) {
      const roll = await rr.json();
      execSummary = (roll.choices && roll.choices[0] && roll.choices[0].message && roll.choices[0].message.content) || '';
    }

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ parsed, counts, sentiments, execSummary }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message || 'Server error' }));
  }
};
