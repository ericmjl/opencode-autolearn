# opencode-autolearn

Self-improvement engine for [OpenCode](https://opencode.ai). Learns from your conversations, captures corrections and preferences, and escalates behavioral rules so your coding agent improves over time.

## How it works

1. **Conversation monitoring** — A plugin hooks into OpenCode events, counting turns and buffering messages (with secret redaction).
2. **Review spawning** — At configurable turn thresholds, on idle, or on exit, the plugin spawns a review subagent in a detached subprocess.
3. **Learning extraction** — The review agent evaluates conversations for corrections, preferences, workarounds, and patterns. It records observations, updates persistent memory, and creates or patches skills.
4. **Skill discovery** — Agent-created skills are symlinked into `~/.agents/skills/` so OpenCode auto-discovers them.

```
OpenCode session
  └─ autolearn.js plugin (turn counting, buffering)
       ├─ threshold reached? ──→ spawn review subprocess
       ├─ session idle? ──────→ spawn review subprocess
       └─ process exit? ──────→ spawn review subprocess
                                     │
                            autolearn-reviewer agent
                                     │
                      ┌──────────────┼──────────────┐
                      │              │              │
                  memory.md    user-profile.md   skills/
                  (loaded      (preferences)    (symlinked to
                   into every                    ~/.agents/skills/)
                   session)
```

## Install

### One-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/ericmjl/opencode-autolearn/main/install.sh | bash
```

This copies the plugin, installs the skills, patches your `opencode.json`, and initializes the store.

### Manual install

```bash
git clone https://github.com/ericmjl/opencode-autolearn.git
bash opencode-autolearn/install.sh
```

### What the installer does

1. Copies `plugin/autolearn.js` to `~/.config/opencode/plugins/`
2. Copies `skills/autolearn-reviewer`, `skills/autolearn-curator`, and `skills/self-improving-agent` to `~/.agents/skills/`
3. Patches `~/.config/opencode/opencode.json` to register the plugin, instructions, and reviewer agent
4. Runs `autolearn.py init` to create `~/.autolearn/` with defaults

### Verify

After installing, restart OpenCode. The plugin activates automatically. You can confirm by running:

```bash
uv run ~/.agents/skills/autolearn-reviewer/scripts/autolearn.py memory list
```

### Manual opencode.json config

If you prefer to edit `~/.config/opencode/opencode.json` yourself, the installer adds:

```json
{
  "plugin": ["./plugins/autolearn.js"],
  "instructions": ["~/.autolearn/memory.md"],
  "agent": {
    "autolearn-reviewer": {
      "description": "Reviews past conversations for self-improvement opportunities",
      "hidden": true,
      "steps": 20,
      "prompt": "Load the autolearn-reviewer skill and follow its instructions to review the attached conversation for learning opportunities. Take immediate action: record observations, update memory, create or patch skills.",
      "permission": {
        "bash": "allow", "read": "allow", "glob": "allow", "grep": "allow",
        "write": "allow", "edit": "deny", "webfetch": "deny", "task": "deny",
        "skill": "allow", "external_directory": "allow"
      }
    }
  }
}
```

## Dependencies

- **[uv](https://docs.astral.sh/uv/)** — runs the Python CLI scripts with inline dependency resolution (no venv needed)
- **[Bun](https://bun.sh)** — runtime for the plugin (bundled with OpenCode)
- **Python ≥3.11** — for `autolearn.py` (dependencies resolved automatically via PEP 723 metadata)

## Configuration

Config lives at `~/.autolearn/config.yaml`:

```yaml
review_threshold: 5          # assistant turns between reviews
session_review_on_idle: true  # spawn review on session idle
max_conversation_buffer: 50   # max messages in buffer
curator_interval_days: 7      # how often to run curator
stale_after_days: 30          # days before skill → stale
archive_after_days: 90        # days before skill → archived
escalation_threshold: 3       # reinforcement count before curator suggests promotion to AGENTS.md
```

## CLI reference

```bash
# Initialize the autolearn store
uv run ~/.agents/skills/autolearn-reviewer/scripts/autolearn.py init

# Memory (loaded into every session)
uv run ... autolearn.py memory add "Use uv tool for Python CLI tools, never pip3 install"
uv run ... autolearn.py memory list
uv run ... autolearn.py memory strengths
uv run ... autolearn.py memory strengthen <keyword>
uv run ... autolearn.py memory weaken <keyword>
uv run ... autolearn.py memory remove <keyword>

# User profile (communication/workflow preferences)
uv run ... autolearn.py user add "Prefers concise responses"
uv run ... autolearn.py user list
uv run ... autolearn.py user remove <keyword>

# Skills
uv run ... autolearn.py skill create <name> "<description>"
uv run ... autolearn.py skill patch <name> <section> "<content>"
uv run ... autolearn.py skill archive <name>
uv run ... autolearn.py skill list
uv run ... autolearn.py skill usage

# Curator (lifecycle management)
uv run ... autolearn.py curator run
uv run ... autolearn.py curator status
```

## Data layout

```
~/.autolearn/
├── config.yaml              # thresholds and flags
├── memory.md                # persistent lessons (loaded into every session)
├── user-profile.md          # user preferences
├── observations.jsonl       # event log (auto-trimmed to 1000 lines)
├── strengths.json           # reinforcement counters per memory entry
├── reviews/                 # generated review markdown files
│   └── review-{timestamp}.md
├── skills/                  # agent-created skills (real location)
│   ├── {skill-name}/
│   │   └── SKILL.md
│   ├── .archive/            # archived skills
│   └── .usage.json          # skill usage telemetry
└── .curator_state.json      # curator run history

~/.agents/skills/
├── autolearn-reviewer/      # installed skill (you copied this)
├── autolearn-curator/       # installed skill (you copied this)
├── self-improving-agent/    # installed skill (behavioral rule tracker)
│   └── scripts/improve.py   # CLI for observe/escalate/stale
└── {learned-skill} → ~/.autolearn/skills/{learned-skill}/  # symlinks
```

## Design docs

Full design documentation lives in `docs/`:

- [`docs/high-level-design.md`](docs/high-level-design.md) — architecture, decisions, risk matrix
- [`docs/designs/`](docs/designs/) — 4 LLDs and 8 EARS specifications with full traceability

## Running the curator on a schedule

```bash
# Weekly curator via opencode-scheduler
opencode schedule "autolearn-curator" --cron "0 3 * * 0" \
  --agent autolearn-reviewer \
  --prompt "Load the autolearn-curator skill and run the curator."
```

## License

MIT
