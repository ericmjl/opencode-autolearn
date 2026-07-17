# Certified Procedures - EARS Requirements

**Spec**: `docs/designs/certified-procedures/LLD.md`
EARS = Easy Approach to Requirements Syntax (`WHEN <trigger> THE SYSTEM SHALL <behavior>`).
Code references use `@spec CP-<ID>` tags.

## outcomes.py — shared spine

### CP-OUT-001 (incremental index)
**WHEN** the user runs `outcomes init` **THE SYSTEM SHALL** index `opencode.db`
`part` rows newer than the last indexed `time_created`, dispatching on
`json_extract(data,'$.type')` to `tool` and `step-finish` (ignoring all others),
into `outcomes.db`, without writing to `opencode.db`.

### CP-OUT-002 (full rebuild)
**WHEN** the user runs `outcomes init --full` **THE SYSTEM SHALL** truncate
`tool_outcome`, `step_cost`, and the `last_part_time` mark before re-indexing.

### CP-OUT-003 (ground-truth classification)
**WHEN** a tool part is indexed **THE SYSTEM SHALL** classify its ground-truth
strength into `{4 test, 3 exit-code, 1 raw, 0 none}` and store it as
`gt_strength`, preferring `state.metadata.exit` for bash exit codes, and where
raw output (grep/read/edit) is never above 1. (The `2 correction` class — a user
text correction within a window after the call — is **reserved for the deferred
probabilistic layer** and is not assigned by the deterministic index.)

### CP-OUT-004 (data-returning query API)
**WHEN** a caller requests outcomes **THE SYSTEM SHALL** return structured rows
from `outcomes.db` (not print them), so `falsify.py` and `shortcuts.py` can
consume them without importing `autolearn.py`.

### CP-OUT-005 (reuse-ledger derivation)
**WHEN** `skill_use_counts()` is called **THE SYSTEM SHALL** return a
`{skill_name: load_count}` map derived from `tool='skill'` part counts,
independent of `.usage.json`.

## falsify.py — Loop 1 (deterministic)

### CP-FAL-001 (claim discovery)
**WHEN** a skill is verified **THE SYSTEM SHALL** discover its strongest
falsifiable claim as `test-suite` (if `scripts/test_*.py` exists) else
`declared` (if SKILL.md frontmatter has a `verify:` block) else `none`.

### CP-FAL-002 (deterministic verdict)
**WHEN** a skill has a `test-suite` or `declared` claim **THE SYSTEM SHALL**
execute it in the skill directory with a timeout and produce a `pass` / `fail`
/ `inconclusive` verdict; a skill with no claim **SHALL** receive
`inconclusive, method: none` and be left untouched.

### CP-FAL-003 (bounded execution safety)
**WHEN** a declared command is outside a safe subset (read-only commands + test
runners, no network) **THE SYSTEM SHALL** return `inconclusive` rather than
execute it.

### CP-FAL-004 (consequence policy — deterministic)
**WHEN** a skill's consecutive `fail` count reaches `falsify_fail_demote_after`
**THE SYSTEM SHALL** set its `.usage.json` state to `stale` and flag it for
patch, unless the skill is `pinned` (flagged only).

### CP-FAL-005 (no probabilistic auto-demote)
**WHEN** only correlation-based (probabilistic) evidence is available **THE
SYSTEM SHALL** flag the skill for review and **SHALL NOT** auto-demote it.

## shortcuts.py — Loop 2 (efficiency)

### CP-SHO-001 (roundabout detection)
**WHEN** a recent session contains a help-chain (>= `roundabout_help_depth`
consecutive `--help`/`-h` probes before a working command) or an error-run (>=
`roundabout_error_run` consecutive error tool calls before a completed one with
the same tool) **THE SYSTEM SHALL** record it as a roundabout candidate with
`cost_tokens` = the summed `step_cost` between the markers.

### CP-SHO-002 (golden-path staging)
**WHEN** a roundabout candidate has a terminal successful command **THE
SYSTEM SHALL** stage it as a golden-path candidate with that command as
`golden_command`; **WHEN** it has no terminal success **THE SYSTEM SHALL**
record `golden_command: null` and never promote it.

### CP-SHO-003 (promotion gated by verification)
**WHEN** a golden-path candidate is considered for promotion to a skill/memory
**THE SYSTEM SHALL** require a passing deterministic verification
(`falsify.verify_skill`) of the direct command first; unverified candidates
**SHALL NOT** be auto-promoted.

### CP-SHO-004 (minimum-savings threshold)
**WHEN** a candidate's `cost_tokens` is below `shortcut_promote_min_tokens`
**THE SYSTEM SHALL** not surface it for promotion (noise filter).

## integration

### CP-INT-001 (curator wiring)
**WHEN** `curator run` executes **THE SYSTEM SHALL** run `outcomes index`
(incremental), then `falsify run`, then write derived `use_count`s back to
`.usage.json`, in that order.

### CP-INT-002 (inspector surface)
**WHEN** the inspector UI is open **THE SYSTEM SHALL** expose
`/api/procedures` (per-skill verdict + reuse count + method) and
`/api/shortcuts` (staged candidates with estimated tokens-saved), and the
overview **SHALL** include a failing-procedures count.
