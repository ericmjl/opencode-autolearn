# Multi-Persona - Low-Level Design

**Created**: 2026-06-08
**HLD Link**: ../../high-level-design.md (Decision 6)

## Overview

Personas isolate knowledge stores by context (work, personal, OSS). Each persona is a complete, independent autolearn store with its own memory, user profile, skills, and sync settings. Persona names are client-side metadata — the server only sees UUIDs.

## Context

Per the HLD, mixing work and personal knowledge creates noise. A work-specific CI pattern isn't useful in personal projects. Personas provide isolation without requiring multiple autolearn installations.

## Directory Structure

```
~/.autolearn/
├── personas/
│   ├── default/              ← backward compatible, no --persona flag
│   │   ├── memory.md
│   │   ├── user-profile.md
│   │   ├── strengths.json
│   │   ├── config.yaml
│   │   ├── observations.jsonl
│   │   ├── skills/
│   │   ├── .curator_state.json
│   │   └── .usage.json
│   ├── work/
│   │   ├── memory.md
│   │   └── ...
│   └── personal/
│       ├── memory.md
│       └── ...
├── sync.yaml                 # sync config, active persona list
├── .encryption_salt           # shared across personas
└── .persona_registry.json     # { name → uuid } mapping
```

Backward compatibility: when no `--persona` flag is given, commands operate on `personas/default/`. Existing flat-layout installs are migrated automatically — `_migrate_to_personas()` in `autolearn.py` and `migrateToPersonas()` in `plugin/autolearn.js` move top-level files into `personas/default/` on first run after update. The migration is idempotent and silent.

## Persona Registry

`.persona_registry.json` maps human-readable names to server UUIDs:

```json
{
  "default": {
    "uuid": "a1b2c3d4-...",
    "description": "Default knowledge store",
    "sync_enabled": true,
    "created_at": "2026-06-08"
  },
  "work": {
    "uuid": "e5f6a7b8-...",
    "description": "Work projects",
    "sync_enabled": true,
    "created_at": "2026-06-08"
  },
  "personal": {
    "uuid": "c9d0e1f2-...",
    "description": "Personal projects",
    "sync_enabled": true,
    "created_at": "2026-06-08"
  },
  "client-acme": {
    "uuid": "a3b4c5d6-...",
    "description": "ACME client project (NDA)",
    "sync_enabled": false,
    "created_at": "2026-06-08"
  }
}
```

`sync_enabled: false` means the persona stays local-only, never synced to the server.

## CLI Commands

### Persona management

```bash
autolearn persona create <name> "<description>"
autolearn persona list
autolearn persona rename <old> <new>
autolearn persona archive <name>
autolearn persona switch <name>      # set as default for this machine
```

### Existing commands with --persona

```bash
autolearn memory add "..." --persona work
autolearn memory list --persona work
autolearn memory strengthen "uv" --persona work
autolearn user add "..." --persona personal
autolearn skill create <name> "<desc>" --persona work
autolearn curator run --persona work
```

Default: `--persona default` (can be changed via `persona switch`).

### Per-persona sync

```bash
autolearn sync push --persona work
autolearn sync pull --persona personal
autolearn sync push                # pushes the active/machine-default persona
autolearn sync pull                # pulls the active/machine-default persona
```

**Note**: `sync push` / `sync pull` without `--persona` currently operates on the active persona only. Pushing all sync-enabled personas in one command (SYNC-PER-012) is deferred.

## Plugin Integration

The plugin needs to know which persona is active for a given project. Two options:

### Option A: Project-level persona mapping

`.autolearn-persona` file in project root:

```
work
```

The plugin reads this file (or the `AUTOLEARN_PERSONA` env var) to determine which persona to use for that project's reviews.

### Option B: Machine-wide default

`persona switch work` sets the default persona for the entire machine. All reviews use that persona.

**Recommendation**: Option A for multi-persona, Option B as fallback. The plugin checks `.autolearn-persona` first, then falls back to `persona switch` default, then falls back to `default`.

**Implementation status**: Option A (`.autolearn-persona`) is deferred (SYNC-PER-014). The shipped plugin always operates on `personas/default/` — it does not yet read the machine-wide default from `.default_persona` or the project-level `.autolearn-persona` file. CLI commands honor `persona switch` and `--persona` correctly; the plugin will gain multi-persona awareness in a future iteration.

## OpenCode Config

`opencode.json` instructions path points at the default persona's memory:

```json
{
  "instructions": [
    "~/.autolearn/personas/default/memory.md"
  ]
}
```

Loading memory from multiple active personas (SYNC-PER-017) is deferred — the current `injectInstructions()` only adds the default persona's path.

## Sync Isolation

Per the encryption LLD, each persona has a separate encryption key derived via:

```
master_key → HMAC(master_key, persona_uuid) → persona_key
persona_key → HMAC(persona_key, file_path) → file_key
```

Compromising one persona's ciphertext does not expose other personas' data.

## Use Cases

| Scenario | Persona | Sync |
|----------|---------|------|
| Personal laptop, personal projects | `default` | on |
| Work laptop, work repos | `work` | on |
| OSS contributions across machines | `oss` | on |
| Client project with strict NDA | `client-acme` | **off** (local only) |
| Temporary experiment | `scratch` | off, auto-archive after 30 days |

## Edge Cases

1. **Persona deleted on another machine**: Pull returns empty for that persona. CLI warns, does not delete local data.
2. **`.autolearn-persona` points to non-existent persona**: CLI creates it on first use.
3. **Same persona name on different machines**: Registry maps name → UUID. Same UUID = same persona (synced). Different UUID = different stores (independent).
4. **Archived persona**: Files kept locally but read-only. Sync disabled. `persona unarchive` to reactivate.

## Related Documents

- [High-Level Design](../../high-level-design.md)
- [Encryption LLD](./encryption-LLD.md)
- [Sync Protocol LLD](./protocol-LLD.md)
- [Multi-Persona EARS](./persona-EARS.md)
