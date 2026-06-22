# autolearn-sync-convex

Convex HTTP Actions backend for the autolearn sync protocol. This is the **managed** alternative to the self-hosted [Fastify server](../sync-server/). Both implement the same REST API — the CLI is backend-agnostic and needs only a `server_url` and API key.

## Why Convex?

- **No server to operate.** Convex hosts the database and HTTP endpoints.
- **Free tier** covers personal use (< 100 writes/day for sync).
- **Deploys in seconds** via `npx convex deploy`.

The tradeoff: each authenticated request pays ~100ms for bcrypt verification (no in-process cache, unlike the Fastify server). Fine for personal sync.

## Setup

### 1. Install the Convex CLI

```bash
npm install -g convex
```

### 2. Log in to Convex

```bash
cd sync-convex
npx convex dev
```

This opens a browser for Convex authentication, creates a new project, and generates the `_generated/` type files that the source code imports. Run this once before deploying.

### 3. Deploy

```bash
npx convex deploy
```

Convex assigns a deployment URL like `https://your-project-123.convex.site`. This is your `server_url`.

### 4. Configure the CLI

```bash
export AUTOLEARN_SYNC_API_KEY="your-chosen-api-key-at-least-16-chars"
uv run autolearn.py sync login --server-url https://your-project-123.convex.site
```

## API

Same five endpoints as the Fastify server. See [`../docs/designs/sync/protocol-LLD.md`](../docs/designs/sync/protocol-LLD.md) for the authoritative spec.

| Method & path | Purpose |
|---|---|
| `POST /sync/register` | Provision a user (bcrypt-hashed API key) |
| `POST /sync/push` | Upload encrypted blobs |
| `POST /sync/pull` | Download encrypted blobs |
| `GET /sync/status` | Per-persona file count, last sync, machines |
| `DELETE /sync/persona/:persona_id` | Delete all blobs for a persona |
| `GET /health` | Unauthenticated health check |

## Differences from the Fastify server

| Aspect | Fastify (`sync-server/`) | Convex (`sync-convex/`) |
|---|---|---|
| Storage | SQLite via `bun:sqlite` | Convex document store |
| bcrypt cache | Per-process `Map` (positive results only) | None (each request re-verifies) |
| Path params | Native Express-style `:persona_id` | Parsed manually from URL (Convex HTTP Actions don't support path params in route patterns) |
| Deployment | Docker or bare `bun run` | `npx convex deploy` |
| Cost | Free (self-hosted) | Free tier: 100K reads/day, 10K writes/day |

## Repo split migration

Same as `sync-server/`: zero source-level dependencies on `autolearn.py`, `plugin/`, or `skills/`. Split via:

```bash
git filter-repo --subdirectory-filter sync-convex/
```
