# iCaddie Backend – Server Setup

Quick guide to run the iCaddie backend (NestJS + Socket.IO + OpenAI Realtime). For the realtime voice flow and events, see [realtime_voice_flow.md](src/modules/realtime/realtime_voice_flow.md).

---

## 1. Prerequisites

- **Node.js** 18+ (LTS recommended)
- **pnpm / yarn / npm**
- **PostgreSQL** (if using DB/Prisma)
- **OpenAI API key** (for Realtime Voice Agent)

---

## 2. Environment Variables

Create a `.env` file in the backend root (or copy from `.env.example`):

```env
# Server
PORT=8010
API_VERSION=v1

# OpenAI Realtime Voice Agent (required for voice)
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17

# Optional: DB, Redis, etc.
# DATABASE_URL=...
```

| Variable                | Required    | Description                      |
| ----------------------- | ----------- | -------------------------------- |
| `PORT`                  | No          | HTTP server port (default: 8010) |
| `API_VERSION`           | No          | API prefix, e.g. `api/v1`        |
| `OPENAI_API_KEY`        | Yes (voice) | OpenAI API key for Realtime API  |
| `OPENAI_REALTIME_MODEL` | Yes (voice) | Realtime model name              |

---

## 3. Install & Run

```bash
# From backend root
cd backend

# delete previous dependencies
rm -rf node_modules/

# Install dependencies
npm install
# or: yarn install  /  pnpm install

# prisma generate
npx prisma generate

# Development (watch mode)
npm run start:dev

# Production build + run
npm run build
npm run start:prod
```

**Expected output:**

```
🚀 Server running on http://localhost:8010
📚 Swagger docs available at http://localhost:8010/api/docs
🔌 WebSocket available at ws://localhost:8010/rag-realtime
```

- **REST API:** `http://localhost:8010/api/{API_VERSION}/...`
- **Swagger:** `http://localhost:8010/api/docs`
- **Socket.IO:** same host/port, path `/socket.io/` (see below).

---

## 4. Socket.IO Setup (Overview)

The app uses **Socket.IO** for the Realtime Voice Agent. It is attached to the same HTTP server as the REST API and is **not** under the global API prefix.

| Item       | Value                                  |
| ---------- | -------------------------------------- |
| Adapter    | `SocketIOAdapter` (NestJS `IoAdapter`) |
| Path       | `/socket.io/`                          |
| Transports | `websocket`, `polling`                 |
| CORS       | `origin: "*"`, `credentials: true`     |

**Relevant files:**

- `src/main.ts` – uses `app.useWebSocketAdapter(new SocketIOAdapter(app))`.
- `src/common/adapters/socket-io.adapter.ts` – builds Socket.IO server on `app.getHttpServer()` with path `/socket.io/`.
- `src/modules/realtime/realtime.gateway.ts` – handles events: `start`, `audio`, `text_input`, `stop`.

---

## 5. Troubleshooting

| Issue                             | Check                                                      |
| --------------------------------- | ---------------------------------------------------------- |
| Socket never connects             | Backend URL and port; `path: "/socket.io/"`; CORS/firewall |
| `OPENAI_API_KEY` / session errors | `.env` and env vars; Realtime model name                   |
| No audio / no `started`           | Emit `start` after `connect`; handle `error` and `started` |
| Port in use                       | Change `PORT` in `.env` or `process.env.PORT`              |

---

## 6. Scripts (package.json)

| Script | Command               | Description              |
| ------ | --------------------- | ------------------------ |
| Dev    | `npm run start:dev`   | Watch mode, auto-restart |
| Build  | `npm run build`       | Compile to `dist/`       |
| Prod   | `npm run start:prod`  | Run `node dist/src/main` |
| Debug  | `npm run start:debug` | Debug + watch            |

---

**End of document**
