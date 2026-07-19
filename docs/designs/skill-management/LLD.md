# Skill Management - Low-Level Design

**Created**: 2026-06-05
**HLD Link**: ../high-level-design.md

## Overview

Skill management covers the creation, patching, archival, usage tracking, and lifecycle transitions of agent-created skills stored in `~/.autolearn/skills/`. Skills are markdown files (SKILL.md) that the autolearn-reviewer agent creates when it identifies repeatable patterns in conversations. Created skills are symlinked into `~/.agents/skills/` so OpenCode auto-discovers them.

## Context

Per the HLD, skills live in `~/.autolearn/skills/` as directories containing a `SKILL.md` file. The curator automates lifecycle transitions (active → stale → archived). Only autolearn-created skills are managed by the curator — user-installed or bundled skills are never touched.

### Symlink Pattern

When a skill is created, a symlink is placed at `~/.agents/skills/{slug}` pointing to the real directory at `~/.autolearn/skills/{slug}`. This makes the skill visible to OpenCode's skill discovery without mixing autolearn's tracking data with user-installed skills.

When a skill is archived, the symlink is removed (but the real directory is preserved in `~/.autolearn/skills/.archive/`).

```
~/.agents/skills/
├── autolearn-reviewer/          # user-installed skill
├── my-learned-skill → ~/.autolearn/skills/my-learned-skill/  # symlink
└── ...

~/.autolearn/skills/
├── my-learned-skill/
│   └── SKILL.md                 # actual skill content
└── .usage.json                  # autolearn tracking
```

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
  },
  "atomic-commits": {
    "created_by": "tracked-manual",
    "created_at": "2026-07-19",
    "use_count": 5,
    "patch_count": 0,
    "last_activity_at": "2026-07-19",
    "state": "active",
    "pinned": false
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| created_by | string | "autolearn", "tracked-manual", or "user" (legacy; rarely written) |
| created_at | string | ISO date |
| use_count | number | Times skill was loaded. Authoritatively derived from the outcome index by `repair_skill_use_counts()`. |
| patch_count | number | Times skill was patched (autolearn-created only) |
| last_activity_at | string | ISO date of last create/patch/usage. For `tracked-manual` entries, derived from the most recent `tool='skill'` part in `opencode.db`. |
| state | string | "active", "stale", or "archived" |
| pinned | boolean | If true, exempt from curator transitions |

#### `created_by` values and what they mean

| Value | Meaning | Curator manages it? |
|-------|---------|---------------------|
| `"autolearn"` | Skill was created by the autolearn-reviewer agent via `skill create`. | Yes — subject to stale/archive transitions (SM-LC-007). |
| `"tracked-manual"` | Skill was installed by the user (or a tooling installer) and lives on disk outside `.autolearn/`. Tracked for usage telemetry only, added by `repair_skill_use_counts()` when the outcome index observes at least one load. | **No** — never auto-archived, never state-transitioned. Surfaced in audits so the user can decide. |
| `"user"` | Legacy value from earlier schema drafts. Treated the same as `"tracked-manual"` for retention purposes (not managed). | No |

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
- `created_by != "autolearn"` skills are never transitioned (this explicitly includes `"tracked-manual"` entries — SM-LC-017)
- Already-archived skills are skipped

Curator is idempotent — running it multiple times produces the same result.

## Usage Tracking Repair

`repair_skill_use_counts()` runs as a side-effect of every `curator run` (orchestrated under CP-INT-001). Its job is to keep `.usage.json`'s `use_count` and `last_activity_at` fields in sync with the authoritative source: the `tool='skill'` parts recorded in `opencode.db` and indexed by the outcome index (CP-OUT-005).

### Two phases

**Phase 1 — Update existing entries.** For every skill already in `.usage.json`, copy the latest `use_count` from the outcome index and refresh `last_activity_at` if the outcome index observes a more recent load than the recorded date. Never modifies `created_by` on existing entries (SM-LC-016).

**Phase 2 — Add `tracked-manual` entries for previously-untracked skills.** Scan all configured skill-discovery directories (`~/.agents/skills/`, `~/.config/opencode/skills/`, configurable via the `AUTOLEARN_SKILL_DISCOVERY` env var) for `SKILL.md` files. For any skill on disk that:

- is **not** already in `.usage.json`, AND
- has been **loaded at least once** (count > 0 in the outcome index)

add a new entry with `created_by: "tracked-manual"`, `state: "active"`, `created_at` derived from the `SKILL.md` file mtime, `use_count` from the index, and `last_activity_at` derived from the most recent `tool='skill'` part timestamp.

### Non-resurrection rule (SM-LC-015)

The disk scan **must skip** any directory whose name starts with `.archive` (e.g. `.archive/`, `.archive-manual/`). This guarantees that a user who has explicitly archived a manual skill (e.g. via `mv ~/.agents/skills/foo ~/.agents/skills/.archive-manual/`) will not have it silently re-appear in `.usage.json` on the next curator run.

### Why this is non-destructive

`tracked-manual` entries are **observe-only**. The curator's retention loop checks `meta.get("created_by") != "autolearn"` (autolearn.py:870) and skips; the new `"tracked-manual"` value therefore falls through the same exemption the legacy `"user"` value already used. A `tracked-manual` skill is never auto-archived, never state-transitioned, and never deleted. The data exists purely so audits (manual or future tooling) can answer "is this skill actually being used?" with real signal rather than mtime heuristics.

### Discovery

The scan is performed by the `_skill_discovery_dirs()` helper, which returns a list of directories to walk. By default it returns:

```python
[
    Path.home() / ".agents" / "skills",
    Path.home() / ".config" / "opencode" / "skills",
]
```

For test isolation, the `AUTOLEARN_SKILL_DISCOVERY` env var (os-path-separated list) overrides the defaults. Mirrors the directories opencode scans for skill discovery. Project-local `.agents/skills/` directories are intentionally **not** scanned — they are repo-specific and would produce noise in the global `.usage.json`. (Future work: optional project-aware scan.)

> **Known asymmetry (not a bug):** `opencode.db` records every `tool='skill'` load regardless of where the skill lives on disk. Skills loaded only from project-local directories (e.g. `~/Documents/brain42/.agents/skills/conflict-detector`) appear in `signals` but cannot be matched by the disk scan, so they never become `tracked-manual` entries. They inflate the summary's `skills_with_loads` count without contributing to `added`. This is accepted because project-local skills are inherently repo-scoped, while `.usage.json` is global. A future project-aware scan could close the gap.

## Design Rationale: Why Two Stores (`.usage.json` + `outcomes.db`)

A reader will notice the system maintains **two** data stores that both carry skill-usage signal: `.usage.json` (a JSON file) and `outcomes.db` (a SQLite database, populated by the Certified Procedures subsystem). This section documents why both exist and the trade-off we knowingly accept.

### Data flow

```
1. opencode itself records every tool call (including `skill`) into its own
   SQLite ledger:
       ~/.local/share/opencode/opencode.db  →  `part` table
   This is opencode's core behavior. No autolearn plugin hooks the skill-load
   lifecycle; the source of truth is opencode.db itself.

2. autolearn's OutcomeIndex.index() pulls incrementally from opencode.db
   using a high-water mark (runs as a side-effect of `curator run` and on
   explicit `outcomes init`):
       opencode.db.part  →  outcomes.db.tool_outcome
   This is a polling read, not a push.

3. repair_skill_use_counts() copies the derived signal back out:
       outcomes.db  →  .usage.json
   Specifically the `use_count` and `last_activity_at` fields. This is the
   "repair" step that keeps the two stores in sync.
```

### What each store holds

| Field | `.usage.json` | `outcomes.db` | Notes |
|-------|---------------|---------------|-------|
| `use_count` | ✅ derived (drifts) | ✅ authoritative | `COUNT(*) GROUP BY skill_name` on `tool='skill'` rows |
| `last_activity_at` | ✅ derived (drifts) | ✅ authoritative | `MAX(time_created)` per skill |
| `created_by` | ✅ | ❌ | Provenance: `autolearn`, `tracked-manual`, `user` |
| `created_at` | ✅ | ❌ | Skill creation/installation date |
| `patch_count` | ✅ | ❌ | Could be in outcomes.db if we recorded patch events |
| `state` (active/stale/archived) | ✅ | ❌ | Curator lifecycle state |
| `pinned` | ✅ | ❌ | User-set exemption flag |
| `archived_at` | ✅ | ❌ | When the curator archived the skill |

### Why we keep both (and accept the repair mechanism as a smell)

The two fields `.usage.json` derives from `outcomes.db` (`use_count`, `last_activity_at`) **are a code smell** — having two sources of truth for the same data is what makes the `repair_*()` function necessary. The legitimate fields `.usage.json` holds that have no natural home in outcomes.db are lifecycle state (`state`, `pinned`, `archived_at`), provenance (`created_by`, `created_at`), and patch telemetry (`patch_count`).

The known cleaner factoring would be one of:

- **A. Consolidate entirely** — add a `skill_meta` table to `outcomes.db`, delete `.usage.json`. Pro: single store, no drift. Con: every `load_usage`/`save_usage` callsite (~15) needs rewriting; migration path for existing JSON files.
- **B. Strip `.usage.json` to state-only** — remove `use_count`/`last_activity_at` from `.usage.json`; callers JOIN with outcomes.db for usage. Pro: smallest change that removes the drift surface. Con: ~5 callers need a JOIN.

**We deliberately accept the smell for now** because:

1. **`.usage.json` predates `outcomes.db`.** The skill-management subsystem shipped first; the Certified Procedures subsystem (with `outcomes.db`) was added later. The repair mechanism was the minimal-disruption way to wire usage signal into the existing file.
2. **Neither store syncs across machines.** We confirmed `SYNC_FILES` (autolearn.py:1391) excludes both `.usage.json` and `outcomes.db` — both are machine-local. The "sync purposes" justification one might assume for `.usage.json` does not apply. The right eventual home for cross-machine usage telemetry is an open design question.
3. **The blast radius of consolidation is uncalled for today.** The repair mechanism costs one function and one curator side-effect. Consolidation would touch ~15 callsites and require migration logic. Until that cost is justified by a concrete pain point (e.g. observed drift bugs, a perf issue, a feature blocked by the split), the asymmetry stands.

### Mitigation we DO apply

- The repair function runs on **every** `curator run`, so drift is bounded to the curator interval (currently daily at 3am).
- The disk scan + outcome index are idempotent; running them multiple times produces the same result.
- `repair_skill_use_counts()` never modifies `created_by` on existing entries (SM-LC-016), so a stuck repair can't silently reclassify skills.
- The `tracked-manual` value introduced here is observe-only (SM-LC-017): the retention loop's existing `created_by != "autolearn"` filter (autolearn.py:870) skips them, so even if repair misbehaves, no `tracked-manual` skill gets auto-archived.

### When to revisit

Reopen this design decision when any of these becomes true:

- Drift between `.usage.json` and `outcomes.db` is observed in practice (repair isn't keeping up).
- A feature needs `use_count` to be transactionally consistent with skill creation (currently it isn't — the file write and the outcome index are independent).
- Cross-machine sync wants to ship usage telemetry (would force a decision on which store is canonical).

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
