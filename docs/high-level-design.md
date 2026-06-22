# OpenCode Autolearn - High-Level Design

**Created**: 2026-06-05
**Last updated**: 2026-06-14

> **Status legend** — Feature Breakdown and Key Design Decisions mark each item as
> `shipped` (implemented in `autolearn.py` / `autolearn.js`), `planned` (designed
> but not yet implemented), or `partial`. Sync Phase 1 (E2E encryption + Fastify
> server + default-persona push/pull) is shipped; multi-persona, Convex backend,
> plugin auto-sync, rotate-key, and interactive conflict resolution remain planned.

## Problem Statement

AI coding agents repeat the same mistakes across sessions because they have no mechanism to learn from user corrections, preferences, and recurring patterns. Every session starts from scratch, forcing users to re-state the same preferences and re-correct the same behaviors.

## Goals

1. **Automatic learning** — Capture user corrections and preferences from conversation flow without requiring explicit "remember this" commands. _(shipped)_
2. **Behavioral escalation** — Detect when a correction recurs across projects and escalate it into persistent agent instructions (AGENTS.md). _(shipped via `self-improving-agent/improve.py`)_
3. **Skill evolution** — Allow the agent to create, patch, and retire its own skills based on observed patterns. _(shipped)_
4. **Zero-friction operation** — Work as a background plugin that requires no user intervention during normal operation. _(shipped)_
5. **Cross-machine sync** — Propagate learned knowledge between machines via an E2E-encrypted sync service. _(partial — Phase 1 shipped: AES-256-GCM crypto, sync CLI, Fastify+SQLite backend. Multi-persona + Convex backend + plugin auto-sync still planned. See Decisions 5–7 and `docs/designs/sync/`.)_

## Non-Goals

- **Cross-agent synchronization** — Each agent harness manages its own autolearn store; no sync between Claude Code, Copilot, etc.
- **Cloud-based memory (plaintext)** — All data stays local by default. Sync is optional and E2E-encrypted; the server never sees plaintext.
- **Model fine-tuning** — Autolearn changes agent behavior via instructions and skills, not model weights.
- **Self-improving-agent invocation boundary** — The `improve.py` observation/escalation CLI is bundled in this repo (under `skills/self-improving-agent/`) but is **not invoked directly by the plugin** — only the reviewer agent calls it via the SKILL.md protocol. This keeps the plugin thin and lets the reviewer decide when a correction is worth recording.
- **Real-time collaborative editing** — Single-writer per persona per machine at a time.
- **Cross-user persona sharing** — Personas are private to one user (future: team personas with key exchange).

## Target Users

- **Developers using OpenCode** who want their coding agent to improve over time without manual configuration.
- **Agent skill authors** who want skills that can be patched and extended by the autolearn system.

## Architecture Overview

```
Machine A                              Machine B
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│         OpenCode Runtime         │   │         OpenCode Runtime         │
│                                  │   │                                  │
│  ┌────────────────────────────┐  │   │  ┌────────────────────────────┐  │
│  │     autolearn.js (Plugin)  │  │   │  │     autolearn.js (Plugin)  │  │
│  │  Turn Counter → Buffer     │  │   │  │  Turn Counter → Buffer     │  │
│  │  → Idle → Review Spawner   │  │   │  │  → Idle → Review Spawner   │  │
│  └────────────┬───────────────┘  │   │  └────────────┬───────────────┘  │
│               │                  │   │               │                  │
│     autolearn-reviewer agent     │   │     autolearn-reviewer agent     │
│               │                  │   │               │                  │
│  ┌────────────▼───────────────┐  │   │  ┌────────────▼───────────────┐  │
│  │     autolearn.py (CLI)     │  │   │  │     autolearn.py (CLI)     │  │
│  │                            │  │   │  │                            │  │
│  │  memory/user/skill/curator │  │   │  │  memory/user/skill/curator │  │
│  │  sync push/pull (E2E enc)  │  │   │  │  sync push/pull (E2E enc)  │  │
│  └────────────┬───────────────┘  │   │  └────────────┬───────────────┘  │
│               │                  │   │               │                  │
│  ┌────────────▼───────────────┐  │   │  ┌────────────▼───────────────┐  │
│  │  ~/.autolearn/             │  │   │  │  ~/.autolearn/             │  │
│  │  personas/                 │  │   │  │  personas/                 │  │
│  │    default/                │  │   │  │    default/                │  │
│  │    work/                   │  │   │  │    work/                   │  │
│  │    personal/               │  │   │  │    personal/               │  │
│  └────────────────────────────┘  │   │  └────────────────────────────┘  │
└──────────────────────────────────┘   └──────────────────────────────────┘
                  │                                      │
                  └──────────────┬───────────────────────┘
                                 │  HTTPS (TLS)
                          ┌──────▼──────┐
                          │ Sync Server │
                          │ (opaque     │
                          │  encrypted  │
                          │  blobs only)│
                          │             │
                          │ Convex or   │
                          │ self-hosted │
                          └─────────────┘
```

## Key Design Decisions

### Decision 1: Plugin-based architecture (not standalone service)

**Choice**: OpenCode plugin that hooks into session events.

**Rationale**: Plugins have direct access to conversation events (message deltas, idle state) without requiring a separate process, network port, or API. The plugin is loaded in-process and can react to events in real time.

**Alternatives considered**:
- Standalone daemon with API: More complex, requires port management, adds network latency to event processing.
- Post-session script: Loses real-time idle detection and requires a separate trigger mechanism.

### Decision 2: Markdown-based data store

**Choice**: Plain markdown files (`memory.md`, `user-profile.md`) for persistent knowledge.

**Rationale**: OpenCode loads instruction files directly into agent context. Markdown files serve as both storage and context injection — no conversion needed. The agent reads the same file the user can edit.

**Alternatives considered**:
- SQLite: More queryable but not readable by the agent without tool calls. Adds a binary dependency.
- JSON: Structured but not human-readable and not directly loadable as instructions.

### Decision 3: Subprocess spawning for reviews

**Choice**: Spawn a separate `opencode run` subprocess for each review, with the `AUTOLEARN_REVIEWER=1` guard to prevent recursive review spawning.

**Rationale**: Reviews are expensive (full LLM call with skill loading). Running them in a subprocess isolates failures, prevents the main session from blocking, and naturally limits concurrency to one review at a time.

**Alternatives considered**:
- In-process background task: Risk of interfering with main session context, harder to isolate failures.
- Job queue: Over-engineered for a single-user local tool.

### Decision 4: Python CLI for data management

**Choice**: `autolearn.py` as a standalone Python script with PEP 723 inline metadata.

**Rationale**: The reviewer agent needs programmatic access to create/patch skills and update memory. A CLI is the simplest interface that both the agent (via bash) and the user (via terminal) can use. PEP 723 inline metadata means no virtualenv setup required — `uv run` handles it.

**Alternatives considered**:
- Node.js CLI: Would match the plugin language but the reviewer agent works better with Python for string processing and YAML manipulation.
- Direct file writes from the skill: Fragile, no validation, no deduplication logic.

### Decision 5: E2E-encrypted sync (zero-knowledge server) — _partial (Phase 1 shipped)_

**Choice**: Client-side AES-256-GCM encryption before syncing. The server stores only opaque ciphertext.

**Rationale**: Sync requires trusting a server with personal coding preferences and habits. E2E encryption means even the database operator (including the user viewing the Convex dashboard) cannot read the content. Master password → PBKDF2 → per-file encryption keys derived via HMAC chain. OS keychain stores the derived key for convenience.

**Alternatives considered**:
- Plaintext sync (trust the server): Simpler but unacceptable for privacy-sensitive learning data.
- Per-file symmetric keys without key hierarchy: Simpler but no isolation between personas.
- Asymmetric encryption (public key): Overkill for single-user data, adds complexity.

### Decision 6: Multi-persona knowledge stores — _planned_

**Choice**: Each persona is an isolated subdirectory under `~/.autolearn/personas/{name}/` with its own complete set of files, synced independently.

**Rationale**: Developers operate in distinct contexts (work, personal, OSS) with different conventions and tooling. Mixing them into one memory store creates noise — a work-specific CI pattern isn't useful in personal projects. Personas are client-side namespaced (UUIDs on the server), so persona names like "work" never leave the machine.

**Alternatives considered**:
- Tags on entries instead of separate stores: Requires filtering on every read, no isolation.
- Multiple autolearn installations: Duplication, each needs its own plugin config.
- Single store with persona field: Leakage risk, complex filtering.

### Decision 7: Backend-agnostic sync API (Convex or self-hosted) — _partial (Fastify shipped, Convex pending)_

**Choice**: A thin sync API spec (push/pull/status) that any backend can implement. Ships with a Convex backend and a self-hosted Fastify+SQLite backend.

**Rationale**: Users should not be locked into a specific hosting provider. The managed Convex service is convenient (deploy with `npx convex deploy`), but fully self-hosting should be equally easy (Docker image or bare Node process). The CLI is backend-agnostic — it only needs a URL and API key.

**Alternatives considered**:
- Convex only: Lock-in, users must create a Convex account.
- Generic S3/object store: No conflict detection, no per-file metadata, no auth built in.
- Git-based sync: Merge conflicts on markdown bullet lists, requires git knowledge, no realtime.

## Data Store Layout

### Current (shipped)

```
~/.autolearn/
├── config.yaml                # Thresholds, intervals, flags
├── memory.md                  # Persistent lessons loaded into every session
├── user-profile.md            # User preferences and habits
├── observations.jsonl         # Event log (append-only, trimmed to 1000 lines)
├── strengths.json             # Reinforcement counters per memory entry
├── reviews/                   # Generated review markdown files
│   ├── review-{timestamp}.md        # threshold/idle-triggered reviews
│   └── review-exit-{timestamp}.md   # exit-triggered reviews
├── review-failed-{ts}.md      # Reviews that errored (kept for debugging)
├── skills/                    # Agent-created skills
│   ├── {skill-name}/
│   │   └── SKILL.md
│   ├── .archive/              # Archived skills
│   └── .usage.json            # Skill usage telemetry
├── search.db                  # FTS5 index over past OpenCode sessions
├── bin/                       # Wrapper scripts written by the plugin
│   └── review-runner.sh
├── debug.log                  # Verbose plugin output (when AUTOLEARN_DEBUG=1)
└── .curator_state.json        # Curator run history
```

### Planned (when sync/multi-persona ship)

The flat layout above moves under `personas/{name}/`:

```
~/.autolearn/
├── personas/
│   └── default/               ← no --persona flag = "default"
│       ├── config.yaml
│       ├── memory.md
│       ├── user-profile.md
│       ├── observations.jsonl
│       ├── strengths.json
│       ├── reviews/
│       ├── skills/
│       │   ├── {skill-name}/
│       │   │   └── SKILL.md
│       │   ├── .archive/
│       │   └── .usage.json
│       └── .curator_state.json
├── sync.yaml                  # Sync config (server URL, machine ID, active personas)
└── .encryption_salt           # Per-installation salt for key derivation
```

## Feature Breakdown

| Feature | Status | Description | Components |
|---------|--------|-------------|------------|
| Conversation Monitoring | shipped | Count turns, buffer messages, detect idle, exit review | autolearn.js |
| Review Spawning | shipped | Format and dispatch reviews at thresholds and on exit | autolearn.js |
| Knowledge Store | shipped | Memory, user profile, observations, reinforcement tracking | autolearn.py |
| Skill Management | shipped | Create, patch, archive, usage tracking | autolearn.py |
| Skill Lifecycle | shipped | Auto-transition stale/archived, curator with escalation | autolearn.py |
| Review Agent | shipped | Examine conversations, extract learnings | autolearn-reviewer SKILL.md |
| Session Search | shipped | FTS5 full-text search over past OpenCode conversations | autolearn.py, search.db |
| Behavioral Escalation | shipped | Cross-project rule tracking and AGENTS.md writes | self-improving-agent/improve.py |
| E2E-Encrypted Sync | partial | Client-side AES-256-GCM, zero-knowledge server. Phase 1 ships crypto, CLI (`sync login/push/pull/status`), Fastify backend. rotate-key + interactive pull deferred. | `autolearn.py` (sync), `sync-server/` |
| Multi-Persona | planned | Isolated knowledge stores per context (work/personal/OSS) | autolearn.py |
| Backend-Agnostic Sync | partial | Fastify+SQLite shipped (uses `bun:sqlite`). Convex HTTP Actions shim planned for Phase 2. | `sync-server/` |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Review spawning loops | `AUTOLEARN_REVIEWER=1` guard prevents recursive spawning; buffer depth check skips reviews containing review content |
| Lost conversation on exit | Process-level `beforeExit` and signal handlers dispatch a final review before shutdown |
| Memory bloat | 3000-char cap on memory.md, automatic trimming of oldest entries |
| Stale review files | Auto-cleanup based on `stale_after_days` config |
| Secret leakage | Regex redaction of API keys, tokens, passwords from buffered messages |
| Concurrent writes | Review subprocess writes to unique timestamped files; no file-level contention |
| Sync server breach | Server stores only ciphertext — no plaintext exposure even with full DB access |
| Lost encryption key | Data is irrecoverable by design. `sync export-key` creates offline backup |
| Sync conflicts | Last-write-wins by timestamp; append-only merge for observations.jsonl |
| Persona isolation failure | Per-persona HMAC-derived keys — compromising one persona doesn't expose others |

## Related Designs

### Shipped

- [Conversation Monitoring LLD](./designs/conversation-monitoring/LLD.md) (+ 2 EARS: turn-counting, review-spawning)
- [Knowledge Store LLD](./designs/knowledge-store/LLD.md) (+ 2 EARS: memory-management, observations-logging)
- [Skill Management LLD](./designs/skill-management/LLD.md) (+ 2 EARS: skill-crud, skill-lifecycle)
- [Review Agent LLD](./designs/review-agent/LLD.md) (+ 2 EARS: conversation-evaluation, action-execution)
- [Session Search LLD](./designs/session-search/LLD.md)

### Planned (designs describe target state, not current code)

- [Sync Encryption LLD](./designs/sync/encryption-LLD.md) (+ EARS)
- [Sync Protocol LLD](./designs/sync/protocol-LLD.md) (+ EARS)
- [Multi-Persona LLD](./designs/sync/persona-LLD.md) (+ EARS)
