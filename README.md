# AI Support Radar (No-code-friendly)

Simple multi-API demo:
- Source: public GitHub issues (no auth)
- AI: OpenAI Chat Completions (classification + exec roll-up)
- Alert: Slack Incoming Webhook (optional)

## Files
- `frontend/index.html` – single-page UI
- `api/fetch.js` – pulls issues from GitHub
- `api/analyze.js` – calls OpenAI, aggregates, summarizes
- `api/notify.js` – posts Slack alert (optional)
- `vercel.json` – route API + static frontend

## Environment variables (Vercel Project Settings → Environment Variables)
- `OPENAI_API_KEY`: your key
- `LLM_MODEL`: gpt-4o-mini (default if omitted)
- `MAX_BATCHES`: 4 (default)
- `MAX_OUTPUT_TOKENS`: 120 (default)
- `SLACK_WEBHOOK_URL`: optional; omit to skip Slack

## Deploy
1) Create a GitHub repo and upload these files (or drag-drop on GitHub web).
2) Import the repo into Vercel → set the env vars → Deploy.
3) Open the URL, enter a repo like `vercel/next.js` → Analyze.
