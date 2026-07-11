# Review Agent - Low-Level Design

**Created**: 2026-06-05
**HLD Link**: ../high-level-design.md

## Overview

The autolearn-reviewer is an OpenCode agent + skill that receives formatted conversation markdown, evaluates it for learning opportunities, and takes immediate action: recording observations, updating memory and user profile, and creating or patching skills.

## Context

Per the HLD, the reviewer is spawned as a subprocess by the plugin. It runs with the `AUTOLEARN_REVIEWER=1` environment variable, which tells the plugin to skip hook registration (preventing recursive review spawning). The reviewer is a hidden agent defined in `opencode.json` with restricted permissions.

## Agent Configuration

```json
{
  "autolearn-reviewer": {
    "description": "Reviews past conversations for self-improvement opportunities",
    "hidden": true,
    "steps": 20,
    "prompt": "Load the autolearn-reviewer skill and follow its instructions...",
    "permission": {
      "bash": "allow",
      "read": "allow",
      "glob": "allow",
      "grep": "allow",
      "write": "allow",
      "edit": "deny",
      "webfetch": "deny",
      "task": "deny",
      "skill": "allow",
      "external_directory": "allow"
    }
  }
}
```

Key constraints:
- **20 steps max**: Prevents runaway review sessions
- **edit: deny**: Reviewer writes via CLI tools, not direct file edits
- **task: deny**: No subagent spawning from within reviews
- **webfetch: deny**: No network access during reviews

## Review Input Format

The reviewer receives a markdown document via `opencode run`:

```markdown
# Autolearn Review

## Context

- Project: my-project
- Date: 2026-06-05T10:30:00.000Z
- Turns in this review: 10

## Instructions

Review the conversation below for learning opportunities.
Load the autolearn-reviewer skill with: skill({ name: "autolearn-reviewer" })

Focus on:
1. User corrections (style, approach, tools)
2. User preferences expressed
3. Workarounds or techniques that worked
4. Skills that were wrong, incomplete, or outdated
5. Repeated patterns worth capturing

## Conversation

### User

<message text>

### Assistant

<message text>

...

---

Take action now.
```

## Signal Classification

The reviewer classifies conversation signals into three tiers:

### Strong Signals (always act)

1. User corrections: "don't do X", "use Y instead", "that's wrong"
2. Explicit preferences: "I prefer X", "always do Y", "from now on, Z"
3. Declarative workflow specifications: statements where the user describes
   how they want a recurring task to work, even without an explicit "I prefer"
   marker — e.g., "they should be one post one week", "we don't use global pip
   anywhere here", "LinkedIn should follow Bluesky schedule"
4. Frustration about repetition: "again?", "I keep telling you"
5. Explicit instruction to remember: "remember this", "write that down"
6. Workarounds that worked: non-obvious techniques that resolved an issue
6a. Failure diagnoses with root cause: dead-end paths stated with all three
    of trigger condition + root cause + fix/workaround. The inverse of #6 —
    captures WHY something didn't work. A bare "X is broken" stays excluded
    (no condition/cause/fix → hardens into a refusal).

### Moderate Signals (act if seen more than once)

7. Tool choice patterns
8. Code style preferences
9. Workflow patterns
10. Skill gaps

### Weak Signals (record but don't create skills)

11. Contextual facts
12. Environment details

### Excluded

- One-time task instructions
- Clarification questions
- Normal conversational flow
- Environment-dependent failures
- **Bare** negative claims about tools that could harden into refusals (e.g., "X is broken").
  **Conditionalized failure diagnoses** (condition + root cause + workaround) are NOT excluded --
  they are captured as strong signal #6a (RA-CE-010a). (Refined 2026-07-11)

## Action Protocol

### Step 1: Evaluate

Read the conversation. For each message pair, check against signal list. Also check meta-patterns: review cascades, previous "nothing to record" conclusions followed by user pushback, operational debugging knowledge.

**Generalization rule:** When the user states a rule with system-wide or project-wide scope ("anywhere", "on my system", "always"), record the general rule, not the specific instance.

**Coverage check:** Before concluding "nothing to record", re-read each user message and confirm each was either acted upon or consciously classified as below threshold. Quiet preferences (declarative specs without correction markers) are easy to miss — do not skip a user message solely because it isn't a correction.

### Step 2: Search Past Sessions (before concluding "nothing to record")

Search past conversations for related patterns that may not have been promoted to memory.

```bash
uv run $HOME/.agents/skills/autolearn-reviewer/scripts/autolearn.py search query "<key terms>"
```

### Step 3: Record Observations

Record corrections and recurring preferences in the behavioral-rule store with
`improve.py observe`, then capture the corresponding durable memory, user-profile, or
skill update in Steps 4–6. The `self-improving-agent` skill owns cross-project rule
tracking and escalation to `AGENTS.md`; rules should be phrased as imperatives.

### Step 4: Update Memory

```bash
uv run $HOME/.agents/skills/autolearn-reviewer/scripts/autolearn.py memory add "<lesson>"
```

### Step 5: Update User Profile

```bash
uv run $HOME/.agents/skills/autolearn-reviewer/scripts/autolearn.py user add "<preference>"
```

### Step 6: Create or Patch Skills

```bash
# New skill
uv run $HOME/.agents/skills/autolearn-reviewer/scripts/autolearn.py skill create <name> "<description>"

# Patch existing
uv run $HOME/.agents/skills/autolearn-reviewer/scripts/autolearn.py skill patch <name> "<section>" "<content>"
```

Preference order: PATCH existing > ADD section to umbrella > CREATE new.

### Step 7: Log Review Outcome

```bash
# If something was recorded:
uv run $HOME/.agents/skills/autolearn-reviewer/scripts/autolearn.py log review-complete \
  --observations <N> --memory-updated --user-profile-updated \
  --skills-created <N> --skills-patched <N> --topics "<comma-separated>"

# If nothing was recorded:
uv run $HOME/.agents/skills/autolearn-reviewer/scripts/autolearn.py log review-complete --nothing
```

This creates an audit trail in observations.jsonl for detecting systematic capture gaps.

## Safety Rules

- Never modify project source code (only write to `~/.autolearn/`)
- Never write secrets, API keys, or credentials
- Max 2 new skills per review
- The memory + user registries are unbounded — entries leave only via
  Ebbinghaus decay (cold past `eviction_grace_days`, default 90), not a
  character cap. Prefer `memory strengthen` over `memory add` for semantic
  duplicates to keep the registry clean and the reinforcement signal accurate.
- If unsure about signal strength, lean toward not recording

## Review Output

```
Autolearn review complete:
- Observations recorded: N
- Memory updated: yes/no
- Skills created: N
- Skills patched: N
- User profile updated: yes/no
```

Or if nothing found:

```
Autolearn review complete: nothing to record.
```

## Edge Cases

1. **Review of a review**: Buffer depth guard in plugin prevents this; reviewer never sees review content.
2. **Conversation with no learning signals**: Valid outcome — output "nothing to record."
3. **Registry at scale**: the memory + user registries are unbounded; entries
   leave only via Ebbinghaus decay (cold past `eviction_grace_days`), so there
   is no "full" state. Run `retention score` periodically to refresh tiers.
4. **Skill creation failure (duplicate)**: CLI exits with error; reviewer should handle gracefully.
5. **Empty conversation**: Plugin won't spawn review if buffer is empty.

## Dependencies

- **autolearn.py**: CLI for memory, user profile, skill management, search, and outcome logging
- **autolearn-reviewer SKILL.md**: Instructions loaded at review time
- **autolearn-curator SKILL.md**: Loaded by scheduled curator jobs (not by reviewer directly)

## Related Documents

- [High-Level Design](../../high-level-design.md)
- [Conversation Evaluation EARS](./conversation-evaluation-EARS.md)
- [Action Execution EARS](./action-execution-EARS.md)
