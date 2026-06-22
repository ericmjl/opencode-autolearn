# Sync Protocol - Low-Level Design

**Created**: 2026-06-08
**HLD Link**: ../../high-level-design.md (Decision 7)

## Overview

The sync protocol is a thin REST API for pushing and pulling encrypted file blobs. Any conforming backend (Convex, self-hosted Fastify+SQLite) can serve it. The CLI is backend-agnostic — it only needs a URL and API key.

## Context

Per the HLD, the server is a dumb key-value store with auth. It never sees plaintext. The CLI encrypts before push and decrypts after pull. The same API spec is implemented by both the Convex backend and the self-hosted backend.

## API Spec

All endpoints require `Authorization: Bearer <api_key>`. All bodies are JSON.

### POST /sync/push

Upload encrypted files for a persona.

```json
// Request
{
  "persona_id": "uuid-v4",
  "machine_id": "string",
  "files": [
    {
      "key": "memory.md",
      "ciphertext": "base64",
      "nonce": "base64",
      "tag": "base64",
      "updated_at": 1717852800
    }
  ]
}

// Response
{ "ok": true, "conflicts": [] }
// Or on conflict:
{ "ok": true, "conflicts": [
    { "key": "memory.md", "remote_updated_at": 1717852900, "remote_machine": "desktop-7" }
  ]
}
```

### POST /sync/pull

Download encrypted files for a persona.

```json
// Request
{
  "persona_id": "uuid-v4",
  "since": 1717852800  // optional: only files newer than this
}

// Response
{
  "files": [
    {
      "key": "memory.md",
      "ciphertext": "base64",
      "nonce": "base64",
      "tag": "base64",
      "machine_id": "laptop-42",
      "updated_at": 1717852900
    }
  ]
}
```

### GET /sync/status

Show sync state across all personas.

```json
// Response
{
  "personas": [
    {
      "persona_id": "uuid-v4",
      "files": 8,
      "last_sync": 1717852900,
      "machines": ["laptop-42", "desktop-7"]
    }
  ]
}
```

### DELETE /sync/persona/{persona_id}

Delete all encrypted blobs for a persona.

```json
// Response
{ "ok": true }
```

## Conflict Resolution

Client-side only (server can't inspect ciphertext):

| File type | Strategy | Rationale |
|-----------|----------|-----------|
| observations.jsonl | Append-only merge (union of lines, deduplicated) | Safe because observations are independent events |
| Everything else | Last-write-wins by `updated_at` timestamp | Simple, and the reviewer re-adds lost entries next session |

### Pull merge logic

```
for each remote file:
  if no local file → accept remote
  if remote.updated_at > local.updated_at → accept remote (last-write-wins)
  if observations.jsonl → merge both sides (union), sort by timestamp
  else → local wins (no overwrite)
```

### Manual resolution

`sync pull --interactive` shows a diff summary and lets the user choose per file.

## Sync Triggers

| Event | Action |
|-------|--------|
| `sync push` (manual) | Encrypt + upload all changed files |
| `sync pull` (manual) | Download + decrypt, merge locally |
| Plugin: session start | Auto `sync pull` in background |
| Plugin: after review completes | Auto `sync push` |
| Curator run | Auto `sync push` after transitions |
| `sync watch` | Long-lived process, pushes on file changes |

## Backend: Convex (Managed)

### Schema

```typescript
// convex/schema.ts
defineSchema({
  sync_store: defineTable({
    userId: v.string(),
    personaId: v.string(),
    fileKey: v.string(),
    ciphertext: v.string(),
    nonce: v.string(),
    tag: v.string(),
    machineId: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user_persona", ["userId", "personaId"])
    .index("by_user_persona_key", ["userId", "personaId", "fileKey"])
})
```

### Deployment

```bash
npx convex deploy  # deploys to user's Convex instance
```

### Cost

Convex free tier: 100K reads/day, 10K writes/day. Personal use is < 100 writes/day.

## Backend: Self-Hosted

### Stack

- **Fastify** HTTP server
- `bun:sqlite` for storage (bun's built-in SQLite; originally specified as `better-sqlite3` but bun has a hard name-based blocklist for it — see [oven-sh/bun#4290](https://github.com/oven-sh/bun/issues/4290). `bun:sqlite` is API-compatible: `prepare/get/all/run/exec` all match. Pragmas are set via `db.exec("PRAGMA ...")` rather than `.pragma()`.)
- **bcrypt** for API key hashing

### Database schema

```sql
CREATE TABLE users (
  user_id       TEXT PRIMARY KEY,
  api_key_hash  TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE sync_store (
  user_id    TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  file_key   TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce      TEXT NOT NULL,
  tag        TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, persona_id, file_key),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
```

### Deployment

```bash
# Docker
docker run -d -p 3001:3001 -v ./data:/data ghcr.io/ericmjl/autolearn-sync

# Or bare
npx autolearn-sync-server --port 3001 --data-dir ./data
```

## CLI Configuration

`~/.autolearn/sync.yaml`:

```yaml
server_url: "https://your-convex.convex.cloud"  # or "http://localhost:3001"
machine_id: "macbook-pro-2024"                    # auto-detected from hostname
active_personas:
  - default
  - work
sync_on_start: true
sync_after_review: true
```

API key via `AUTOLEARN_SYNC_API_KEY` env var (never stored in config file).

## Edge Cases

1. **Server unreachable**: Sync silently fails, local data is authoritative. Next successful sync reconciles.
2. **First machine setup**: `sync pull` returns empty → no files to decrypt → normal.
3. **Large number of machines**: Pull returns files from all machines; last-write-wins picks the latest.
4. **Clock skew**: `updated_at` is server-assigned on push, not client-reported, to prevent skew issues.

## Implementation Deviations (Phase 1)

Documented divergences between this spec and the shipped Phase 1 implementation, recorded for traceability:

1. **`POST /sync/register` added** (not in the original API spec above). The LLD specifies bcrypt hashing (SYNC-PROTO-003) but never specified *how* a user obtains an API key. The register endpoint fills this gap: `POST /sync/register { "api_key": "..." }` creates a `users` row with `user_id = sha256(api_key)` and `api_key_hash = bcrypt(api_key)`. Returns 201 on success, 409 on duplicate, 400 if api_key < 16 chars. This endpoint is unauthenticated.

2. **Client-sent `updated_at`** (departs from Edge Case 4 above). Edge Case 4 says "updated_at is server-assigned on push, not client-reported," but the Push request body on lines 27–35 shows it as client-sent. The shipped implementation uses **client-sent**: the CLI sends `int(file.stat().st_mtime)` and the server stores it verbatim. This matches the request shape and keeps the server stateless w.r.t. client clocks.

3. **`bun:sqlite` instead of `better-sqlite3`** (see Stack section above). bun has a hard name-based blocklist for `better-sqlite3` ([oven-sh/bun#4290](https://github.com/oven-sh/bun/issues/4290)). `bun:sqlite` is built-in and API-compatible (`prepare/get/all/run/exec`); pragmas are set via `db.exec("PRAGMA ...")` rather than `.pragma()`.

4. **bcrypt verification cache**. The server caches successful `bcrypt.compare` results in a per-process `Map` keyed by `user_id + ":" + sha256(api_key)`. bcrypt is intentionally slow (~100ms at cost 10); without caching every authenticated request would pay that cost. Only positive results are cached; failures always fall through to bcrypt. Tunable via `AUTOLEARN_BCRYPT_COST`.

5. **`GET /health` added** (unauthenticated). Returns `{ ok: true }`. Used by Docker `HEALTHCHECK` and by the CLI's `_wait_for_health` test helper.

## Related Documents

- [High-Level Design](../../high-level-design.md)
- [Encryption LLD](./encryption-LLD.md)
- [Multi-Persona LLD](./persona-LLD.md)
- [Sync Protocol EARS](./protocol-EARS.md)
