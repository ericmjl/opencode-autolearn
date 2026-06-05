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
3. Frustration about repetition: "again?", "I keep telling you"
4. Explicit instruction to remember: "remember this", "write that down"
5. Workarounds that worked: non-obvious techniques that resolved an issue

### Moderate Signals (act if seen more than once)

6. Tool choice patterns
7. Code style preferences
8. Workflow patterns
9. Skill gaps

### Weak Signals (record but don't create skills)

10. Contextual facts
11. Environment details

### Excluded

- One-time task instructions
- Clarification questions
- Normal conversational flow
- Environment-dependent failures
- Negative claims about tools that could harden into refusals

## Action Protocol

### Step 1: Evaluate

Read the conversation. For each message pair, check against signal list. Also check meta-patterns: review cascades, previous "nothing to record" conclusions followed by user pushback, operational debugging knowledge.

### Step 2: Record Observations

```bash
uv run $HOME/.agents/skills/self-improving-agent/scripts/improve.py observe "<rule>" \
  --project <name> [--domain <domain>] [--context "<what happened>"]
```

Rules phrased as imperatives.

### Step 3: Update Memory

```bash
uv run $HOME/.agents/skills/autolearn-reviewer/scripts/autolearn.py memory add "<lesson>"
```

### Step 4: Update User Profile

```bash
uv run $HOME/.agents/skills/autolearn-reviewer/scripts/autolearn.py user add "<preference>"
```

### Step 5: Create or Patch Skills

```bash
# New skill
uv run $HOME/.agents/skills/autolearn-reviewer/scripts/autolearn.py skill create <name> "<description>"

# Patch existing
uv run $HOME/.agents/skills/autolearn-reviewer/scripts/autolearn.py skill patch <name> "<section>" "<content>"
```

Preference order: PATCH existing > ADD section to umbrella > CREATE new.

## Safety Rules

- Never modify project source code (only write to `~/.autolearn/` and `~/.agent-improvement/`)
- Never write secrets, API keys, or credentials
- Max 2 new skills per review
- Keep memory.md under 3000 characters
- Keep user-profile.md under 2000 characters
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
3. **Memory full**: CLI trims oldest entries automatically.
4. **Skill creation failure (duplicate)**: CLI exits with error; reviewer should handle gracefully.
5. **Empty conversation**: Plugin won't spawn review if buffer is empty.

## Dependencies

- **autolearn.py**: CLI for memory, user profile, skill management
- **improve.py** (external): Observation recording and escalation
- **autolearn-reviewer SKILL.md**: Instructions loaded at review time
- **autolearn-curator SKILL.md**: Loaded by scheduled curator jobs (not by reviewer directly)

## Related Documents

- [High-Level Design](../../high-level-design.md)
- [Conversation Evaluation EARS](./conversation-evaluation-EARS.md)
- [Action Execution EARS](./action-execution-EARS.md)
