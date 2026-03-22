# Lexora — document RAG & workflow APIs

Next.js app for **uploading documents** (PDF/DOCX, etc.), **chunking + vector embeddings** in [Convex](https://convex.dev), and **RAG chat** via [Ollama](https://ollama.com). Includes **HTTP APIs** for **n8n** (ingest, status, AI summary).

## Prerequisites

- **Node.js** 20+ and npm
- **Convex** account (free tier works) — [convex.dev](https://convex.dev)
- **Ollama** on the same machine or reachable over the network (embeddings + chat + summarize)

On the Ollama host, pull models (names must match your env or defaults):

```bash
ollama pull nomic-embed-text
ollama pull qwen3.5:9b
```

Adjust `OLLAMA_TEXT_MODEL` / `OLLAMA_EMBEDDING_MODEL` if you use different tags.

---

## Clone and run locally

```bash
git clone <repo-url>
cd alma-team-cursor
npm install
```

### 1. Environment variables

```bash
cp .env.example .env.local
```

Edit **`.env.local`**:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_CONVEX_URL` | **Yes** | Convex deployment URL (from `npx convex dev`) |
| `OLLAMA_BASE_URL` | **Yes** | Base URL, e.g. `http://127.0.0.1:11434` (no trailing slash) |
| `OLLAMA_TEXT_MODEL` | No | Chat + summarize model (default `qwen3.5:9b`) |
| `OLLAMA_EMBEDDING_MODEL` | No | Embeddings (default `nomic-embed-text`) |
| `SUMMARIZE_API_KEY` | No | If set, `/api/summarize` requires `Authorization: Bearer …` or `X-Summarize-Key` |
| `SUMMARY_*` | No | Tune summary speed/length — see [Summary API](#summary-api) |

### 2. Convex

```bash
npx convex dev
```

Leave this running in a terminal. It syncs `convex/` functions, prints **`NEXT_PUBLIC_CONVEX_URL`**, and can open the dashboard.

### 3. Next.js

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Upload a document, wait until status is **ready**, then use chat.

### 4. Production build (optional)

```bash
npm run build
npm run start
```

---

## Ollama networking

- **Same PC:** `OLLAMA_BASE_URL=http://127.0.0.1:11434` is enough if Ollama listens on localhost.
- **Remote:** use the machine’s IP or Tailscale IP, and ensure Ollama listens on `0.0.0.0:11434` and the firewall allows **11434** from the machine running Next.js.

---

## Cloudflare quick tunnel (dev)

If you use `cloudflared tunnel --url http://localhost:3000`, **`next.config.ts`** already includes `allowedDevOrigins: ["*.trycloudflare.com"]` so HMR/RSC work.

If you open the tunnel URL **from another device**, the browser cannot use `127.0.0.1` for Convex — use a **deployed Convex URL** or tunnel Convex separately and set `NEXT_PUBLIC_CONVEX_URL` accordingly.

---

## HTTP API (for n8n / automation)

Base URL: your app origin (e.g. `http://localhost:3000` or your deployed host).

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/documents/create` | Create a document row; returns `{ documentId }` |
| `POST` | `/api/ingest` | Ingest file: **multipart** (`file`, `documentId`) or **JSON** (`fileName`, `documentId`, base64 `fileContent`) |
| `GET` | `/api/document-status?documentId=…` | Document metadata + pipeline `status` |
| `GET` | `/api/documents/:id/status` | Same as above (path param) |
| `POST` | `/api/chat` | RAG chat (streaming plain text); body: `message`, `documentId`, optional `chatId` |
| `GET` / `POST` | `/api/summarize` | AI summary JSON; `documentId` as query or JSON body |

### Summary API

- **GET:** `/api/summarize?documentId=<id>&maxTokens=512&maxSourceChars=16000&timeoutMs=90000`
- **POST:** `{ "documentId": "..." , "maxTokens"?, "maxSourceChars"?, "timeoutMs"? }`

Response includes `summary`, `truncated`, and `limits` applied. Qwen3 “thinking” is disabled in the Ollama request (`think: false`).

Optional env tuning: `SUMMARY_MAX_TOKENS`, `SUMMARY_MAX_SOURCE_CHARS`, `SUMMARY_TIMEOUT_MS`, `SUMMARY_NUM_CTX`.

---

## Project layout (short)

- `app/` — UI (`page.tsx`), App Router, `app/api/*` route handlers  
- `convex/` — schema, documents, embeddings, chats  
- `lib/` — embedding helpers, Ollama config, text splitter, summary limits  
- `components/lexora/` — sidebar, chat area  

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Convex errors in the browser | `NEXT_PUBLIC_CONVEX_URL` in `.env.local`, `npx convex dev` running |
| `fetch failed` / ECONNREFUSED to Ollama | `OLLAMA_BASE_URL`, Ollama running, firewall, remote bind `0.0.0.0` |
| Chat: no chunks | Re-ingest after embeddings enabled; document status **ready** |
| Empty summary from Ollama | Qwen3: ensure `think: false` (already in code); raise `SUMMARY_MAX_TOKENS` |
| Tunnel: broken UI | `allowedDevOrigins` for your tunnel host; restart `npm run dev` |

---

## Scripts

```bash
npm run dev      # Next.js dev server
npm run build    # Production build
npm run start    # Run production server
npm run lint     # ESLint
```

Convex CLI: `npx convex dev`, `npx convex dashboard`.
