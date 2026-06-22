# autolearn-sync-server

A self-hosted backend for the autolearn sync protocol, implemented with Fastify, SQLite (via `bun:sqlite`, bun's built-in SQLite), and `bcrypt`-hashed API keys. The server is a dumb, E2E-encrypted key-value store: it never sees plaintext. All encryption/decryption happens client-side in `autolearn.py`. The same REST API is also implemented by the Convex backend; the CLI is backend-agnostic and needs only a `server_url` and API key.

## Quick start

```bash
cd sync-server
bun install
bun run src/cli.ts
# -> autolearn-sync-server listening on :3001, data dir ./data
```

Defaults: `--port 3001`, `--data-dir ./data`. Run `bun run src/cli.ts --help` for flags.

### Docker

Matches the deployment command in [`../docs/designs/sync/protocol-LLD.md`](../docs/designs/sync/protocol-LLD.md#L201):

```bash
docker run -d -p 3001:3001 -v ./data:/data ghcr.io/ericmjl/autolearn-sync
```

The image is built from `Dockerfile` (bun-based, exposes 3001, `/data` volume).

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run start` | Start the server (`src/cli.ts`) |
| `bun run dev` | Start with `--watch` (auto-reload on file changes) |
| `bun test` | Run the in-memory test suite |
| `bun run typecheck` | `tsc --noEmit` over `src/` and `test/` |

## API

All endpoints except `/sync/register` require `Authorization: Bearer <api_key>`. Unauthorized requests return `401 {"error":"unauthorized"}`. See [`../docs/designs/sync/protocol-LLD.md`](../docs/designs/sync/protocol-LLD.md) for the authoritative spec.

| Method & path | Body | Purpose |
|---------------|------|---------|
| `POST /sync/register` | `{ "api_key": "…" }` (≥16 chars) | Provision a user; returns `{ ok, user_id }` (201), 409 on duplicate, 400 on short key |
| `POST /sync/push` | `{ persona_id, machine_id, files: [{ key, ciphertext, nonce, tag, updated_at }] }` | Upsert blobs; returns `{ ok, conflicts: [{ key, remote_updated_at, remote_machine }] }` |
| `POST /sync/pull` | `{ persona_id, since?: number }` | Return blobs newer than `since` (or all if omitted) |
| `GET /sync/status` | — | One entry per persona: `{ persona_id, files, last_sync, machines: [] }` |
| `DELETE /sync/persona/:persona_id` | — | Delete all blobs for that persona; returns `{ ok: true }` |

The `ciphertext`, `nonce`, and `tag` fields are stored verbatim — the server does not interpret them. In practice the Python `cryptography` AES-GCM API appends the tag to the ciphertext, so the CLI sends `tag: ""` and embeds the tag inside `ciphertext`. The server is agnostic to this.

## Deviations from LLD

Documented divergences from [`../docs/designs/sync/protocol-LLD.md`](../docs/designs/sync/protocol-LLD.md), recorded so the parent doc-coherence pass can reconcile them:

1. **Client-sent `updated_at`** (departs from LLD Edge Case 4, line 228). The LLD narrative says "updated_at is server-assigned on push, not client-reported", but the LLD request body on lines 27–35 shows `updated_at` as client-sent. This server implements **client-sent**: the value in the request body is stored verbatim and used for last-write-wins comparison. This matches what the CLI actually sends and keeps the server stateless w.r.t. client clocks (clock skew is the client's concern, surfaced via the `conflicts` array).

2. **`POST /sync/register`** (added; not in LLD). The LLD specifies bcrypt hashing (line 173, SYNC-PROTO-003) but never specifies *how* a user obtains an API key or gets their `user_id` row inserted. This endpoint fills that gap: the user chooses an API key, the server hashes it with bcrypt and stores `user_id = sha256(api_key)` (hex). This is the provisioning flow the CLI's `sync login` will target.

3. **bcrypt verification cache**. A per-process in-memory `Map` caches successful `bcrypt.compare` results, keyed by `user_id + ":" + sha256(api_key)`. bcrypt is intentionally slow (~100ms at cost 10); without caching every authenticated request would pay that cost. Only positive verifications are cached — failed attempts always fall through to bcrypt so brute-force is not accelerated. The cache does not survive restart. Tunable via `AUTOLEARN_BCRYPT_COST` (default `10`).

4. **`bun:sqlite` instead of `better-sqlite3`** (departs from LLD line 168). The LLD specified `better-sqlite3`, but bun maintains a hard, name-based blocklist for that package ([oven-sh/bun#4290](https://github.com/oven-sh/bun/issues/4290)) because bun uses JavaScriptCore and cannot load better-sqlite3's V8/nan C++ addon. The server now uses `bun:sqlite`, which is built into bun, has a near-identical API (`prepare/get/all/run/exec`), and requires zero native build steps. The only observable difference is the absence of a `.pragma()` convenience method — pragmas are set via `db.exec("PRAGMA ...")` instead. The LLD has been updated to reflect this.

## Repo split migration

`sync-server/` has **zero source-level dependencies** on `autolearn.py`, `plugin/`, or `skills/`. To split it into its own repository while preserving history:

```bash
git filter-repo --subdirectory-filter sync-server/
```

The Docker image `ghcr.io/ericmjl/autolearn-sync` then publishes from that repo. Versioning tracks the **API spec** in [`../docs/designs/sync/protocol-LLD.md`](../docs/designs/sync/protocol-LLD.md), not autolearn's version. The contract between CLI and server is the REST API, so the two can release independently as long as the API shape stays stable.
