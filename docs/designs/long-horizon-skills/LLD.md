# Long-Horizon Skill Loop - Low-Level Design

**Created**: 2026-07-19
**HLD Link**: ../../high-level-design.md

## Overview

Shifts skill creation from **reactive-per-session** (myopic, wasteful) to
**evidence-driven-cross-session**, and closes the loop by pruning skills that
never get used. Two halves on the existing Certified Procedures substrate:

- **Half 1 — Proposer.** Study many sessions; cluster by user-request +
  resolution; recurring clusters **stage a proposal**; a proposal
  **auto-promotes to a skill only when its common resolution passes
  falsification** (deterministic verification).
- **Half 2 — Pruner.** The curator auto-archives skills with `use_count == 0`
  past a long grace period (using the repaired `use_count`).

And the integration that fixes the myopia at its source: the reviewer's
`skill create` is **hard-gated** — it may not create a new skill unless the
proposer confirms the pattern recurs across sessions; otherwise it records a
memory or strengthens an existing skill.

```
search.db (user text) + outcomes.db (tool calls) + shortcuts (golden cmd)
        │
        ▼
proposer.py
  scan()        ── cluster recent sessions by request_signature + resolution;
                   clusters >= M sessions -> stage a proposal (proposals.json)
  verify()      ── run falsify on each proposal's common_resolution
  promote()     ── auto-create the skill when falsification passes
  is_recurrent()── the reviewer's hard-gate check (CLI: proposals recurrence)
        │
        ▼
existing skill create  ←  promotions only (no per-session myopic creation)

curator (extended)
  unused pruner ── use_count==0 + age > grace -> auto-archive
```

## Context — what this replaces

Today the reviewer evaluates one session slice at a time (the plugin buffers
the current session and spawns a review on that slice). Step 3's `search query`
is a *lookup* ("have I seen this before?"), not a *synthesis*. Step 7 creates
skills from what is visible in one conversation, with anti-proliferation guards
that are starved of signal (until #8, `use_count` was always 0). The result is
a pile of narrow, often-unused skills and no feedback loop to prune them.

This loop adds the missing long-horizon synthesis (proposer) and the missing
usage feedback (pruner), and makes the proposer the gatekeeper for creation.

## Data Models

### `proposals.json` (persona-local; not synced)

JSON object keyed by stable proposal id (hash of `request_signature`).

| Field | Type | Description |
|-------|------|-------------|
| id | string | `sha1(request_signature)[:16]`. |
| request_signature | string | `shift.topic_signature(first_substantive_user_msg)` hash. |
| request_summary | string | Up to N tokens of a representative user message (display). |
| common_resolution | string \| null | Modal successful bash command across the cluster (the candidate procedure), or null if none consistent. |
| session_ids | string[] | Sessions in the cluster. |
| sessions_count | int | `len(session_ids)`. |
| est_tokens_saved | int | Summed roundabout cost across the cluster (0 if none). |
| first_seen / last_seen | string | ISO date of earliest/latest session in the cluster. |
| status | `"pending"` \| `"promoted"` \| `"dismissed"` | Lifecycle. |
| verified | bool \| null | Falsify verdict on `common_resolution` (null = not run / not falsifiable). |
| promoted_skill | string \| null | Skill name created on promotion. |
| updated_at | string | ISO datetime of last scan/verify. |

### Config additions (`config.yaml`)

```yaml
proposer_recent_sessions: 50     # sessions scanned per pass
proposer_min_sessions: 3         # cluster size to become a proposal
proposer_verify_timeout_s: 60    # falsify timeout for common_resolution
unused_grace_days: 60            # use_count==0 + age > this -> auto-archive
```

## Component APIs

`proposer.py` imports `outcomes`, `shortcuts`, `falsify`, `shift` (siblings) —
no `autolearn.py` import. It opens `search.db` and `outcomes.db` read-only
directly (both are persona-local sqlite files).

```python
DEFAULT_CONFIG = {...}

def _load_proposals(persona_dir) -> dict
def _save_proposals(persona_dir, proposals) -> None

def _session_request(search_db, session_id) -> tuple[str, str] | None
    # (request_signature, request_summary) from the first substantive user msg

def _session_resolution(outcomes_idx, session_id) -> str | None
    # the last successful bash command in the session (candidate procedure)

def scan(persona_dir, *, config) -> dict
    # cluster recent sessions; refresh proposals.json; return counts.
    # Promotes nothing — promotion is a separate, falsify-gated step.

def verify_pending(persona_dir, *, config) -> dict
    # for each pending proposal with a common_resolution, run
    # falsify.run_claim (declared, safe-subset); set `verified`.

def promote_ready(persona_dir) -> list[dict]
    # return pending proposals with verified == True (auto-promote candidates).

def is_recurrent(persona_dir, request_text, *, config) -> dict
    # {recurrent: bool, sessions_count: int} — the reviewer's hard-gate check.

def cmd_proposals_list(args)
def cmd_proposals_recurrence(args)
def cmd_proposals_confirm(args)   # manual override (force-promote)
def cmd_proposals_dismiss(args)
```

**Promotion is performed by `autolearn.py`** (which owns `skill create`),
consuming `promote_ready()`: for each ready proposal, build a minimal SKILL.md
(name from the resolution, description from the request summary, a `verify:`
block carrying the common_resolution), run `skill create`, then mark the
proposal `promoted`.

**Honest auto-promote scope:** a proposal auto-promotes only when its
`common_resolution` is falsifiable — i.e. in falsify's safe subset (test-runner
/ self-contained command) AND it passes. Proposals whose resolution is not
safely falsifiable (e.g. a bare `make build` with no neutral cwd) stay
`pending` for manual `proposals confirm`. Auto-promote never runs unsafe
commands.

## Pruner (curator extension)

In `cmd_curator_run`, after `repair_skill_use_counts()`:

```python
for name, meta in usage.items():
    if meta.get("state") == "archived" or meta.get("pinned"):
        continue
    if meta.get("created_by") != "autolearn":
        continue
    use_count = int(meta.get("use_count") or 0)
    age_days = (today - created_at).days
    if use_count == 0 and age_days > config["unused_grace_days"]:
        archive(name, reason="unused")  # existing archive flow
        transitions["archived"].append(name)
```

The existing time-staleness path (30 / 90 days) is unchanged; the unused path
is an additional, independent trigger.

## Reviewer integration (hard gate)

`skills/autolearn-reviewer/SKILL.md` Step 7 gains, before any `skill create`:

```bash
uv run ... autolearn proposals recurrence "<key terms of the pattern>"
```

If the result is `recurrent: false` (or the cluster is below
`proposer_min_sessions`), **the reviewer MUST NOT create a new skill** — it
records a memory or strengthens an existing skill instead. This makes the
proposer the gatekeeper for new-skill creation.

## CLI Commands (added to `autolearn.py`)

| Command | Description |
|---------|-------------|
| `proposals list` | List pending/promoted/dismissed proposals |
| `proposals recurrence "<text>"` | The hard-gate check (prints `recurrent=true/false`) |
| `proposals confirm <id>` | Manually force-promote a pending proposal |
| `proposals dismiss <id>` | Mark a proposal dismissed |

The curator runs `proposals scan` + `verify_pending` + auto-promote on each
weekly run (best-effort, like the other CP steps).

## Inspector

`/api/proposals` (pending + recently promoted) and a "unused skills" count in
the overview, fed by the pruner signal.

## Error Handling

| Condition | Behaviour |
|-----------|-----------|
| `search.db` missing (never indexed) | scan returns empty; no proposals; no crash. |
| `outcomes.db` missing | scan returns empty; reviewer hard-gate answers `recurrent=false` (fail-safe: don't block on missing index). |
| `common_resolution` unsafe / not in safe subset | `verified` stays null; proposal stays pending (no auto-promote). |
| Falsify times out | `verified=false`; proposal stays pending. |
| `skill create` collision (name exists) | promotion skipped, proposal marked promoted anyway (skill already present). |

## Edge Cases

1. **A cluster whose sessions have inconsistent resolutions** — `common_resolution` is null; the proposal is recorded (the recurrence is real signal) but cannot auto-promote; surfaced for manual review.
2. **Proposal for a skill that already exists** — `promote_ready` skips if a skill with the derived name already exists; marks the proposal `promoted`.
3. **Pruner vs. a freshly-created skill** — `unused_grace_days` (60) is longer than the time it takes the proposer to surface recurrence, so a newly-created skill has a runway to accrue `use_count` before becoming prune-eligible.
4. **Reviewer hard-gate on a genuinely novel-but-valuable procedure** — the reviewer records it as a memory; if it recurs in later sessions, the proposer will stage it and auto-promote. Nothing is lost; creation is just deferred until evidence accumulates.

## Dependencies

Python ≥3.11, stdlib only for `proposer.py`. Reuses `outcomes`, `shortcuts`,
`falsify`, `shift`. No new third-party deps.

## Build Order

1. `proposer.py` + tests (scan / is_recurrent / verify_pending / promote_ready).
2. `autolearn.py` wiring (`proposals` subcommand + curator scan/verify/promote + pruner).
3. Reviewer SKILL.md Step 7 hard-gate.
4. Inspector `/api/proposals` + overview count.
5. HLD update (decisions + feature rows).

## Related Documents

- [High-Level Design](../../high-level-design.md)
- [Certified Procedures LLD](../certified-procedures/LLD.md) (the substrate this rides on)
- [Skill Management LLD](../skill-management/LLD.md) (the `.usage.json` lifecycle this extends)
- [Review Agent LLD](../review-agent/LLD.md) (Step 7, the creation point this gates)
