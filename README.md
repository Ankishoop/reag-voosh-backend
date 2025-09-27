## Voosh — RAG Chat (Backend)

### Overview
TypeScript/Express backend powering a news‑focused Retrieval‑Augmented Generation chat.

Responsibilities:
- Session storage and chat history in Redis
- Embeddings generation (Jina AI API with safe local fallback)
- Vector search in Qdrant
- LLM responses via Google Gemini (@google/genai)
- REST endpoints and WebSocket streaming for the frontend

### Tech Stack
- Node.js 20+, Express 5, ws, ioredis
- Qdrant JS client (REST)
- @google/genai for Gemini text generation
- TypeScript with strict settings

### Prerequisites
- Node.js 20+
- Redis (default `redis://localhost:6379`)
- Qdrant (default `http://localhost:6333`)

### Environment
Copy `.env.example` to `.env` and adjust values:

```
# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Redis
REDIS_URL=redis://localhost:6379

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=news_articles

# Embeddings (Jina)
EMBEDDINGS_API_URL=https://api.jina.ai/v1/embeddings
EMBEDDINGS_API_KEY=your_jina_api_key_here
# Optional toggles
EMBEDDINGS_PROVIDER=
EMBEDDINGS_SILENT_FALLBACK=true

# Gemini (Google)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_LOCATION=global
GCP_PROJECT_ID=your_google_cloud_project_id

# Optional news feeds for ingestion
NEWS_RSS_FEEDS=https://hnrss.org/frontpage,https://www.theguardian.com/world/rss,https://rss.nytimes.com/services/xml/rss/nyt/World.xml
```

Notes:
- Embeddings: If `EMBEDDINGS_API_URL`/`EMBEDDINGS_API_KEY` are missing, the service falls back to a deterministic local embedding generator so you can develop without credentials.
- Gemini model name should be a public API name (e.g., `gemini-2.5-flash` or `gemini-1.5-flash-latest`) rather than Vertex versioned names.
- CORS: `FRONTEND_URL` must match the browser origin of the frontend.

### Install
```
pnpm install
```

### Run (Development)
```
pnpm dev
```
Starts HTTP server and WebSocket server on `PORT` (default `3000`). Health at `/health`.

### Build + Start (Production)
```
pnpm build
pnpm start
```

### Ingest News Content into Qdrant
This script fetches multiple RSS feeds, embeds titles/snippets, and upserts into the `QDRANT_COLLECTION`.
```
pnpm ingest
```
Ensure Qdrant is reachable and embeddings are configured (or rely on local fallback during development).

### API Endpoints
- `POST /session` → `{ sessionId }`
- `GET /session/:id/history` → `{ messages: ChatMessage[] }`
- `POST /session/:id/reset` → `{ cleared: true }`
- `POST /message` body `{ sessionId, text }` → `{ answer, passages }`
- `GET /health` → `{ status, services: { vectorStore } }`

`ChatMessage` shape:
```
{ role: "user" | "bot", content: string, ts?: string }
```

### WebSocket Protocol
Connect to `ws://HOST:PORT` and send an init message:
```
{ "type": "init", "sessionId": "..." }
```
Send user text:
```
{ "type": "user_message", "sessionId": "...", "text": "..." }
```
Server messages:
```
{ "type": "ack", sessionId? }
{ "type": "bot_chunk", chunk, done? }
{ "type": "bot_message", text, sessionId }
{ "type": "error", message }
```

### Retrieval + Prompting Flow
1) User text → embed via Jina (or local fallback)
2) Top‑K search in Qdrant (default 4–6)
3) De‑duplicate passages by URL/title
4) Build a structured prompt (bullets; include sources)
5) Generate with Gemini and sanitize output (dedupe lines/halves)
6) Persist both user and bot messages in Redis

### Operational Notes
- Health check `/health` also reports whether the Qdrant collection exists.
- Redis keys: `session:{id}:messages`, `session:{id}:meta` with 7‑day TTL.
- Graceful shutdown on SIGINT/SIGTERM.

### Production Considerations
- Run Redis and Qdrant as managed services or stable containers with persistence.
- Front a reverse proxy (Nginx/Caddy) that supports WebSocket upgrades.
- Configure CORS or co‑host frontend and backend under the same origin.
- Prefer `gemini-*-latest` variants to receive non‑breaking updates when acceptable.



