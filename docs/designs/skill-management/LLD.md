# Skill Management - Low-Level Design

**Created**: 2026-06-05
**HLD Link**: ../high-level-design.md

## Overview

Skill management covers the creation, patching, archival, usage tracking, and lifecycle transitions of agent-created skills stored in `~/.autolearn/skills/`. Skills are markdown files (SKILL.md) that the autolearn-reviewer agent creates when it identifies repeatable patterns in conversations.

## Context

Per the HLD, skills live in `~/.autolearn/skills/` as directories containing a `SKILL.md` file. The curator automates lifecycle transitions (active → stale → archived). Only autolearn-created skills are managed by the curator — user-installed or bundled skills are never touched.

## Data Models

### Skill Directory

```
~/.autolearn/skills/
├── my-skill/
│   └── SKILL.md           # The skill definition
├── another-skill/
│   └── SKILL.md
└── .archive/               # Archived skills (moved, not copied)
    ├── old-skill/
    │   └── SKILL.md
    └── ...
```

### SKILL.md Format

```yaml
---
name: skill-name
description: |
  What this skill does and when to load it.
created_by: autolearn
created_at: "2026-06-05"
---

# Skill Name

Description text.

## Instructions

- Specific instruction 1
- Specific instruction 2
```

The `created_by: autolearn` frontmatter tag distinguishes agent-created skills from user-installed ones.

### Usage Telemetry (`.usage.json`)

```json
{
  "my-skill": {
    "created_by": "autolearn",
    "created_at": "2026-06-05",
    "use_count": 0,
    "patch_count": 3,
    "last_activity_at": "2026-06-05",
    "state": "active",
    "pinned": false
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| created_by | string | "autolearn" or "user" |
| created_at | string | ISO date |
| use_count | number | Times skill was loaded (currently always 0 — tracking not yet wired) |
| patch_count | number | Times skill was patched |
| last_activity_at | string | ISO date of last create/patch/usage |
| state | string | "active", "stale", or "archived" |
| pinned | boolean | If true, exempt from curator transitions |

### Curator State (`.curator_state.json`)

```json
{
  "last_run": "2026-06-05",
  "runs": [
    {
      "date": "2026-06-05",
      "transitions": {
        "stale": ["old-skill"],
        "archived": ["ancient-skill"],
        "active": []
      }
    }
  ]
}
```

## CLI Commands

### Skill CRUD

| Command | Description |
|---------|-------------|
| `skill create <name> <description>` | Create new skill directory with SKILL.md and register in `.usage.json` |
| `skill patch <name> <section> <content>` | Add content to an existing section (or create section) in SKILL.md |
| `skill archive <name>` | Move skill directory to `.archive/`, update state to "archived" |
| `skill list` | Print all skills with state, use count, patch count, last activity |
| `skill usage` | Dump full `.usage.json` |

### Curator

| Command | Description |
|---------|-------------|
| `curator run` | Execute lifecycle transitions based on inactivity thresholds |
| `curator status` | Print summary: active/stale/archived counts, last run date |

## Skill Creation Flow

1. Slugify name (lowercase, replace non-alphanumeric with `-`, max 60 chars)
2. Check skill doesn't already exist — exit 1 if duplicate
3. Create `{SKILLS_DIR}/{slug}/SKILL.md` with frontmatter and template
4. Register in `.usage.json` with `state: "active"`, `use_count: 0`

## Skill Patching Flow

1. Slugify name, resolve skill file
2. Check section header `## {section}` exists in SKILL.md
3. If section exists: append `- {content}` before the next `##` heading
4. If section doesn't exist: append `## {section}\n\n- {content}` at end
5. Increment `patch_count` and update `last_activity_at` in `.usage.json`

## Skill Archival Flow

1. Check skill directory exists
2. Check not already in `.archive/`
3. `fs.rename()` skill directory into `.archive/`
4. Update state to "archived" with `archived_at` date in `.usage.json`

## Curator Lifecycle

Configurable thresholds from `config.yaml`:

| Transition | Default Threshold | Condition |
|-----------|-------------------|-----------|
| active → stale | 30 days | No activity for `stale_after_days` |
| stale → archived | 90 days | No activity for `archive_after_days` |

Exemptions:
- `pinned: true` skills are never transitioned
- `created_by != "autolearn"` skills are never transitioned
- Already-archived skills are skipped

Curator is idempotent — running it multiple times produces the same result.

## Edge Cases

1. **Skill name collision**: `skill create` exits with error if SKILL.md already exists.
2. **Patching non-existent skill**: Exits with error.
3. **Archiving non-existent skill**: Exits with error.
4. **Already archived**: `skill archive` exits with error (`.archive/{name}` already exists).
5. **Empty usage data**: Commands return "No skills created yet" or empty JSON.
6. **Corrupt `.usage.json`**: Loaded as empty dict (graceful fallback).

## Dependencies

- **Python ≥3.11**: f-strings, `pathlib.Path`
- **PyYAML**: Frontmatter parsing (via `yaml.safe_load` on config)
- **PEP 723 inline metadata**: `uv run` resolves `pyyaml` automatically

## Related Documents

- [High-Level Design](../../high-level-design.md)
- [Skill CRUD EARS](./skill-crud-EARS.md)
- [Skill Lifecycle EARS](./skill-lifecycle-EARS.md)
