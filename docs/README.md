# Autolearn Design Docs

## Index

Start with the [High-Level Design](./high-level-design.md) — it has a status column on the Feature Breakdown table and marks each Key Decision as `shipped` or `planned`.

### Shipped features

| Design | LLD | EARS | Code |
|--------|-----|------|------|
| Conversation Monitoring | [LLD](./designs/conversation-monitoring/LLD.md) | [turn-counting](./designs/conversation-monitoring/turn-counting-EARS.md), [review-spawning](./designs/conversation-monitoring/review-spawning-EARS.md) | `plugin/autolearn.js` |
| Knowledge Store | [LLD](./designs/knowledge-store/LLD.md) | [memory-management](./designs/knowledge-store/memory-management-EARS.md), [observations-logging](./designs/knowledge-store/observations-logging-EARS.md) | `autolearn.py` (memory, user, observations) |
| Skill Management | [LLD](./designs/skill-management/LLD.md) | [skill-crud](./designs/skill-management/skill-crud-EARS.md), [skill-lifecycle](./designs/skill-management/skill-lifecycle-EARS.md) | `autolearn.py` (skill, curator) |
| Review Agent | [LLD](./designs/review-agent/LLD.md) | [conversation-evaluation](./designs/review-agent/conversation-evaluation-EARS.md), [action-execution](./designs/review-agent/action-execution-EARS.md) | `skills/autolearn-reviewer/SKILL.md` |
| Session Search | [LLD](./designs/session-search/LLD.md) | — | `autolearn.py` (search) |
| Behavioral Escalation | (covered in self-improving-agent SKILL) | — | `skills/self-improving-agent/SKILL.md`, `improve.py` |

### Partial (Phase 1 shipped, Phase 2+ pending)

| Design | LLD | EARS | Code | Status |
|--------|-----|------|------|--------|
| Sync Encryption | [LLD](./designs/sync/encryption-LLD.md) | [EARS](./designs/sync/encryption-EARS.md) | `scripts/sync_crypto.py`, `autolearn.py` (sync) | Crypto + key management shipped (login/logout/export-key). `rotate-key` deferred. |
| Sync Protocol | [LLD](./designs/sync/protocol-LLD.md) | [EARS](./designs/sync/protocol-EARS.md) | `autolearn.py` (sync push/pull/status), `sync-server/` | Fastify+SQLite backend + CLI shipped. Convex backend, plugin auto-sync, interactive pull deferred. |
| Multi-Persona | [LLD](./designs/sync/persona-LLD.md) | [EARS](./designs/sync/persona-EARS.md) | — | Planned. Phase 1 uses an implicit `default` persona derived from the install salt. |

The data layout is currently flat under `~/.autolearn/` (not under `personas/default/`). Phase 1 sync treats this flat layout as the implicit default persona; the multi-persona directory migration is Phase 3.

## Conventions

- **LLD** (Low-Level Design): describes a single component's architecture, data structures, and edge cases. One per feature area.
- **EARS** (Easy Approach to Requirements Syntax): testable requirement specifications using the `WHEN <trigger> THE SYSTEM SHALL <behavior>` form. Each LLD links to its EARS files.
- Code references in EARS use `@spec <ID>` tags that map back to LLD section IDs.
