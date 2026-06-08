# Knowledge Store - Low-Level Design

**Created**: 2026-06-05
**HLD Link**: ../high-level-design.md

## Overview

The knowledge store is the persistent data layer for autolearn. It manages three types of knowledge: persistent memory (loaded into every session), user profile (preferences and habits), and observations (append-only event log). All access goes through `autolearn.py` CLI commands.

## Context

Per the HLD, data lives in `~/.autolearn/` as plain files. The autolearn-reviewer agent calls `autolearn.py` via bash to read and write these files. OpenCode directly loads `memory.md` as an instruction file into agent context.

## Data Models

### Memory (`memory.md`)

Markdown file with bullet-list entries, loaded into every agent session via `opencode.json` instructions.

```markdown
# Autolearn Memory

<!-- Managed by autolearn. Do not edit the structure. -->

- entry text here
- another entry
```

| Constraint | Value |
|-----------|-------|
| Max total characters | 3000 |
| Deduplication | Case-insensitive exact match on normalized text (safety net) |
| Reinforcement | Agent-driven: reviewer calls `memory strengthen` for semantic duplicates |
| Trimming | Oldest entries dropped when over cap |

### User Profile (`user-profile.md`)

Same format as memory, but for user preferences about communication, workflow, and habits.

| Constraint | Value |
|-----------|-------|
| Max total characters | 2000 |
| Deduplication | Case-insensitive exact match |
| Trimming | Oldest entries dropped when over cap |

### Observations (`observations.jsonl`)

Append-only JSONL file. Each line is a JSON object with at minimum `type`, `timestamp`, and `project` fields.

| Field | Type | Description |
|-------|------|-------------|
| type | string | Event type (e.g., "review_spawned") |
| timestamp | string | ISO 8601 |
| project | string | Project name (directory basename) |
| * | any | Additional fields per event type |

| Constraint | Value |
|-----------|-------|
| Max lines | 1000 |
| Trimming | Oldest lines dropped |

### Config (`config.yaml`)

Simple key-value YAML. Parsed line-by-line (no full YAML parser dependency at plugin level).

```yaml
review_threshold: 5
session_review_on_idle: true
max_conversation_buffer: 50
curator_interval_days: 7
stale_after_days: 30
archive_after_days: 90
escalation_threshold: 3
```

### Reinforcement Strengths (`strengths.json`)

JSON dict mapping slugified entry text to reinforcement metadata.

```json
{
  "always-use-uv-for-python": {
    "count": 3,
    "first_seen": "2026-06-07",
    "last_seen": "2026-06-07"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| count | int | Number of times this entry was observed (1 = first, 2+ = reinforced) |
| first_seen | string | ISO date when first observed |
| last_seen | string | ISO date when last reinforced |

## CLI Commands (autolearn.py)

### Memory Management

| Command | Description |
|---------|-------------|
| `memory add <content>` | Append entry, deduplicate, trim to 3000 chars |
| `memory remove <keyword>` | Remove entries containing keyword (case-insensitive) |
| `memory list` | Print numbered list of entries with char count |
| `memory strengths` | Show reinforcement statistics sorted by strength |
| `memory strengthen <keyword>` | Increment strength on matching entry (agent semantic dedup) |
| `memory weaken <keyword>` | Decrement strength on matching entry |

### User Profile Management

| Command | Description |
|---------|-------------|
| `user add <content>` | Append preference, deduplicate, trim to 2000 chars |
| `user remove <keyword>` | Remove entries containing keyword |
| `user list` | Print numbered list of entries |

### Initialization

| Command | Description |
|---------|-------------|
| `init` | Create `~/.autolearn/` structure with defaults if missing |

## Entry Extraction Logic

`_extract_entries(md)` parses markdown into a list of entry strings:

1. Skip HTML comments (`<!-- ... -->`)
2. Skip lines starting with `#`
3. Strip `- ` or `* ` list prefixes
4. Skip empty lines
5. Return remaining non-empty lines as entries

## Entry Writing Logic

`_entries_to_md(entries, header)` reconstructs markdown:

1. Write `# {header}` heading
2. Write managed-by comment
3. Write each entry as `- {entry}`

## Deduplication

`_dedup(entries)` normalizes each entry (lowercase, strip) and keeps only the first occurrence by exact match. This is a safety net only — the primary semantic dedup is agent-driven.

## Reinforcement (Agent-Driven Semantic Dedup)

The reviewer agent reads `memory list`, judges whether a new observation is semantically the same as an existing entry, and calls `memory strengthen <keyword>` to increment the strength counter in `strengths.json`. This keeps the semantic judgment in the agent (which understands meaning) rather than relying on string similarity heuristics.

The curator reads `strengths.json` and reports entries exceeding `escalation_threshold` (default 3) as candidates for promotion to AGENTS.md.

## Trimming

`_trim_entries(entries, max_chars)` removes entries from the front (oldest first) until total character count is within the limit. Always keeps at least one entry.

## Environment Override

`AUTOLEARN_HOME` environment variable overrides the default `~/.autolearn/` path. Used for testing and isolated stores.

## Edge Cases

1. **Store doesn't exist**: `_ensure_dirs()` creates the full directory tree on first access.
2. **Markdown file missing**: `_read_md()` returns empty string; downstream treats as empty entry list.
3. **Config file unparseable**: `parseConfig()` (in plugin) and `_load_config()` (in CLI) both return defaults on error.
4. **Concurrent CLI calls**: No locking in the Python CLI — safe for single-agent use but not parallel writes.

## Dependencies

- **Python ≥3.11**: f-strings, `pathlib.Path`
- **PyYAML**: Config file parsing
- **PEP 723 inline metadata**: `uv run` resolves `pyyaml` automatically

## Related Documents

- [High-Level Design](../../high-level-design.md)
- [Memory Management EARS](./memory-management-EARS.md)
- [Observations Logging EARS](./observations-logging-EARS.md)
