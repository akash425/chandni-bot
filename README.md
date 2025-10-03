# ChandniBot (Persona Bot)

A small full-stack chatbot that mimics a chosen persona's tone, personality, and knowledge.

- Frontend: React + Vite + Tailwind
- Backend: Node.js (Express)
- AI: OpenAI (Chat + Embeddings)
- Vector DB: ChromaDB
- Deploy: Frontend → Vercel, Backend → Railway/Render

## Monorepo Structure

- `backend/` — Express API with `/ask`
- `frontend/` — React chat UI (Vite + Tailwind)
- `scripts/` — Data ingestion for ChromaDB

## Prerequisites

- Node.js 18+
- OpenAI API key
- ChromaDB server (Docker or local)

To run ChromaDB locally via Docker:

```bash
# Simple local ChromaDB (ephemeral)
docker run -p 8000:8000 chromadb/chroma:latest
```

For persistent data, mount a volume and set `CHROMA_URL` accordingly.

## Backend Setup (`backend/`)

1. Install dependencies

```bash
cd backend
npm install
cp .env.example .env
# edit .env and set OPENAI_API_KEY, PERSONA_NAME (optional)
```

2. Run locally

```bash
npm run dev
# API at http://localhost:3001
```

### API

- `POST /ask` — body: `{ "question": "..." }` → returns `{ "answer": "..." }`
- `GET /health` — health check

## Frontend Setup (`frontend/`)

1. Install and run

```bash
cd frontend
npm install
npm run dev
```

2. Configure API URL (if backend not on localhost):

Create `.env` in `frontend/` and set:

```
VITE_API_URL=https://your-backend.example.com
```

## Data Ingestion (`scripts/`)

Place `.txt` or `.md` sources under `scripts/data/` (nested folders ok), then run:

```bash
# from repository root
cd scripts
node loadData.js ./data
```

Environment used: `CHROMA_URL`, `CHROMA_COLLECTION`, `OPENAI_API_KEY`.

## Persona

The backend uses a persona prompt to respond like your chosen person (defaults to "Chandni"). You can customize via `PERSONA_NAME` in `backend/.env` and add more catchphrases in `buildPersonaPrompt()` inside `backend/server.js`.

## Deployment

- Backend: Deploy `backend/` to Railway/Render. Configure env vars there (`OPENAI_API_KEY`, `CHROMA_URL`, `PERSONA_NAME`).
- Frontend: Deploy `frontend/` to Vercel. Set `VITE_API_URL` to your backend URL.

## Bonus Ideas

- Voice mode (ElevenLabs TTS) to read answers.
- Slack bot integration using Slack Bolt SDK.
- Persist chat history per user.

## Troubleshooting

- Ensure ChromaDB is reachable at `CHROMA_URL`.
- If `/ask` returns 401/403, verify `OPENAI_API_KEY` and allowed network egress on the host.
- You can test embeddings and collection contents with a quick script or by printing the `queryRes` in `server.js`.
