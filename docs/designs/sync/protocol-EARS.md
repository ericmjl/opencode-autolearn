# Sync Protocol - EARS

**Parent LLD**: ./protocol-LLD.md

## Authentication

- [x] **SYNC-PROTO-001**: All sync API requests shall include an `Authorization: Bearer <api_key>` header.
- [x] **SYNC-PROTO-002**: The API key shall be read from the `AUTOLEARN_SYNC_API_KEY` environment variable and never stored in config files.
- [x] **SYNC-PROTO-003**: The server shall store only a bcrypt hash of the API key, never the plaintext key.

## Push

- [x] **SYNC-PROTO-004**: `sync push` shall encrypt all local files and upload them as opaque blobs via `POST /sync/push`.
- [x] **SYNC-PROTO-005**: The push request shall include `persona_id`, `machine_id`, and an array of encrypted file records.
- [x] **SYNC-PROTO-006**: If the server reports a conflict (remote `updated_at` > local), the CLI shall warn the user but not overwrite local data without confirmation.

## Pull

- [x] **SYNC-PROTO-007**: `sync pull` shall download encrypted blobs via `POST /sync/pull` and decrypt them locally.
- [x] **SYNC-PROTO-008**: If no local file exists for a remote key, the system shall accept the remote version.
- [x] **SYNC-PROTO-009**: For `observations.jsonl`, the system shall merge remote and local lines (union, deduplicated, sorted by timestamp).
- [x] **SYNC-PROTO-010**: For all other files, the system shall use last-write-wins based on `updated_at` timestamp.
- [ ] **SYNC-PROTO-011**: `sync pull --interactive` shall show a diff summary per conflicting file and prompt the user to choose. _(deferred — Phase 2+)_

## Auto-Sync

- [x] **SYNC-PROTO-012**: When `sync_on_start` is enabled, the plugin shall auto-pull on session start.
- [x] **SYNC-PROTO-013**: When `sync_after_review` is enabled, the plugin shall auto-push after a review completes.
- [x] **SYNC-PROTO-014**: If the sync server is unreachable, sync shall silently fail and local data shall remain authoritative.

## Status

- [x] **SYNC-PROTO-015**: `sync status` shall display all synced personas, their file counts, last sync timestamps, and connected machines.

## Backend Conformance

- [x] **SYNC-PROTO-016**: The Convex backend and self-hosted backend shall implement the same API spec (push, pull, status, delete). _(both shipped: `sync-server/` Fastify + `sync-convex/` Convex HTTP Actions)_
- [x] **SYNC-PROTO-017**: The CLI shall be backend-agnostic, requiring only a `server_url` and API key.

## Related Documents

- [Sync Protocol LLD](./protocol-LLD.md)
- [Encryption LLD](./encryption-LLD.md)
