# Certified Procedures - Low-Level Design

**Created**: 2026-07-16
**HLD Link**: ../../high-level-design.md

## Overview

Certified Procedures gives autolearn the ability to **falsify its own
procedures** (skills) and to **shortcut roundabout workflows to a golden
path**. It imports the discipline of the Schema ARC-AGI-3 harness — maintain a
backtested, executable model of the world and let reality falsify it — adapted
to the non-deterministic, open world of a software repository.

The earlier "Certified Memory" concept (backtesting prose *memories* against
prose conversation snippets) was rejected after review: prose-vs-prose retains
none of Schema's verifiability, the FTS5 search index deliberately excludes
tool-call/outcome data (session-search DD4), and lexical contradiction is
polarity-blind and drift-confounding. The sound target is **skills**
(autolearn's program-analog), falsified against **ground-truth-bearing tool
outcomes** drawn from `opencode.db`.

Two co-equal loops share one data spine:

- **Loop 1 — Falsify (correctness).** Verify a skill's procedure still produces
  its claimed outcome; demote and flag skills that fail. Deterministic first.
- **Loop 2 — Efficiency (golden path).** Detect expensive roundabout tool-call
  sequences in past sessions, extract the direct ("golden") invocation, and
  promote it to a skill/memory — gated by Loop 1 verification before promotion.

```
opencode.db.part  ── tool parts · step-finish parts · skill-load parts
        │
        ▼
outcomes.py  ── SHARED SPINE (index all three; incremental; ground-truth-weighted)
        │              side effect: derives per-skill use_count → repairs .usage.json
        ├─────────────────────────┐
        ▼                         ▼
falsify.py (Loop 1)          shortcuts.py (Loop 2)
 run test_*.py / verify:       detect roundabout sequences (cost = Σ step tokens)
 declared → deterministic      extract golden path → skill/memory,
 verdict {pass|fail|inconclusive}   PROMOTION GATED by falsify before auto-promote
        │
        ▼
consequence layer (curator + improve.py retire-the-loser;
 deterministic fail → auto-demote + flag)
        │
        ▼
inspector UI  ── per-skill verdict · reuse count · est. tokens-saved
```

## Context — why skills + outcomes, not memories + text

Schema's `world_model.py` is executable code whose predictions are checked
against ground truth ("393/393 exact replay"). A repo is not a closed
deterministic system, so exact replay is impossible. But
`opencode.db` *does* carry structured, ground-truth-bearing evidence that the
existing FTS5 index throws away:

- **106k+ tool parts** with `{tool, state.status, state.input, state.output}` —
  including **2,485 with `state.status = "error"`** (a ground-truth failure bit).
- **~98k `step-finish` parts** carrying `tokens {input, output, reasoning,
  cache.read, cache.write}` + `cost` — a real per-step token ledger.
- **1,394 `tool = "skill"` parts** carrying `state.input.name` (the skill slug)
  — direct skill→session linkage, and the basis for the reuse ledger.

The critical epistemic rule: **"replay against recorded history" only
falsifies where the outcome carries a ground-truth bit** — a test pass/fail, a
non-zero exit, or a user correction immediately after. A raw `output` (grep
results, a file dump) is data, not a verdict. The falsifier therefore weights
outcomes by ground-truth strength: **test result > exit code > user correction
> raw output (ignored)**.

## Data Models

### `outcomes.db` (new; persona-local, NOT synced)

Same pattern as `search.db` (session-search DD1): a separate SQLite DB under
autolearn's control, read from `opencode.db`, never written to it. Rebuilt from
scratch at any time. Persona-local because `opencode.db` is machine-local by
nature; verdict provenance is therefore machine-local, not canonical.

```sql
-- High-water mark (mirrors search.db index_state)
CREATE TABLE IF NOT EXISTS index_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Indexed tool-call outcomes
CREATE TABLE IF NOT EXISTS tool_outcome (
    part_id     TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    message_id  TEXT NOT NULL,
    seq         INTEGER NOT NULL,          -- ordering within a session (time_created, id)
    time_created INTEGER NOT NULL,
    tool        TEXT NOT NULL,             -- "bash", "grep", "skill", ...
    status      TEXT NOT NULL,             -- "completed" | "error" | "pending" | "running"
    skill_name  TEXT,                      -- populated when tool == "skill" (state.input.name)
    input_json  TEXT,                      -- raw state.input (for roundabout-detection heuristics)
    output_peek TEXT,                      -- first N chars of state.output (evidence display only)
    gt_strength INTEGER NOT NULL DEFAULT 0 -- 0 none | 1 raw | 3 exit-code | 4 test
                                              -- (2 correction RESERVED for the deferred
                                              --  probabilistic layer; not assigned today)
);
CREATE INDEX IF NOT EXISTS to_session_seq ON tool_outcome (session_id, seq);
CREATE INDEX IF NOT EXISTS to_skill ON tool_outcome (skill_name);
CREATE INDEX IF NOT EXISTS to_tool_status ON tool_outcome (tool, status);

-- Per-step token ledger (from step-finish parts)
CREATE TABLE IF NOT EXISTS step_cost (
    part_id     TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    time_created INTEGER NOT NULL,
    reason      TEXT,                      -- "tool-calls", "stop", ...
    tokens_in   INTEGER NOT NULL DEFAULT 0,
    tokens_out  INTEGER NOT NULL DEFAULT 0,
    tokens_reasoning INTEGER NOT NULL DEFAULT 0,
    cache_read  INTEGER NOT NULL DEFAULT 0,
    cache_write INTEGER NOT NULL DEFAULT 0,
    cost        REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sc_session_seq ON step_cost (session_id, seq);
```

#### Ground-truth strength classification (`gt_strength`)

| Value | Meaning | Source |
|------:|---------|--------|
| 4 | test result | `tool="bash"` (or `task`/run) whose `input`/`output` indicates a test runner (`pytest`, `vitest`, `npm test`, `go test`, …) and whose output contains a pass/fail summary |
| 3 | exit code | `tool="bash"` with a non-zero exit / explicit failure marker in `output`, or `status="error"` |
| 2 | correction | a user `text` part within a small window *after* the tool call that matches a correction cue (reuses the reviewer's signal taxonomy) |
| 1 | raw output | structured output exists but carries no ground-truth bit (grep/read/edit output) |
| 0 | none | no usable outcome |

The falsifier and the roundabout detector only act on `gt_strength >= 2`.

### Skill verdict (`verdicts.json`) — persona-local

A single JSON object under the persona dir, keyed by skill id (latest record
per skill; atomic tmp+rename write). The pairing-ledger analog.

| Field | Type | Description |
|-------|------|-------------|
| skill | string | Skill slug (matches `.usage.json` key). |
| verdict | `"pass"` \| `"fail"` \| `"inconclusive"` | Result of the strongest available check. |
| method | `"test-suite"` \| `"declared"` \| `"none"` | How it was checked. |
| evidence | string | Short human-readable pointer (failing test name, error tail, command). |
| checked_at | string | ISO datetime. |
| fail_count | int | Consecutive failures (resets on pass). |

### Config additions (`config.yaml`)

```yaml
# Certified Procedures
outcomes_index_batch: 5000          # parts per indexing pass
roundabout_help_depth: 2            # >= N help/--help probes in a row = roundabout
roundabout_error_run: 3             # >= N consecutive errors before a success = roundabout
roundabout_recent_sessions: 50      # how many recent sessions to scan
shortcut_promote_min_tokens: 2000   # only promote shortcuts saving >= this many tokens
falsify_fail_demote_after: 1        # consecutive fails before auto-demote
```

## Component APIs

All modules import nothing from `autolearn.py`; `autolearn.py` imports them and
wires subparsers. Each ships a sibling `test_<module>.py` (pytest, `uv run
pytest`). `@spec CP-*` tags map back to the EARS files.

### outcomes.py — the shared spine

```python
OUTCOMES_DB_NAME = "outcomes.db"

class OutcomeIndex:
    def __init__(self, outcomes_db: Path, opencode_db: Path): ...
    def init_schema(self) -> None
    def index(self, *, full: bool = False) -> dict     # incremental high-water mark
                                                         # returns {tool_parts, step_parts,
                                                         #          skill_loads, gt>=2, errors}
    def close(self) -> None

# Data-returning query API (the gap the critique found in search.py):
def list_tool_outcomes(index, *, session_id=None, tool=None, skill=None,
                       min_gt=0, limit=None) -> list[dict]
def session_sequences(index, session_id) -> list[dict]  # ordered tool+step rows for a session
def skill_use_counts(index) -> dict[str, int]            # skill_name -> load count (repairs .usage.json)
def status(index) -> dict

def classify_gt(part_data: dict) -> int                  # 0..4 (see table)
def is_test_command(tool: str, input_json: dict, output_peek: str) -> bool
def exit_code_of(tool: str, status: str, input_json: dict, output_peek: str) -> int | None
def cmd_outcomes_init(args)
def cmd_outcomes_status(args)
```

**Incremental indexing** mirrors `search.db` DD2: track the last indexed
`time_created` in `index_state`; on each `index`, scan `part` rows newer than
the mark, dispatch on `json_extract(data,'$.type')` to `tool` / `step-finish`
(and ignore the rest), classify ground-truth, insert. `--full` truncates first.

**`.usage.json` reuse-ledger repair:** `skill_use_counts()` derives each
skill's `use_count` from `tool='skill'` part counts. The curator / a dedicated
`outcomes sync-usage` step writes these back into `.usage.json` (the field
exists but is never incremented today — skill-management LLD:91).

### falsify.py — Loop 1 (deterministic first)

```python
DEFAULT_CONFIG = {...}  # falsify_fail_demote_after, etc.

def claims_of(skill_dir: Path) -> list[dict]
    # Discover a skill's falsifiable claims, strongest first:
    #  1. test-suite: scripts/test_*.py exists  -> {"method":"test-suite", "path":...}
    #  2. declared:   SKILL.md frontmatter "verify:" block
    #                 {commands:[...], expect_exit:0, expect_output:"..."} -> {"method":"declared",...}
    #  3. none        -> []

def run_claim(claim: dict, *, cwd: Path, timeout: int) -> dict
    # {"verdict":"pass"|"fail"|"inconclusive", "evidence":..., "method":...}
    # Executes the claim in the skill dir; inconclusive on timeout/missing-deps.

def verify_skill(skill_dir: Path, *, usage: dict, config: dict) -> dict
    # Picks the strongest claim; returns a verdict record (see verdicts.json).

def verify_all(skills_dir: Path, verdicts_path: Path, *, config: dict,
               dry_run: bool = False) -> dict
    # Verify every active skill; write verdicts.json; return {pass, fail, inconclusive, none}.

def apply_consequences(usage: dict, verdicts: list[dict], *, config: dict,
                       dry_run: bool = False) -> dict
    # fail_count >= falsify_fail_demote_after -> set state "stale", flag for patch.
    # (Deterministic fails are safe to act on — per user decision.)

def cmd_falsify_run(args)        # --id NAME | --all | --dry-run
def cmd_falsify_verdicts(args)   # print the ledger
```

**Deterministic-first scope:** only `test-suite` and `declared` claims are
evaluated (the user's chosen first path), with **declared > test-suite**
ranking — a declared `verify:` block is the author's exact command (deps,
ignores) and is trusted over the bare `pytest scripts/` heuristic, which may
return `inconclusive` when a skill's tests need deps the bare command can't
resolve. Skills with no claim get `verdict: inconclusive, method: none` and are
left untouched. Correlation-based falsification (skill-load → subsequent
ground-truth outcomes) is **deferred** — it is suggestion-only and must never
auto-demote.

**Batch scope:** by default `verify_all` scans the persona's `skills/` dir
(autolearn-created skills — cheap, used by the curator). `falsify run --all`
and `falsify run --id NAME` additionally scan `~/.agents/skills/` (where
installed skills with test suites / `verify:` blocks live), so the harness can
falsify skills like `autolearn-reviewer` itself. Skills not tracked in
`.usage.json` (i.e. not autolearn-created) are **verified and flagged on
failure but never auto-demoted** — autolearn does not manage their lifecycle. The
outcome index, reuse-ledger derivation, and roundabout detection already cover
all data regardless of where a skill lives.

**Safety:** `run_claim` runs the claim with the skill dir as `cwd`, a timeout,
and **no network**. Declared commands are restricted to a safe subset
(read-only commands, test runners); anything else returns `inconclusive` rather
than executing. Live re-execution sandboxing is explicitly limited here to keep
side effects bounded.

### shortcuts.py — Loop 2 (efficiency)

```python
DEFAULT_CONFIG = {...}  # roundabout_help_depth, roundabout_error_run, etc.

def detect_roundabouts(index, *, recent_sessions: int, config: dict) -> list[dict]
    # Scan recent sessions' ordered tool_outcome rows for expensive-discovery
    # patterns:
    #   (a) help-chain: >= roundabout_help_depth consecutive --help/-h probes
    #       before the working command.
    #   (b) error-run:  >= roundabout_error_run consecutive error-status tool
    #       calls immediately before a completed one with the same tool.
    # Returns [{session_id, kind, start_seq, end_seq, tool, cost_tokens,
    #           golden_command}] where cost_tokens = Σ step_cost between the
    #           markers, and golden_command is the input of the successful
    #           terminal call.

def session_token_cost(index, session_id, start_seq, end_seq) -> int
def cmd_shortcuts_detect(args)   # --recent N | --dry-run
def cmd_shortcuts_list(args)     # list detected candidates awaiting promotion
```

**Promotion is gated by Loop 1.** A detected golden command is *not* auto-added
as a skill. It is staged as a candidate; `falsify.verify_skill` must confirm
the direct command still works (deterministic check) before the candidate is
handed to the existing reviewer capture path (`skill create/patch` or
`memory add` — signal #7). This reuses Loop 1 as Loop 2's safety layer and
stops lucky one-off commands from hardening into bad shortcuts.

### inspector UI + composer integration

- `inspector_server.py` gains `/api/procedures` (per-skill verdict + reuse
  count + method) and `/api/shortcuts` (detected candidates with est.
  tokens-saved). The overview gains a "failing procedures" count.
- The memory **composer** is unaffected (skills are loaded on demand, not
  injected wholesale like memory); the `verdicts.json` is read by the curator
  and the inspector only.

## CLI Commands (added to `autolearn.py`)

Three top-level nouns, parallel to `retention` / `topics`:

| Command | Description |
|---------|-------------|
| `outcomes init [--full]` | Build/update the outcome index from opencode.db |
| `outcomes status` | Index size, coverage, gt-strength histogram |
| `falsify run [--id NAME \| --all] [--dry-run]` | Verify skills; write verdicts; auto-demote fails |
| `falsify verdicts` | Print the per-skill verdict ledger |
| `shortcuts detect [--recent N] [--dry-run]` | Detect roundabout paths; stage golden-path candidates |
| `shortcuts list` | List staged candidates awaiting promotion |

## Integration

- **Reviewer (SKILL.md):** a new step runs `falsify verdicts` / `shortcuts
  list` to surface failing procedures and staged shortcuts for action (patch,
  promote, or dismiss). Keeps the reviewer thin; expensive work stays in the
  curator.
- **Curator:** `curator run` now (1) calls `outcomes index` (cheap incremental),
  (2) calls `falsify run` to refresh verdicts + apply demotions, (3) writes
  repaired `use_count`s to `.usage.json`. The existing decay-based memory
  eviction is untouched.
- **improve.py:** unchanged in mechanism; its "conflicting rules → retire the
  loser" policy is the model for `falsify`'s consequence layer. (One
  contradiction engine per artifact: improve.py owns AGENTS.md rules; falsify
  owns skill verdicts. No duplication.)

## Error Handling

| Condition | Behaviour |
|-----------|-----------|
| `opencode.db` missing | `outcomes init` prints a message and exits 1 (like `search init`). |
| `outcomes.db` missing on query | Treat as empty index; return empty lists, do not crash. |
| Corrupt part JSON | Skip the part, log to `debug.log`, continue. |
| Test suite / declared command times out | `verdict: inconclusive`, evidence notes the timeout. |
| Declared command not in safe subset | `inconclusive` (never executed). |
| Skill dir missing scripts/ | `method: none`, `verdict: inconclusive`. |

## Edge Cases

1. **A skill with both a test suite and a `verify:` block** — the declared
   block wins (the author's exact command, with deps/ignores, is trusted over
   the bare test-suite heuristic); the test suite is noted but not run.
2. **Non-deterministic tests** — a single fail is enough to demote (fail_count
   reaches threshold on first failure). Pinned skills (`pinned: true` in
   `.usage.json`) are exempt from auto-demote (flagged only), matching the
   curator's existing pin exemption.
3. **Roundabout with no terminal success** — recorded with `golden_command:
   null`; surfaced as a pure-cost finding, never promoted.
4. **`use_count` repair vs. manual edits** — the derived count is authoritative
   (it reflects actual loads); manual edits to `use_count` are overwritten on
   the next curator run.

## Dependencies

- **Python ≥3.11** (already required), stdlib only for all modules.
- **python-slugify** (already a dep) where needed.
- No new third-party dependencies. No embeddings, no vector store.

## Build Order (dependency-aware)

1. `outcomes.py` + tests (spine; both loops depend on it). **Freezes the
   `OutcomeIndex` query API before step 2–3 start.**
2. `falsify.py` + tests (Loop 1).
3. `shortcuts.py` + tests (Loop 2).
4. `autolearn.py` subparser wiring + `set_persona` `OUTCOMES_DB` path + curator
   integration (single integration pass).
5. inspector UI endpoints.

Steps 2 and 3 are file-disjoint after step 1 freezes the `outcomes.py` API, and
may be implemented by parallel subagents.

## Related Documents

- [High-Level Design](../../high-level-design.md) (Decisions 10–12, new feature rows)
- [Certified Procedures EARS](./certified-procedures-EARS.md)
- [Session Search LLD](../session-search/LLD.md) (the index pattern this mirrors; DD1/DD2/DD4)
- [Skill Management LLD](../skill-management/LLD.md) (`.usage.json`, the reuse ledger)
- [Review Agent LLD](../review-agent/LLD.md) (the signal taxonomy reused for `gt_strength` corrections)
